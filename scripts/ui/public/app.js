const form = document.querySelector("#capture-form");
const statusEl = document.querySelector("#capture-status");
const listEl = document.querySelector("#note-list");
const detailEl = document.querySelector("#note-detail");
const queryEl = document.querySelector("#query");
const tagEl = document.querySelector("#tag");
const linkPicker = createLinkPicker(document.querySelector("#links"));

let notes = [];

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.classList.remove("error");
  statusEl.textContent = "Saving…";

  const payload = {
    title: form.title.value,
    type: form.type.value,
    tags: form.tags.value,
    links: linkPicker.getValue(),
    body: form.body.value,
  };

  try {
    const response = await fetch("/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Save failed");
    statusEl.textContent = `Saved ${data.path}`;
    form.reset();
    linkPicker.reset();
    await loadCatalog();
    await loadNotes();
  } catch (error) {
    statusEl.classList.add("error");
    statusEl.textContent = error.message;
  }
});

queryEl.addEventListener("input", () => {
  loadNotes().catch(showLoadError);
});
tagEl.addEventListener("input", () => {
  loadNotes().catch(showLoadError);
});

async function loadCatalog() {
  const response = await fetch("/notes");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load notes");
  linkPicker.setCatalog(data.notes ?? []);
}

async function loadNotes() {
  const params = new URLSearchParams();
  if (queryEl.value.trim()) params.set("q", queryEl.value.trim());
  if (tagEl.value.trim()) params.set("tag", tagEl.value.trim());
  const response = await fetch(`/search?${params}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Search failed");
  notes = data.notes ?? [];
  renderList();
}

function showLoadError(error) {
  statusEl.classList.add("error");
  statusEl.textContent = error.message;
}

function renderList() {
  const matches = notes;

  listEl.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement("li");
    empty.className = "muted";
    empty.textContent = "No notes match.";
    listEl.append(empty);
    return;
  }

  for (const note of matches) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "linkish";
    button.type = "button";
    button.innerHTML = `<strong>${escapeHtml(note.title)}</strong>
      <div class="meta">${escapeHtml(note.type)} · ${escapeHtml(note.path)}</div>
      <div>${note.tags.map((tagName) => `<span class="tag">${escapeHtml(tagName)}</span>`).join("")}</div>`;
    button.addEventListener("click", () => showDetail(note));
    item.append(button);
    listEl.append(item);
  }
}

function showDetail(note) {
  detailEl.innerHTML = `
    <h3>${escapeHtml(note.title)}</h3>
    <p class="meta">${escapeHtml(note.id)} · ${escapeHtml(note.path)}</p>
    <pre class="detail">${escapeHtml(note.content || "(empty)")}</pre>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

loadCatalog()
  .then(loadNotes)
  .catch(showLoadError);
