import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { slugify } from "./parse.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, "../..");

const DEFAULT_GRAPH = {
  maxLevel: 3,
  rootHub: { id: "memobrain-notes", title: "memoBrain's notes" },
  levels: {
    1: { background: "#2d5a4a", border: "#1c3f34", label: "memoBrain's notes" },
    2: { background: "#3d6ea8", border: "#2a4d78", label: "level 2" },
    3: { background: "#c47b2b", border: "#8f5818", label: "level 3" },
    4: { background: "#7a6b8a", border: "#564b61", label: "level 4" },
    5: { background: "#5a8a6b", border: "#3d6149", label: "level 5" },
    6: { background: "#8a5a5a", border: "#613d3d", label: "level 6" },
    // 7: { background: "#6b5a8a", border: "#4a3d61", label: "level 7" },
    // 8: { background: "#8a7a5a", border: "#615539", label: "level 8" },
  },
  unassigned: { background: "#8a8478", border: "#5f5a52", label: "unassigned" },
  journal: { background: "#2d5a4a", border: "#1c3f34", label: "journal" },
};

export async function loadConfig() {
  const configPath = path.join(ROOT, "memory.config.yaml");
  const raw = await readFile(configPath, "utf8");
  const config = parseYaml(raw);

  const memoryRel = config.paths?.memory ?? "./memory";
  const indexRel = config.paths?.index ?? "./scripts/index";

  return {
    ...config,
    paths: {
      memory: path.resolve(ROOT, memoryRel),
      index: path.resolve(ROOT, indexRel),
      memoryRel,
      indexRel,
    },
    server: {
      host: config.server?.host ?? "127.0.0.1",
      port: Number(config.server?.port ?? 3333),
    },
    id: {
      strategy: config.id?.strategy ?? "filename",
      slugRules: config.id?.slugRules ?? "lowercase-dash",
      onDuplicate: config.id?.onDuplicate ?? "warn",
    },
    graph: normalizeGraphConfig(config.graph),
  };
}

export function normalizeGraphConfig(input = {}) {
  const maxLevel = clampMaxLevel(input.maxLevel ?? DEFAULT_GRAPH.maxLevel);
  const levels = {};
  for (let level = 1; level <= maxLevel; level += 1) {
    const fromConfig = input.levels?.[level] ?? input.levels?.[String(level)];
    const fallback = DEFAULT_GRAPH.levels[level] ?? DEFAULT_GRAPH.levels[8];
    levels[level] = normalizeStyle(fromConfig, fallback, `level ${level}`);
  }
  return {
    maxLevel,
    rootHub: {
      id: slugify(input.rootHub?.id ?? DEFAULT_GRAPH.rootHub.id),
      title: String(input.rootHub?.title ?? DEFAULT_GRAPH.rootHub.title),
    },
    levels,
    unassigned: normalizeStyle(input.unassigned, DEFAULT_GRAPH.unassigned, "unassigned"),
    journal: normalizeStyle(input.journal, DEFAULT_GRAPH.journal, "journal"),
  };
}

export function getRootHubId(config) {
  return config.graph?.rootHub?.id ?? DEFAULT_GRAPH.rootHub.id;
}

function normalizeStyle(value, fallback, defaultLabel) {
  return {
    background: String(value?.background ?? fallback.background),
    border: String(value?.border ?? fallback.border),
    label: String(value?.label ?? fallback.label ?? defaultLabel),
  };
}

function clampMaxLevel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_GRAPH.maxLevel;
  return Math.min(8, Math.max(1, Math.floor(number)));
}
