import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getRootHubId, ROOT } from "./config.mjs";
import { parseJson, parseMarkdown } from "./parse.mjs";

export async function scanMemory(config) {
  const files = await walkFiles(config.paths.memory);
  const notes = [];
  const parseErrors = [];

  for (const filePath of files) {
    const raw = await readFile(filePath, "utf8");
    const filename = path.basename(filePath);
    const relPath = toPosix(path.relative(ROOT, filePath));

    try {
      const record = filePath.toLowerCase().endsWith(".json")
        ? parseJson(filename, raw, config.id.strategy)
        : parseMarkdown(filename, raw, config.id.strategy);

      notes.push({
        ...record,
        path: relPath,
      });
    } catch (error) {
      parseErrors.push({ path: relPath, message: error.message });
    }
  }

  notes.sort((a, b) => a.id.localeCompare(b.id) || a.path.localeCompare(b.path));
  applyLevels(notes, config);

  const ids = notes.map((note) => note.id);
  const idCounts = countBy(ids);
  const duplicates = Object.entries(idCounts)
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({
      id,
      count,
      paths: notes.filter((note) => note.id === id).map((note) => note.path),
    }));

  const knownIds = new Set(ids);
  const brokenLinks = [];
  for (const note of notes) {
    for (const target of note.links) {
      if (!knownIds.has(target)) {
        brokenLinks.push({ from: note.id, to: target, path: note.path });
      }
    }
  }

  const catalog = {
    generatedAt: new Date().toISOString(),
    notes,
  };

  const graph = buildGraph(notes, "knowledge");
  graph.generatedAt = catalog.generatedAt;

  return { catalog, graph, duplicates, brokenLinks, parseErrors };
}

export function graphForScope(notes, scope = "knowledge") {
  return buildGraph(notes, normalizeScope(scope));
}

export function searchNotes(notes, { query = "", tag = "" } = {}) {
  const q = query.trim().toLowerCase();
  const t = tag.trim().toLowerCase();

  return notes.filter((note) => {
    const tagMatch =
      !t || note.tags.some((item) => item.toLowerCase() === t);
    if (!tagMatch) return false;
    if (!q) return true;
    const haystack = `${note.title}\n${note.content}\n${note.tags.join(" ")}`.toLowerCase();
    return haystack.includes(q);
  });
}

export function isJournalNote(note) {
  if (!note) return false;
  if (String(note.type ?? "") === "journal") return true;
  return String(note.path ?? "").startsWith("memory/journal/");
}

function normalizeScope(scope) {
  return scope === "journal" ? "journal" : "knowledge";
}

function buildGraph(allNotes, scope) {
  const notes = allNotes.filter((note) =>
    scope === "journal" ? isJournalNote(note) : !isJournalNote(note),
  );
  const knownIds = new Set(notes.map((note) => note.id));

  const seenNodeIds = new Set();
  const nodes = [];
  for (const note of notes) {
    if (seenNodeIds.has(note.id)) continue;
    seenNodeIds.add(note.id);
    nodes.push({
      id: note.id,
      title: note.title,
      type: note.type,
      tags: note.tags,
      path: note.path,
      level: note.level ?? null,
      parent: note.parent || "",
    });
  }

  const seenEdges = new Set();
  const edges = [];
  for (const note of notes) {
    const targets = [...note.links];
    if (note.parent) targets.push(note.parent);
    for (const target of targets) {
      if (!knownIds.has(target) || target === note.id) continue;
      const key = [note.id, target].sort().join("--");
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      edges.push({ from: note.id, to: target });
    }
  }

  return {
    scope,
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
  };
}

function applyLevels(notes, config) {
  const knowledge = notes.filter((note) => !isJournalNote(note));
  const byId = new Map();
  for (const note of knowledge) {
    if (!byId.has(note.id)) byId.set(note.id, note);
  }

  const children = new Map();
  const addChild = (parentId, childId) => {
    if (!parentId || !childId || parentId === childId) return;
    if (!byId.has(parentId) || !byId.has(childId)) return;
    if (!children.has(parentId)) children.set(parentId, new Set());
    children.get(parentId).add(childId);
  };

  for (const note of knowledge) {
    if (note.parent) addChild(note.parent, note.id);
    for (const target of note.links) addChild(note.id, target);
  }

  const rootId = findRootId(knowledge, config);
  const computed = new Map();
  if (rootId) {
    computed.set(rootId, 1);
    const queue = [rootId];
    while (queue.length) {
      const id = queue.shift();
      const level = computed.get(id);
      for (const childId of children.get(id) ?? []) {
        if (computed.has(childId)) continue;
        computed.set(childId, level + 1);
        queue.push(childId);
      }
    }
  }

  for (const note of notes) {
    if (note.explicitLevel != null) {
      note.level = note.explicitLevel;
    } else if (computed.has(note.id)) {
      note.level = computed.get(note.id);
    } else {
      note.level = null;
    }
  }
}

function findRootId(notes, config) {
  const configured = getRootHubId(config);
  if (configured && notes.some((note) => note.id === configured)) return configured;
  const tagged = notes.find(
    (note) => note.tags.includes("root") || note.tags.includes("hub"),
  );
  if (tagged) return tagged.id;
  const explicit = notes.find((note) => note.explicitLevel === 1);
  return explicit?.id ?? "";
}

async function walkFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
    } else if (/\.(md|json)$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function toPosix(relPath) {
  return relPath.split(path.sep).join("/");
}

function countBy(items) {
  return items.reduce((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}
