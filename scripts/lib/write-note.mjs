import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { ROOT } from "./config.mjs";
import { asStringArray, parseLevel, slugify } from "./parse.mjs";

const DATE_NAME = /^\d{4}-\d{2}-\d{2}$/;

export async function createMarkdownNote(config, input) {
  const title = String(input.title ?? "").trim();
  if (!title) {
    throw Object.assign(new Error("Title is required"), { status: 400 });
  }

  const type = String(input.type ?? "note").trim() || "note";
  const tags = asStringArray(input.tags);
  const links = uniqueSlugs([
    ...asStringArray(input.links),
    input.linkFrom ?? "",
  ]);
  const content = String(input.body ?? input.content ?? "").trim();
  const updated = todayStamp();

  const isJournal = type === "journal";
  const folder = isJournal ? "journal" : "notes";
  const filename = isJournal ? journalFilename(title) : `${slugify(title)}.md`;

  if (!filename || filename === ".md") {
    throw Object.assign(new Error("Could not build a filename from the title"), {
      status: 400,
    });
  }

  const destDir = path.join(config.paths.memory, folder);
  const destPath = path.join(destDir, filename);

  if (await exists(destPath)) {
    throw Object.assign(new Error(`File already exists: ${folder}/${filename}`), {
      status: 409,
    });
  }

  const parent = slugify(input.parent || input.linkFrom || "");
  const level = parseLevel(input.level);

  const data = {
    title: isJournal && DATE_NAME.test(path.parse(filename).name)
      ? path.parse(filename).name
      : title,
    type,
    tags,
    updated,
  };
  if (links.length) data.links = links;
  if (parent) data.parent = parent;
  if (level != null) data.level = level;

  const markdown = matter.stringify(content ? `${content}\n` : "\n", data);
  await mkdir(destDir, { recursive: true });
  await writeFile(destPath, markdown, "utf8");

  return {
    path: `${folder}/${filename}`,
    id: path.parse(filename).name,
  };
}

export async function updateNote(config, note, input) {
  const destPath = resolveNoteFile(config, note.path);
  const title = String(input.title ?? note.title ?? "").trim();
  if (!title) {
    throw Object.assign(new Error("Title is required"), { status: 400 });
  }

  const type = String(input.type ?? note.type ?? "note").trim() || "note";
  const tags = asStringArray(input.tags ?? note.tags);
  const links = uniqueSlugs(asStringArray(input.links ?? note.links));
  const content = String(input.body ?? input.content ?? note.content ?? "").trim();
  const updated = todayStamp();
  const parent = input.parent !== undefined
    ? slugify(input.parent)
    : (note.parent || "");
  const level = input.level !== undefined
    ? parseLevel(input.level)
    : (note.explicitLevel ?? null);

  if (destPath.toLowerCase().endsWith(".json")) {
    const existing = JSON.parse(await readFile(destPath, "utf8"));
    const next = {
      ...existing,
      title,
      type,
      tags,
      links,
      updated,
      content,
    };
    if (!links.length) delete next.links;
    if (parent) next.parent = parent;
    else delete next.parent;
    if (level != null) next.level = level;
    else delete next.level;
    await writeFile(destPath, JSON.stringify(next, null, 2) + "\n", "utf8");
  } else {
    const raw = await readFile(destPath, "utf8");
    const parsed = matter(raw);
    const data = {
      ...parsed.data,
      title,
      type,
      tags,
      updated,
    };
    if (links.length) data.links = links;
    else delete data.links;
    if (parent) data.parent = parent;
    else delete data.parent;
    if (level != null) data.level = level;
    else delete data.level;
    await writeFile(
      destPath,
      matter.stringify(content ? `${content}\n` : "\n", data),
      "utf8",
    );
  }

  return { id: note.id, path: note.path };
}

export async function deleteNote(config, note) {
  const destPath = resolveNoteFile(config, note.path);
  try {
    await stat(destPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw Object.assign(new Error(`File not found: ${note.path}`), { status: 404 });
    }
    throw error;
  }
  await unlink(destPath);
  return { id: note.id, path: note.path };
}

export async function addLinkToNote(config, note, targetId) {
  const target = slugify(targetId);
  if (!target) return note;
  const links = uniqueSlugs([...(note.links ?? []), target]);
  return updateNote(config, note, {
    title: note.title,
    type: note.type,
    tags: note.tags,
    links,
    parent: note.parent,
    level: note.explicitLevel,
    body: note.content,
  });
}

export async function attachNoteToRoot(config, note, rootNote) {
  if (!rootNote) {
    const rootId = config.graph?.rootHub?.id ?? "memobrain-notes";
    throw Object.assign(new Error(`Root hub not found: ${rootId}`), {
      status: 404,
    });
  }
  await addLinkToNote(config, rootNote, note.id);
  return updateNote(config, note, {
    title: note.title,
    type: note.type,
    tags: note.tags,
    links: note.links,
    parent: rootNote.id,
    body: note.content,
  });
}

function resolveNoteFile(config, relPath) {
  const normalized = String(relPath ?? "").replace(/\\/g, "/").trim();
  if (!normalized) {
    throw Object.assign(new Error("Invalid note path"), { status: 403 });
  }

  const memoryRoot = path.resolve(config.paths.memory);
  let full;
  if (normalized.startsWith("memory/")) {
    full = path.resolve(ROOT, normalized);
  } else {
    full = path.resolve(memoryRoot, normalized);
  }

  const relative = path.relative(memoryRoot, full);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw Object.assign(new Error("Invalid note path"), { status: 403 });
  }
  return full;
}

function uniqueSlugs(values) {
  return [...new Set(asStringArray(values).map(slugify).filter(Boolean))];
}

function journalFilename(title) {
  const slug = slugify(title);
  if (DATE_NAME.test(slug)) return `${slug}.md`;
  return `${todayStamp()}.md`;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
