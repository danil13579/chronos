(() => {
  const byId = (id) => document.getElementById(id);
  const screen = byId("categories");
  const list = byId("category-list");
  const add = byId("category-add");
  const empty = byId("category-empty");
  const status = byId("category-status");
  const editor = byId("category-editor");
  const confirm = byId("category-confirm");
  const form = byId("category-form");
  const nameInput = byId("category-name");
  const palette = byId("category-palette");
  const error = byId("category-error");
  const confirmError = byId("category-confirm-error");
  const remove = byId("category-delete");
  const reason = byId("category-delete-reason");
  const shades = chronosStorage.categoryPalette;
  const rows = new Map();
  let editing;
  let selectedColor;
  let busy = false;

  function deletionReason(state, id) {
    if (state.activities.some((record) => record.categoryId === id)) {
      return "Категория используется в сохранённых записях. Измените их категорию или удалите записи в «Истории».";
    }
    if (state.activeTimer?.categoryId === id) return "Сначала остановите таймер этой категории.";
    return "";
  }

  function updateDeleteControl(state) {
    const message = editing ? deletionReason(state, editing.id) : "";
    remove.hidden = !editing;
    remove.disabled = Boolean(message);
    reason.hidden = !message;
    reason.textContent = message;
  }

  function render(message = "") {
    list.replaceChildren();
    rows.clear();
    let state;
    try {
      state = chronosStorage.load();
    } catch {
      list.hidden = true;
      empty.hidden = true;
      add.disabled = true;
      status.textContent = "Не удалось загрузить категории.";
      return;
    }

    list.hidden = !state.categories.length;
    empty.hidden = Boolean(state.categories.length);
    add.disabled = false;
    status.textContent = message;
    for (const item of state.categories) {
      const row = document.createElement("li");
      const button = document.createElement("button");
      const dot = document.createElement("span");
      const name = document.createElement("span");
      const arrow = document.createElement("span");
      button.type = "button";
      dot.className = "category-dot";
      dot.style.setProperty("--category-color", item.color);
      name.className = "category-row-name";
      name.textContent = item.name;
      arrow.className = "category-row-arrow";
      arrow.textContent = "›";
      arrow.setAttribute("aria-hidden", "true");
      button.append(dot, name, arrow);
      button.addEventListener("click", () => openEditor(item));
      row.append(button);
      list.append(row);
      rows.set(item.id, button);
    }
    if (editor.open) updateDeleteControl(state);
  }

  function openEditor(item) {
    editing = item;
    byId("category-editor-title").textContent = item ? "Редактировать категорию" : "Новая категория";
    nameInput.value = item?.name ?? "";
    error.textContent = "";
    nameInput.removeAttribute("aria-invalid");
    selectedColor = item?.color.toUpperCase() ?? shades[0][1];
    const choices = shades.some(([, color]) => color === selectedColor)
      ? shades : [["Текущий цвет", selectedColor], ...shades];
    palette.replaceChildren();
    for (const [name, color] of choices) {
      const label = document.createElement("label");
      const radio = document.createElement("input");
      const swatch = document.createElement("span");
      radio.type = "radio";
      radio.name = "category-color";
      radio.value = color;
      radio.checked = color === selectedColor;
      radio.setAttribute("aria-label", name);
      radio.addEventListener("change", () => { selectedColor = color; });
      swatch.style.setProperty("--swatch", color);
      label.append(radio, swatch);
      palette.append(label);
    }
    try {
      updateDeleteControl(chronosStorage.load());
      editor.showModal();
    } catch {
      status.textContent = "Не удалось открыть категорию.";
    }
  }

  function normalizeName(name) {
    return name.normalize("NFKC").trim().replace(/\s+/g, " ");
  }

  async function saveCategory(deleting = false) {
    if (busy) return;
    const targetError = deleting ? confirmError : error;
    const name = normalizeName(nameInput.value);
    if (!deleting && (!name || name.length > 40)) {
      nameInput.setAttribute("aria-invalid", "true");
      targetError.textContent = name ? "Введите название длиной до 40 символов." : "Введите название категории.";
      nameInput.focus();
      return;
    }

    busy = true;
    const color = selectedColor;
    let id = editing?.id;
    let rejection = "";
    let duplicate = false;
    try {
      await chronosStorage.update((state) => {
        if (editing) {
          const current = state.categories.find((item) => item.id === editing.id);
          if (!current || current.name !== editing.name || current.color !== editing.color) {
            rejection = "Категория уже изменилась. Откройте её заново.";
            return state;
          }
        }

        if (deleting) {
          rejection = deletionReason(state, id);
          if (rejection) return state;
          return { ...state, categories: state.categories.filter((item) => item.id !== id) };
        }

        const key = name.toLocaleLowerCase("ru");
        duplicate = state.categories.some((item) =>
          item.id !== id && normalizeName(item.name).toLocaleLowerCase("ru") === key);
        if (duplicate) {
          rejection = "Категория с таким названием уже есть.";
          return state;
        }
        id ??= `category-${crypto.getRandomValues(new Uint32Array(4)).join("-")}`;
        const updated = { id, name, color };
        return {
          ...state,
          categories: editing
            ? state.categories.map((item) => item.id === id ? updated : item)
            : [...state.categories, updated],
        };
      });
      if (rejection) {
        targetError.textContent = rejection;
        if (duplicate) {
          nameInput.setAttribute("aria-invalid", "true");
          nameInput.focus();
        }
        return;
      }
      if (confirm.open) confirm.close();
      editor.close();
      render(deleting ? "Категория удалена" : editing ? "Изменения сохранены" : "Категория добавлена");
      (rows.get(id) ?? add).focus();
    } catch {
      targetError.textContent = "Не удалось сохранить изменения. Попробуйте ещё раз.";
    } finally {
      busy = false;
    }
  }

  add.addEventListener("click", () => openEditor());
  nameInput.addEventListener("input", () => {
    error.textContent = "";
    nameInput.removeAttribute("aria-invalid");
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveCategory();
  });
  byId("category-delete-form").addEventListener("submit", (event) => {
    event.preventDefault();
    saveCategory(true);
  });
  remove.addEventListener("click", () => {
    if (busy) return;
    byId("category-confirm-name").textContent = editing.name;
    confirmError.textContent = "";
    confirm.showModal();
  });
  byId("category-cancel").addEventListener("click", () => { if (!busy) editor.close(); });
  byId("category-keep").addEventListener("click", () => { if (!busy) confirm.close(); });
  for (const dialog of [editor, confirm]) {
    dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  }

  function refresh() {
    if (!screen.hidden && !busy) render();
  }

  window.addEventListener("hashchange", refresh);
  chronosStorage.subscribe(refresh, { includeLocal: true });
  refresh();
})();
