import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, getRootHubId, loadConfig } from "../lib/config.mjs";
import { writeIndex } from "../lib/index-io.mjs";
import { graphForScope, scanMemory, searchNotes } from "../lib/scan.mjs";
import {
  addLinkToNote,
  attachNoteToRoot,
  createMarkdownNote,
  deleteNote,
  updateNote,
} from "../lib/write-note.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const config = await loadConfig();

const server = createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (error) {
    const status = error.status ?? 500;
    if (wantsJson(req) || status >= 400) {
      json(res, status, { error: error.message || "Server error" });
      return;
    }
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error.message || "Server error");
  }
});

server.listen(config.server.port, config.server.host, () => {
  console.log(
    `memoBrain UI at http://${config.server.host}:${config.server.port}`,
  );
});

async function handle(req, res) {
  const url = new URL(req.url ?? "/", `http://${config.server.host}`);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/graph") {
    const result = await refreshIndex();
    const scope = url.searchParams.get("scope") || "knowledge";
    json(res, 200, {
      ...graphForScope(result.catalog.notes, scope),
      levelStyles: config.graph,
    });
    return;
  }

  if (req.method === "GET" && pathname === "/notes") {
    const result = await refreshIndex();
    const notes = searchNotes(result.catalog.notes, {
      query: url.searchParams.get("q") ?? "",
      tag: url.searchParams.get("tag") ?? "",
    });
    json(res, 200, { notes });
    return;
  }

  if (req.method === "GET" && pathname === "/search") {
    const result = await refreshIndex();
    const notes = searchNotes(result.catalog.notes, {
      query: url.searchParams.get("q") ?? "",
      tag: url.searchParams.get("tag") ?? "",
    });
    json(res, 200, { notes });
    return;
  }

  if (req.method === "GET" && pathname === "/note") {
    const id = url.searchParams.get("id") ?? "";
    const result = await refreshIndex();
    const note = result.catalog.notes.find((item) => item.id === id);
    if (!note) {
      json(res, 404, { error: `Note not found: ${id}` });
      return;
    }
    json(res, 200, { note });
    return;
  }

  if (req.method === "POST" && pathname === "/notes") {
    const body = await readJsonBody(req);
    const created = await createMarkdownNote(config, body);
    if (body.linkFrom) {
      const afterCreate = await scanMemory(config);
      const parent = afterCreate.catalog.notes.find(
        (item) => item.id === String(body.linkFrom),
      );
      if (parent) await addLinkToNote(config, parent, created.id);
    }
    await refreshIndex();
    json(res, 201, created);
    return;
  }

  if (req.method === "PUT" && pathname === "/note") {
    const id = url.searchParams.get("id") ?? "";
    const existing = await findNote(id);
    const body = await readJsonBody(req);
    const saved = await updateNote(config, existing, body);
    await refreshIndex();
    json(res, 200, saved);
    return;
  }

  if (req.method === "POST" && pathname === "/note/attach-root") {
    const id = url.searchParams.get("id") ?? "";
    const existing = await findNote(id);
    const result = await scanMemory(config);
    const root = result.catalog.notes.find(
      (item) => item.id === getRootHubId(config),
    );
    const saved = await attachNoteToRoot(config, existing, root);
    await refreshIndex();
    json(res, 200, saved);
    return;
  }

  if (req.method === "DELETE" && pathname === "/note") {
    const id = url.searchParams.get("id") ?? "";
    const existing = await findNote(id);
    const removed = await deleteNote(config, existing);
    await refreshIndex();
    json(res, 200, removed);
    return;
  }

  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  await serveStatic(res, pathname);
}

async function refreshIndex() {
  const result = await scanMemory(config);
  await writeIndex(config, result);
  return result;
}

async function findNote(id) {
  if (!id) {
    throw Object.assign(new Error("Note id is required"), { status: 400 });
  }
  const result = await scanMemory(config);
  const note = result.catalog.notes.find((item) => item.id === id);
  if (!note) {
    throw Object.assign(new Error(`Note not found: ${id}`), { status: 404 });
  }
  return note;
}

async function serveStatic(res, pathname) {
  if (pathname === "/vendor/vis-network.min.js") {
    const vendorPath = path.join(
      ROOT,
      "node_modules/vis-network/standalone/umd/vis-network.min.js",
    );
    const data = await readFile(vendorPath);
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(data);
    return;
  }

  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(requested).replace(/^[/\\]+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    json(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      json(res, 404, { error: "Not found" });
      return;
    }
    throw error;
  }
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function wantsJson(req) {
  const accept = req.headers.accept ?? "";
  return accept.includes("application/json");
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("Invalid JSON body"), { status: 400 });
  }
}
