function createLinkPicker(root) {
  let catalog = [];
  let selected = [];
  let excludeId = "";

  root.classList.add("link-picker");
  root.innerHTML = `
    <ul class="link-rows"></ul>
    <p class="link-empty muted">No links yet. Choose a note below.</p>
    <div class="link-add">
      <select class="link-select">
        <option value="">Add an existing note…</option>
      </select>
      <button type="button" class="secondary link-add-btn">Add</button>
    </div>
    <div class="link-related" hidden>
      <p class="muted">Also connected</p>
      <ul class="link-related-rows"></ul>
    </div>
  `;

  const rowsEl = root.querySelector(".link-rows");
  const emptyEl = root.querySelector(".link-empty");
  const selectEl = root.querySelector(".link-select");
  const addBtn = root.querySelector(".link-add-btn");
  const relatedWrap = root.querySelector(".link-related");
  const relatedEl = root.querySelector(".link-related-rows");

  addBtn.addEventListener("click", () => addSelected());
  selectEl.addEventListener("change", () => {
    if (selectEl.value) addSelected();
  });

  function noteById(id) {
    return catalog.find((note) => note.id === id);
  }

  function labelFor(id) {
    const note = noteById(id);
    return note ? `${note.title} (${note.id})` : id;
  }

  function addLink(id) {
    const slug = String(id ?? "").trim();
    if (!slug || slug === excludeId || selected.includes(slug)) return;
    selected = [...selected, slug];
    render();
  }

  function addSelected() {
    addLink(selectEl.value);
    selectEl.value = "";
  }

  function relatedNotes() {
    if (!excludeId) return [];
    const current = catalog.find((item) => item.id === excludeId);
    const extra = [];
    const seen = new Set(selected);

    if (current?.parent && current.parent !== excludeId && !seen.has(current.parent)) {
      extra.push({ id: current.parent, reason: "parent topic" });
      seen.add(current.parent);
    }

    for (const note of catalog) {
      if (note.id === excludeId || seen.has(note.id)) continue;
      const incoming =
        (note.links ?? []).includes(excludeId) || note.parent === excludeId;
      if (!incoming) continue;
      extra.push({
        id: note.id,
        reason: note.parent === excludeId ? "child note" : "linked from there",
      });
      seen.add(note.id);
    }

    extra.sort((a, b) => labelFor(a.id).localeCompare(labelFor(b.id)));
    return extra;
  }

  function render() {
    rowsEl.replaceChildren();
    emptyEl.hidden = selected.length > 0;

    for (const id of selected) {
      const item = document.createElement("li");
      item.className = "link-row";
      const text = document.createElement("span");
      text.innerHTML = `<strong>${escapeHtml(noteById(id)?.title || id)}</strong>
        <span class="meta">${escapeHtml(id)}</span>`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "link-remove";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        selected = selected.filter((itemId) => itemId !== id);
        render();
      });
      item.append(text, remove);
      rowsEl.append(item);
    }

    const available = catalog
      .filter((note) => note.id !== excludeId && !selected.includes(note.id))
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

    const extras = relatedNotes();
    relatedWrap.hidden = extras.length === 0;
    relatedEl.replaceChildren();
    for (const extra of extras) {
      const item = document.createElement("li");
      item.className = "link-row related";
      const text = document.createElement("span");
      text.innerHTML = `<strong>${escapeHtml(noteById(extra.id)?.title || extra.id)}</strong>
        <span class="meta">${escapeHtml(extra.reason)}</span>`;
      const include = document.createElement("button");
      include.type = "button";
      include.className = "secondary link-include";
      include.textContent = "Include";
      include.addEventListener("click", () => addLink(extra.id));
      item.append(text, include);
      relatedEl.append(item);
    }
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
    setValue(ids) {
      selected = [...new Set((ids ?? []).map((id) => String(id).trim()).filter(Boolean))];
      render();
    },
    getValue() {
      return [...selected];
    },
    reset() {
      excludeId = "";
      selected = [];
      render();
    },
  };
}
