(() => {
  const byId = (id) => document.getElementById(id);
  const dateInput = byId("history-date");
  const dateLabel = byId("history-date-label");
  const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  const list = byId("history-list");
  const add = byId("history-add");
  const status = byId("history-status");
  const editor = byId("history-editor");
  const confirm = byId("history-confirm");
  const form = byId("history-form");
  const deleteForm = byId("history-delete-form");
  const category = byId("history-category");
  const startInput = byId("history-start");
  const endInput = byId("history-end");
  const error = byId("history-error");
  const deleteError = byId("history-delete-error");
  const remove = byId("history-delete");
  const clock = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });

  let day = localMidnight(Date.now());
  let editing;
  let initialTimes;
  let busy = false;
  let categories;

  function dateValue(timestamp) {
    const date = new Date(timestamp);
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((value, index) => String(value).padStart(index ? 2 : 4, "0")).join("-");
  }

  function dateTimeValue(timestamp) {
    return `${dateValue(timestamp)}T${clock.format(timestamp)}`;
  }

  function renderHistory(message = "") {
    dateInput.value = dateValue(day);
    dateLabel.textContent = dateFormatter.format(day);
    list.replaceChildren();
    let records;
    try {
      const state = chronosStorage.load();
      records = state.activities;
      categories = new Map(state.categories.map((item) => [item.id, item]));
      add.disabled = !categories.size;
    } catch {
      add.disabled = true;
      byId("history-empty").hidden = true;
      byId("history-total").textContent = "—";
      status.textContent = "Не удалось загрузить записи.";
      return;
    }

    const tomorrow = localMidnight(day, 1);
    const rows = records.map((record) => ({
      record,
      start: Math.max(day, Date.parse(record.startAt)),
      end: Math.min(tomorrow, Date.parse(record.endAt)),
    })).filter(({ start, end }) => start < end).sort((a, b) => a.start - b.start);

    let total = 0;
    for (const { record, start, end } of rows) {
      total += end - start;
      const row = document.createElement("li");
      const button = document.createElement("button");
      const dot = document.createElement("span");
      const details = document.createElement("span");
      const name = document.createElement("strong");
      const interval = document.createElement("span");
      const duration = document.createElement("span");

      button.type = "button";
      button.dataset.activityId = record.id;
      const activityCategory = categories.get(record.categoryId);
      dot.className = "category-dot";
      dot.style.setProperty("--category-color", activityCategory?.color ?? "var(--subtle)");
      name.textContent = activityCategory?.name ?? "Категория недоступна";
      interval.className = "muted";
      interval.textContent = `${clock.format(start)} — ${end === tomorrow ? "24:00:00" : clock.format(end)}`;
      duration.className = "history-duration";
      duration.textContent = formatTime(end - start);
      details.className = "history-details";
      details.append(name, interval);
      button.append(dot, details, duration);
      button.addEventListener("click", () => openEditor(record));
      row.append(button);
      list.append(row);
    }

    byId("history-empty").hidden = rows.length > 0;
    byId("history-total").textContent = formatTime(total);
    status.textContent = message || (categories.size ? "" : "Чтобы добавить запись, создайте категорию.");
  }

  function openEditor(record) {
    editing = record;
    byId("history-editor-title").textContent = record ? "Редактировать запись" : "Добавить запись";
    category.replaceChildren(...[...categories.values()].map(({ name, id }) => new Option(name, id)));
    if (record && !categories.has(record.categoryId)) {
      const option = new Option("Категория недоступна", record.categoryId);
      category.add(option);
    }
    category.value = record?.categoryId ?? category.options[0].value;
    startInput.value = record ? dateTimeValue(Date.parse(record.startAt)) : `${dateValue(day)}T09:00`;
    endInput.value = record ? dateTimeValue(Date.parse(record.endAt)) : `${dateValue(day)}T09:30`;
    initialTimes = [startInput.value, endInput.value];
    error.textContent = "";
    remove.hidden = !record;
    editor.showModal();
  }

  function readTime(input, original, initial) {
    if (original && input.value === initial) return Date.parse(original);
    const timestamp = Date.parse(input.value);
    // A local time skipped by a clock change must not silently shift to a later time.
    return Number.isFinite(timestamp) && dateTimeValue(timestamp).slice(0, 16) === input.value.slice(0, 16)
      ? timestamp : NaN;
  }

  async function commit(editRecords, errorElement, message, targetDay = day) {
    if (busy) return;
    busy = true;
    let rejected = "";
    try {
      await chronosStorage.update((state) => {
        if (editing) {
          const current = state.activities.find((record) => record.id === editing.id);
          if (!current || current.categoryId !== editing.categoryId ||
              current.startAt !== editing.startAt || current.endAt !== editing.endAt) {
            rejected = "Запись уже изменилась. Откройте её заново.";
            return state;
          }
        }
        const remaining = state.activities.filter((record) => record.id !== editing?.id);
        const result = editRecords(remaining, state.activeTimer, state.categories);
        if (typeof result === "string") {
          rejected = result;
          return state;
        }
        return { ...state, activities: result };
      });
      if (rejected) {
        errorElement.textContent = rejected;
        return;
      }
      if (confirm.open) confirm.close();
      editor.close();
      day = targetDay;
      renderHistory(message);
      const updated = [...list.querySelectorAll("button")].find((button) => button.dataset.activityId === editing?.id);
      (updated ?? add).focus();
    } catch {
      errorElement.textContent = "Не удалось сохранить изменения. Попробуйте ещё раз.";
    } finally {
      busy = false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const start = readTime(startInput, editing?.startAt, initialTimes[0]);
    const end = readTime(endInput, editing?.endAt, initialTimes[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      error.textContent = "Укажите корректное время. Окончание должно быть позже начала.";
      return;
    }
    const categoryId = category.value;
    commit((remaining, active, currentCategories) => {
      if (categoryId !== editing?.categoryId && !currentCategories.some(({ id }) => id === categoryId)) {
        return "Эта категория больше недоступна. Откройте форму заново.";
      }
      if (end > Date.now()) return "Окончание записи не может быть в будущем.";
      if (active && end > Date.parse(active.startAt)) return "Интервал пересекается с активным таймером.";
      const conflict = remaining.find((record) => start < Date.parse(record.endAt) && end > Date.parse(record.startAt));
      if (conflict) {
        return `Интервал пересекается с записью ${dateTimeValue(Date.parse(conflict.startAt)).replace("T", " ")}.`;
      }
      return [...remaining, ...splitActivity(categoryId, start, end, editing?.id)];
    }, error, "Запись сохранена", localMidnight(start));
  });

  function moveDay(offset) {
    day = localMidnight(day, offset);
    renderHistory();
  }

  dateInput.addEventListener("change", () => {
    const selected = Date.parse(`${dateInput.value}T12:00`);
    if (Number.isFinite(selected)) day = localMidnight(selected);
    renderHistory();
  });
  byId("history-previous").addEventListener("click", () => moveDay(-1));
  byId("history-next").addEventListener("click", () => moveDay(1));
  byId("history-today").addEventListener("click", () => {
    day = localMidnight(Date.now());
    renderHistory();
  });
  add.addEventListener("click", () => openEditor());
  form.addEventListener("input", () => { error.textContent = ""; });
  byId("history-cancel").addEventListener("click", () => { if (!busy) editor.close(); });
  remove.addEventListener("click", () => {
    if (busy) return;
    deleteError.textContent = "";
    confirm.showModal();
  });
  byId("history-keep").addEventListener("click", () => { if (!busy) confirm.close(); });
  deleteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    commit((remaining) => remaining, deleteError, "Запись удалена");
  });
  for (const dialog of [editor, confirm]) {
    dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  }

  function refreshWhenVisible() {
    if (!byId("history").hidden) renderHistory();
  }

  window.addEventListener("hashchange", refreshWhenVisible);
  chronosStorage.subscribe(() => { if (!busy) refreshWhenVisible(); }, { includeLocal: true });
  refreshWhenVisible();
})();
