import path from "node:path";
import matter from "gray-matter";

const WIKI_LINK = /\[\[([^\[\]]+)\]\]/g;

export function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function asStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function extractWikiLinks(text) {
  const links = [];
  const seen = new Set();
  const source = String(text ?? "");
  for (const match of source.matchAll(WIKI_LINK)) {
    const slug = wikiTargetSlug(match[1]);
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      links.push(slug);
    }
  }
  return links;
}

/** Remove [[wiki]] mentions that point at the given note ids. Keeps readable text. */
export function stripWikiLinks(text, ids) {
  const idSet = new Set((ids ?? []).map(slugify).filter(Boolean));
  if (!idSet.size) return String(text ?? "");
  return String(text ?? "").replace(WIKI_LINK, (full, inner) => {
    const slug = wikiTargetSlug(inner);
    if (!idSet.has(slug)) return full;
    const label = String(inner).split("|")[0].trim();
    return label || slug;
  });
}

export function wikiTargetSlug(inner) {
  const raw = String(inner ?? "");
  const parts = raw.split("|");
  const target = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return slugify(target);
}

export function resolveId(filename, data, strategy = "filename") {
  const fromFile = slugify(path.parse(filename).name);
  const fromFrontmatter = data?.id ? slugify(data.id) : "";
  if (strategy === "frontmatter" && fromFrontmatter) return fromFrontmatter;
  if (fromFrontmatter) return fromFrontmatter;
  return fromFile;
}

export function parseMarkdown(filename, raw, strategy = "filename") {
  const parsed = matter(raw);
  const data = parsed.data ?? {};
  const content = String(parsed.content ?? "").trim();
  return normalizeRecord(filename, data, content, strategy);
}

export function parseJson(filename, raw, strategy = "filename") {
  const data = JSON.parse(raw);
  if (Array.isArray(data) || data === null || typeof data !== "object") {
    throw new Error(`${filename}: JSON must be one object per file`);
  }
  const content = String(data.content ?? "").trim();
  return normalizeRecord(filename, data, content, strategy);
}

function normalizeRecord(filename, data, content, strategy) {
  const links = asStringArray(data.links).map(slugify).filter(Boolean);
  const wikiLinks = extractWikiLinks(content);
  const parent = data.parent ? slugify(stringifyScalar(data.parent)) : "";
  const explicitLevel = parseLevel(data.level);

  return {
    id: resolveId(filename, data, strategy),
    title: stringifyScalar(data.title) || path.parse(filename).name,
    type: data.type ? String(data.type) : "note",
    tags: asStringArray(data.tags),
    links,
    wikiLinks,
    parent,
    explicitLevel,
    updated: stringifyScalar(data.updated),
    repoPath: data.repoPath ? String(data.repoPath) : "",
    content,
  };
}

export function parseLevel(value) {
  if (value === undefined || value === null || value === "") return null;
  if (value === "auto") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return null;
  return Math.min(8, Math.floor(number));
}

function stringifyScalar(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}
