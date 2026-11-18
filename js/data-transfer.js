(() => {
  const exportButton = document.querySelector("#data-export");
  const importButton = document.querySelector("#data-import");
  const fileInput = document.querySelector("#data-file");
  const status = document.querySelector("#data-status");
  const confirmation = document.querySelector("#data-confirm");
  const form = document.querySelector("#data-confirm-form");
  const importError = document.querySelector("#data-import-error");
  const version = 1;
  let pending;
  let replacing = false;

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isId(value) {
    return typeof value === "string" && value !== "" && value === value.trim();
  }

  function timestamp(value) {
    if (typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
      return NaN;
    }
    // Date.parse can roll invalid calendar dates into the next month.
    const dateAndTime = value.slice(0, 19);
    const asUtc = new Date(`${dateAndTime}Z`);
    if (!Number.isFinite(asUtc.getTime()) || asUtc.toISOString().slice(0, 19) !== dateAndTime) return NaN;
    return Date.parse(value);
  }

  function validate(data) {
    if (!isObject(data) || !Array.isArray(data.categories) || !Array.isArray(data.activities)) {
      throw new Error("В JSON должны быть списки категорий (categories) и записей (activities).");
    }
    if (data.version !== undefined && data.version !== version) {
      throw new Error("Эта версия формата JSON не поддерживается.");
    }

    const categoryIds = new Set();
    const names = new Set();
    const categories = data.categories.map((category, index) => {
      const label = `Категория №${index + 1}`;
      if (!isObject(category) || !isId(category.id) || categoryIds.has(category.id)) {
        throw new Error(`${label}: нужен уникальный идентификатор.`);
      }
      const name = typeof category.name === "string"
        ? category.name.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
      if (!name || name.length > 40) throw new Error(`${label}: название должно содержать от 1 до 40 символов.`);
      const nameKey = name.toLocaleLowerCase("ru");
      if (names.has(nameKey)) throw new Error(`${label}: название «${name}» уже используется.`);
      if (typeof category.color !== "string" || !/^#[\da-f]{6}$/i.test(category.color)) {
        throw new Error(`${label}: укажите цвет в формате #RRGGBB.`);
      }
      categoryIds.add(category.id);
      names.add(nameKey);
      return { id: category.id, name, color: category.color.toUpperCase() };
    });

    const recordIds = new Set();
    const now = Date.now();
    const records = data.activities.map((record, index) => {
      const label = `Запись №${index + 1}`;
      if (!isObject(record) || !isId(record.id) || recordIds.has(record.id)) {
        throw new Error(`${label}: нужен уникальный идентификатор.`);
      }
      if (!categoryIds.has(record.categoryId)) throw new Error(`${label}: категория отсутствует в файле.`);
      const start = timestamp(record.startAt);
      const end = timestamp(record.endAt);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error(`${label}: проверьте дату и время в формате ISO 8601 с часовым поясом.`);
      }
      if (end <= start) throw new Error(`${label}: окончание должно быть позже начала.`);
      if (end > now) throw new Error(`${label}: окончание не может быть в будущем.`);
      recordIds.add(record.id);
      return { index: index + 1, start, end, activity: {
        id: record.id,
        categoryId: record.categoryId,
        startAt: new Date(start).toISOString(),
        endAt: new Date(end).toISOString(),
      } };
    });
    records.sort((a, b) => a.start - b.start);
    for (let i = 1; i < records.length; i++) {
      if (records[i].start < records[i - 1].end) {
        throw new Error(`Записи №${records[i - 1].index} и №${records[i].index} пересекаются по времени.`);
      }
    }
    return { categories, activities: records.map(({ activity }) => activity) };
  }

  exportButton.addEventListener("click", () => {
    try {
      const { categories, activities } = chronosStorage.load();
      const json = JSON.stringify({ version, categories, activities }, null, 2);
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      try {
        const link = document.createElement("a");
        const today = new Date();
        const date = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
          .map((value) => String(value).padStart(2, "0")).join("-");
        link.href = url;
        link.download = `chronos-${date}.json`;
        document.body.append(link);
        try {
          link.click();
        } finally {
          link.remove();
        }
        status.textContent = "Файл экспорта подготовлен.";
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      status.textContent = "Не удалось экспортировать данные.";
    }
  });

  importButton.addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    importButton.disabled = true;
    status.textContent = "Проверяем файл…";
    try {
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch {
        status.textContent = "Не удалось прочитать файл. Выберите корректный JSON-файл.";
        return;
      }
      try {
        pending = validate(data);
      } catch (error) {
        status.textContent = error.message;
        return;
      }
      status.textContent = "";
      importError.textContent = "";
      confirmation.showModal();
    } finally {
      importButton.disabled = false;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!pending || replacing) return;
    replacing = true;
    importError.textContent = "";
    try {
      await chronosStorage.update((state) => ({ ...state, ...pending, activeTimer: null }));
      confirmation.close();
      status.textContent = "Данные импортированы.";
      importButton.focus();
    } catch {
      importError.textContent = "Не удалось сохранить данные. Попробуйте ещё раз.";
    } finally {
      replacing = false;
    }
  });

  document.querySelector("#data-cancel").addEventListener("click", () => {
    if (!replacing) confirmation.close();
  });
  confirmation.addEventListener("cancel", (event) => {
    if (replacing) event.preventDefault();
  });
  confirmation.addEventListener("close", () => { pending = undefined; });
})();
