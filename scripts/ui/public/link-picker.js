function createLinkPicker(root) {
  let catalog = [];
  let selected = [];
  let parentId = "";
  let excludeId = "";

  root.classList.add("link-picker");
  root.innerHTML = `
    <div class="link-rows-scroll">
      <ul class="link-rows"></ul>
      <p class="link-empty muted">No links yet. Choose a note below.</p>
    </div>
    <div class="link-add">
      <select class="link-select">
        <option value="">Add an existing note…</option>
      </select>
      <button type="button" class="secondary link-add-btn">Add</button>
    </div>
  `;

  const rowsEl = root.querySelector(".link-rows");
  const emptyEl = root.querySelector(".link-empty");
  const selectEl = root.querySelector(".link-select");
  const addBtn = root.querySelector(".link-add-btn");

  addBtn.addEventListener("click", () => addSelected());
  selectEl.addEventListener("change", () => {
    if (selectEl.value) addSelected();
  });

  function noteById(id) {
    return catalog.find((note) => note.id === id);
  }

  function addLink(id) {
    const slug = String(id ?? "").trim();
    if (!slug || slug === excludeId || selected.includes(slug) || slug === parentId) return;
    selected = [...selected, slug];
    render();
  }

  function addSelected() {
    addLink(selectEl.value);
    selectEl.value = "";
  }

  function appendRow({ id, badge, onRemove }) {
    const item = document.createElement("li");
    item.className = "link-row";
    const text = document.createElement("span");
    const badgeHtml = badge
      ? `<span class="link-badge">${escapeHtml(badge)}</span>`
      : "";
    text.innerHTML = `<strong>${escapeHtml(noteById(id)?.title || id)}</strong>
      <span class="meta">${escapeHtml(id)}${badgeHtml ? ` · ${badgeHtml}` : ""}</span>`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "link-remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", onRemove);
    item.append(text, remove);
    rowsEl.append(item);
  }

  function render() {
    rowsEl.replaceChildren();
    const hasRows = Boolean(parentId) || selected.length > 0;
    emptyEl.hidden = hasRows;

    if (parentId) {
      appendRow({
        id: parentId,
        badge: "parent",
        onRemove: () => {
          parentId = "";
          render();
        },
      });
    }

    for (const id of selected) {
      if (id === parentId) continue;
      appendRow({
        id,
        onRemove: () => {
          selected = selected.filter((itemId) => itemId !== id);
          render();
        },
      });
    }

    const blocked = new Set([excludeId, parentId, ...selected].filter(Boolean));
    const available = catalog
      .filter((note) => !blocked.has(note.id))
      .sort((a, b) => a.title.localeCompare(b.title));

    selectEl.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = available.length
      ? "Add an existing note…"
      : "No other notes to add";
    selectEl.append(placeholder);
    for (const note of available) {
      const option = document.createElement("option");
      option.value = note.id;
      option.textContent = `${note.title} (${note.id})`;
      selectEl.append(option);
    }
    addBtn.disabled = !available.length;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  render();

  return {
    setCatalog(notes) {
      catalog = Array.isArray(notes) ? notes : [];
      render();
    },
    setExclude(id) {
      excludeId = id || "";
      render();
    },
    setParent(id) {
      parentId = String(id ?? "").trim();
      if (parentId) {
        selected = selected.filter((itemId) => itemId !== parentId);
      }
      render();
    },
    getParent() {
      return parentId;
    },
    setValue(ids) {
      selected = [
        ...new Set(
          (ids ?? [])
            .map((id) => String(id).trim())
            .filter((id) => id && id !== parentId),
        ),
      ];
      render();
    },
    getValue() {
      return [...selected];
    },
    reset() {
      excludeId = "";
      parentId = "";
      selected = [];
      render();
    },
  };
}
