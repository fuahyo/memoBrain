# Agent access

memoBrain is a local knowledge base. Files are the source of truth. You do not need the UI server.

## How to read this repo

1. Read `memory.config.yaml` at the repo root for paths, ID rules, and **`graph.rootHub`** (the knowledge graph center).
2. Read files under `memory/`:
   - `memory/notes/` — evergreen Markdown notes
   - `memory/entities/` — one JSON object per file
   - `memory/journal/` — daily Markdown (`YYYY-MM-DD.md`)
   - `memory/projects/` — project registry (summary + `repoPath`)
3. Treat `scripts/index/catalog.json` and `scripts/index/graph.json` as a **cache**. Rebuild with `npm run sync` if they are missing or stale. Do not treat the index as source data.

## Schema

- One file = one node.
- Default ID = filename without extension. Optional frontmatter `id` is rare.
- Markdown: YAML frontmatter + body. `[[wiki-links]]` and frontmatter `links` are edges.
- JSON: the same fields as frontmatter, plus a `content` string.

## Rules

- Do not write unless the user explicitly asks you to save a file.
- Do not call a model. AI is off by default (`ai.enabled: false`).
- Do not depend on `http://127.0.0.1:3333`. That server is for humans only.
