const chronosStorage = (() => {
  const key = "chronos.state";
  const palette = {
    red: ["Красный", "#FF414D"],
    orange: ["Оранжевый", "#FF8500"],
    yellow: ["Жёлтый", "#FFD600"],
    lime: ["Лаймовый", "#A7E600"],
    green: ["Зелёный", "#00D45C"],
    cyan: ["Голубой", "#00CFFF"],
    blue: ["Синий", "#4080FF"],
    violet: ["Фиолетовый", "#A75BFF"],
    magenta: ["Малиновый", "#FF35A3"],
    gray: ["Серый", "#9098A3"],
  };
  const defaultCategories = [
    { id: "study", name: "Учёба", color: palette.violet[1] },
    { id: "work", name: "Работа", color: palette.blue[1] },
    { id: "rest", name: "Отдых", color: palette.green[1] },
    { id: "sleep", name: "Сон", color: palette.magenta[1] },
    { id: "sport", name: "Спорт", color: palette.orange[1] },
    { id: "other", name: "Другое", color: palette.gray[1] },
  ];
  const legacyColors = {
    "#A78BFA": "violet", "#7DD3FC": "blue", "#5EEAD4": "cyan",
    "#86EFAC": "green", "#BEF264": "lime", "#FCD34D": "yellow",
    "#FDBA74": "orange", "#FCA5A5": "red", "#FDA4AF": "magenta",
    "#F0ABFC": "magenta", "#A5B4FC": "blue", "#A6AFC2": "gray",
  };

  function load() {
    const saved = localStorage.getItem(key);
    const state = saved === null ? { activeTimer: null, activities: [] } : JSON.parse(saved);
    const categories = (state.categories ?? defaultCategories).map((category) => {
      const legacyColor = state.categoryPaletteVersion === 2 ? undefined : legacyColors[category.color.toUpperCase()];
      return { ...category, color: palette[legacyColor]?.[1] ?? category.color };
    });
    return { ...state, categories };
  }

  function update(change) {
    function commit() {
      const current = load();
      const next = change(current);
      if (next !== current) {
        localStorage.setItem(key, JSON.stringify({ ...next, categoryPaletteVersion: 2 }));
        window.dispatchEvent(new Event("chronos:storage"));
      }
      return next;
    }

    // Serialize read-modify-write operations across tabs where Web Locks are available.
    return navigator.locks ? navigator.locks.request(key, commit) : commit();
  }

  function subscribe(onChange, { includeLocal = false } = {}) {
    if (includeLocal) window.addEventListener("chronos:storage", onChange);
    window.addEventListener("storage", (event) => {
      if (event.storageArea === localStorage && (event.key === key || event.key === null)) {
        onChange();
      }
    });
  }

  return { load, update, subscribe, categoryPalette: Object.values(palette) };
})();
