const emptyEl = document.querySelector("#graph-empty");
const noteForm = document.querySelector("#note-form");
const linkedForm = document.querySelector("#linked-form");
const notePathEl = document.querySelector("#note-path");
const noteLevelEl = document.querySelector("#note-level");
const noteLevelSelect = document.querySelector("#note-level-select");
const noteStatus = document.querySelector("#note-status");
const linkedStatus = document.querySelector("#linked-status");
const linkedHint = document.querySelector("#linked-hint");
const attachRootBtn = document.querySelector("#attach-root");
const legendEl = document.querySelector("#graph-legend");
const tabButtons = [...document.querySelectorAll(".scope-tab")];
const linkPicker = createLinkPicker(document.querySelector("#note-links"));
const noteBodyEl = document.querySelector("#note-body");
const notePreviewEl = document.querySelector("#note-preview");
const bodyTabs = [...document.querySelectorAll(".body-tab")];
let bodyTab = "edit";

bodyTabs.forEach((button) => {
  button.addEventListener("click", () => setBodyTab(button.dataset.bodyTab));
});

function setBodyTab(tab) {
  bodyTab = tab === "preview" ? "preview" : "edit";
  bodyTabs.forEach((button) => {
    const active = button.dataset.bodyTab === bodyTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (bodyTab === "preview") {
    notePreviewEl.innerHTML = renderMarkdown(noteBodyEl.value);
    noteBodyEl.hidden = true;
    notePreviewEl.hidden = false;
  } else {
    noteBodyEl.hidden = false;
    notePreviewEl.hidden = true;
  }
}

let levelStyles = defaultLevelStyles();
let rootHubId = "memobrain-notes";
let rootHubTitle = "memoBrain's notes";
let network;
let currentId = "";
let currentScope = "knowledge";
let currentGraph = { nodes: [], edges: [] };

tabButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const scope = button.dataset.scope;
    if (scope === currentScope) return;
    currentScope = scope;
    tabButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    currentId = "";
    resetDetail("Click a node to open its note.");
    await loadGraph();
  });
});

async function loadGraph(selectId = "") {
  const response = await fetch(`/graph?scope=${encodeURIComponent(currentScope)}`);
  const graph = await response.json();
  if (!response.ok) throw new Error(graph.error || "Could not load graph");
  levelStyles = graph.levelStyles ?? defaultLevelStyles();
  rootHubId = levelStyles.rootHub?.id ?? "memobrain-notes";
  rootHubTitle = levelStyles.rootHub?.title ?? "memoBrain's notes";
  fillLevelOptions();
  currentGraph = graph;
  renderLegend();
  await refreshLinkCatalog();

  if (network) {
    network.destroy();
    network = null;
  }

  const palette = buildPalette();
  const nodes = new vis.DataSet(
    (graph.nodes ?? []).map((node) => {
      const group = groupFor(node);
      const color = palette[group] ?? palette.unassigned;
      return {
        id: node.id,
        label: node.title || node.id,
        title: tooltipFor(node),
        group,
        color,
        size: nodeSizeFor(node.level),
      };
    }),
  );

  const edges = new vis.DataSet(
    (graph.edges ?? []).map((edge, index) => ({
      id: `${[edge.from, edge.to].sort().join("-")}-${index}`,
      from: edge.from,
      to: edge.to,
      arrows: "",
    })),
  );

  network = new vis.Network(
    document.querySelector("#network"),
    { nodes, edges },
    {
      physics: { stabilization: true },
      nodes: {
        shape: "dot",
        font: { face: "Segoe UI", size: 14, color: "#1f1a14" },
      },
      edges: {
        color: { color: "#b7ae9f" },
        smooth: { type: "continuous" },
      },
      interaction: { hover: true },
      groups: Object.fromEntries(
        Object.entries(palette).map(([key, color]) => [key, { color }]),
      ),
    },
  );

  network.on("click", async (params) => {
    const id = params.nodes[0];
    if (!id) return;
    await showNote(id);
  });

  if (selectId) {
    if (nodes.get(selectId)) network.selectNodes([selectId]);
    await showNote(selectId);
  }
}

async function showNote(id) {
  currentId = id;
  setStatus(noteStatus);
  setStatus(linkedStatus);
  const response = await fetch(`/note?id=${encodeURIComponent(id)}`);
  const data = await response.json();
  if (!response.ok) {
    resetDetail(data.error || "Note not found");
    return;
  }

  const note = data.note;
  emptyEl.hidden = true;
  noteForm.hidden = false;
  linkedForm.hidden = false;
  notePathEl.textContent = `${note.id} · ${note.path}`;
  noteForm.title.value = note.title ?? "";
  noteForm.type.value = note.type ?? "note";
  noteForm.tags.value = (note.tags ?? []).join(", ");
  const explicit = note.explicitLevel ?? null;
  noteLevelSelect.value =
    explicit != null ? String(explicit) : "";
  linkPicker.setExclude(note.id);
  linkPicker.setParent(note.parent || "");
  linkPicker.setValue(note.links ?? []);
  noteForm.body.value = note.content ?? "";
  setBodyTab("edit");
  linkedForm.reset();

  const graphNode = (currentGraph.nodes ?? []).find((item) => item.id === id);
  const level = graphNode?.level ?? note.level ?? null;
  if (currentScope === "knowledge") {
    noteLevelEl.hidden = false;
    noteLevelEl.textContent =
      explicit != null
        ? `${levelLabel(level)} · manual`
        : `${levelLabel(level)} · auto`;
    noteLevelSelect.disabled = false;
  } else {
    noteLevelEl.hidden = true;
    noteLevelSelect.disabled = true;
  }

  const childLevel = level ? level + 1 : null;
  linkedHint.textContent = childLevel
    ? `Creates a child note at level ${childLevel} and links it to this node.`
    : "Creates a new note and connects it to this node.";

  attachRootBtn.hidden = !(
    currentScope === "knowledge" &&
    level == null &&
    id !== rootHubId
  );
}

noteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentId) return;
  setStatus(noteStatus, "Saving…");
  try {
    const response = await fetch(`/note?id=${encodeURIComponent(currentId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: noteForm.title.value,
        type: noteForm.type.value,
        tags: noteForm.tags.value,
        links: linkPicker.getValue(),
        parent: linkPicker.getParent(),
        level: noteLevelSelect.value,
        body: noteForm.body.value,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Save failed");
    setStatus(noteStatus, "Saved");
    await loadGraph(currentId);
  } catch (error) {
    setStatus(noteStatus, error.message, true);
  }
});

document.querySelector("#delete-note").addEventListener("click", async () => {
  if (!currentId) return;
  if (!window.confirm(`Delete "${noteForm.title.value || currentId}" from disk?`)) {
    return;
  }
  setStatus(noteStatus, "Deleting…");
  try {
    const response = await fetch(`/note?id=${encodeURIComponent(currentId)}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Delete failed");
    currentId = "";
    resetDetail("Note deleted. Click another node.");
    await loadGraph();
  } catch (error) {
    setStatus(noteStatus, error.message, true);
  }
});

attachRootBtn.addEventListener("click", async () => {
  if (!currentId) return;
  setStatus(noteStatus, "Attaching…");
  try {
    const response = await fetch(
      `/note/attach-root?id=${encodeURIComponent(currentId)}`,
      { method: "POST" },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Attach failed");
    setStatus(noteStatus, `Linked under ${rootHubTitle}`);
    await loadGraph(currentId);
  } catch (error) {
    setStatus(noteStatus, error.message, true);
  }
});

linkedForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentId) return;
  setStatus(linkedStatus, "Creating…");
  const graphNode = (currentGraph.nodes ?? []).find((item) => item.id === currentId);
  const parentLevel = graphNode?.level ?? null;
  try {
    const payload = {
      title: linkedForm.title.value,
      type: currentScope === "journal" ? "journal" : "note",
      tags: linkedForm.tags.value,
      body: linkedForm.body.value,
      linkFrom: currentId,
      parent: currentId,
    };
    if (parentLevel) payload.level = parentLevel + 1;
    const response = await fetch("/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Create failed");
    setStatus(linkedStatus, `Created ${data.path}`);
    linkedForm.reset();
    await loadGraph(data.id);
  } catch (error) {
    setStatus(linkedStatus, error.message, true);
  }
});

function fillLevelOptions() {
  const maxLevel = levelStyles.maxLevel ?? 8;
  const current = noteLevelSelect.value;
  noteLevelSelect.replaceChildren();
  const auto = document.createElement("option");
  auto.value = "";
  auto.textContent = "Auto (from graph)";
  noteLevelSelect.append(auto);
  for (let level = 1; level <= maxLevel; level += 1) {
    const meta = levelStyles.levels?.[level];
    const option = document.createElement("option");
    option.value = String(level);
    option.textContent = meta?.label
      ? `${level} · ${meta.label}`
      : String(level);
    noteLevelSelect.append(option);
  }
  if ([...noteLevelSelect.options].some((item) => item.value === current)) {
    noteLevelSelect.value = current;
  }
}

function defaultLevelStyles() {
  return {
    maxLevel: 8,
    rootHub: { id: "memobrain-notes", title: "memoBrain's notes" },
    levels: {
      1: { background: "#2d5a4a", border: "#1c3f34", label: "memoBrain's notes" },
      2: { background: "#3d6ea8", border: "#2a4d78", label: "level 2" },
      3: { background: "#c47b2b", border: "#8f5818", label: "level 3" },
      4: { background: "#7a6b8a", border: "#564b61", label: "level 4" },
      5: { background: "#5a8a6b", border: "#3d6149", label: "level 5" },
      6: { background: "#8a5a5a", border: "#613d3d", label: "level 6" },
      7: { background: "#6b5a8a", border: "#4a3d61", label: "level 7" },
      8: { background: "#8a7a5a", border: "#615539", label: "level 8" },
    },
    unassigned: { background: "#8a8478", border: "#5f5a52", label: "unassigned" },
    journal: { background: "#2d5a4a", border: "#1c3f34", label: "journal" },
  };
}

function buildPalette() {
  const palette = {
    unassigned: toVisColor(levelStyles.unassigned),
    journal: toVisColor(levelStyles.journal),
  };
  const maxLevel = levelStyles.maxLevel ?? 8;
  for (let level = 1; level <= maxLevel; level += 1) {
    palette[level] = toVisColor(levelStyles.levels?.[level]);
  }
  return palette;
}

function toVisColor(style) {
  if (!style) return { background: "#8a8478", border: "#5f5a52" };
  return { background: style.background, border: style.border };
}

function groupFor(node) {
  if (currentScope === "journal") return "journal";
  if (node.level == null) return "unassigned";
  const maxLevel = levelStyles.maxLevel ?? 8;
  if (node.level > maxLevel) return maxLevel;
  return node.level;
}

function levelMeta(level) {
  if (level == null) return levelStyles.unassigned;
  const maxLevel = levelStyles.maxLevel ?? 8;
  const key = level > maxLevel ? maxLevel : level;
  return levelStyles.levels?.[key] ?? { label: `level ${level}` };
}

function nodeSizeFor(level) {
  if (level === 1) return 26;
  if (level === 2) return 20;
  if (level == null) return 14;
  return 16;
}

function tooltipFor(node) {
  if (currentScope === "journal") return `journal · ${node.id}`;
  if (node.level == null) return `unassigned · ${node.id}`;
  const label = levelMeta(node.level).label;
  return `level ${node.level} · ${label} · ${node.id}`;
}

function levelLabel(level) {
  if (level == null) return "Unassigned · not reached from root";
  const label = levelMeta(level).label;
  const maxLevel = levelStyles.maxLevel ?? 8;
  if (level > maxLevel) return `Level ${level} · ${label} (shown as level ${maxLevel})`;
  return `Level ${level} · ${label}`;
}

function renderLegend() {
  if (currentScope === "journal") {
    const color = levelStyles.journal?.background ?? "#2d5a4a";
    legendEl.innerHTML = swatch("journal", levelStyles.journal?.label ?? "journal", color);
    return;
  }

  const maxLevel = levelStyles.maxLevel ?? 8;
  const items = [];
  for (let level = 1; level <= maxLevel; level += 1) {
    const meta = levelStyles.levels?.[level];
    items.push(swatch(level, `Level ${level} · ${meta?.label ?? level}`, meta?.background));
  }
  items.push(
    swatch(
      "unassigned",
      levelStyles.unassigned?.label ?? "unassigned",
      levelStyles.unassigned?.background,
    ),
  );
  legendEl.innerHTML = items.join("");
}

function swatch(key, label, color) {
  const fill = color ?? levelStyles.unassigned?.background ?? "#8a8478";
  return `<span class="legend-item"><span class="swatch" style="--swatch:${fill}"></span>${escapeHtml(label)}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function resetDetail(message) {
  noteForm.hidden = true;
  linkedForm.hidden = true;
  attachRootBtn.hidden = true;
  noteLevelEl.hidden = true;
  emptyEl.hidden = false;
  emptyEl.textContent = message;
  linkPicker.reset();
  setBodyTab("edit");
  notePreviewEl.innerHTML = "";
}

async function refreshLinkCatalog() {
  const response = await fetch("/notes");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load notes");
  linkPicker.setCatalog(data.notes ?? []);
}

function setStatus(el, message = "", isError = false) {
  el.textContent = message;
  el.classList.toggle("error", Boolean(isError && message));
}

fillLevelOptions();

loadGraph().catch((error) => {
  emptyEl.textContent = error.message;
});
