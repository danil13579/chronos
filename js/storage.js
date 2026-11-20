const chronosStorage = (() => {
  const key = "chronos.state";
  const defaultCategories = [
    { id: "study", name: "Учёба", color: "#C4A7E7" },
    { id: "work", name: "Работа", color: "#F6C177" },
    { id: "rest", name: "Отдых", color: "#9CCFD8" },
    { id: "sleep", name: "Сон", color: "#31748F" },
    { id: "sport", name: "Спорт", color: "#EB6F92" },
    { id: "other", name: "Другое", color: "#6E6A86" },
  ];
  const paletteNames = ["Лавандовый", "Золотистый", "Ледяной", "Сине-зелёный", "Розовый", "Серо-лиловый"];
  const paletteVersion = 3;
  const previousDefaults = new Map([
    ["study", "#A75BFF"], ["work", "#4080FF"], ["rest", "#00D45C"],
    ["sleep", "#FF35A3"], ["sport", "#FF8500"], ["other", "#9098A3"],
  ]);
  const legacyColors = {
    "#A78BFA": "#A75BFF", "#7DD3FC": "#4080FF", "#5EEAD4": "#00CFFF",
    "#86EFAC": "#00D45C", "#BEF264": "#A7E600", "#FCD34D": "#FFD600",
    "#FDBA74": "#FF8500", "#FCA5A5": "#FF414D", "#FDA4AF": "#FF35A3",
    "#F0ABFC": "#FF35A3", "#A5B4FC": "#4080FF", "#A6AFC2": "#9098A3",
  };

  function load() {
    const saved = localStorage.getItem(key);
    const state = saved === null ? { activeTimer: null, activities: [] } : JSON.parse(saved);
    const categories = (state.categories ?? defaultCategories).map((category) => {
      if (state.categoryPaletteVersion >= paletteVersion) return { ...category };
      const oldColor = category.color.toUpperCase();
      const color = state.categoryPaletteVersion === 2 ? oldColor : legacyColors[oldColor] ?? oldColor;
      const matchingDefault = previousDefaults.get(category.id) === color
        ? defaultCategories.find(({ id }) => id === category.id) : undefined;
      return { ...category, color: matchingDefault?.color ?? color };
    });
    return { ...state, categories };
  }

  function update(change) {
    function commit() {
      const current = load();
      const next = change(current);
      if (next !== current) {
        localStorage.setItem(key, JSON.stringify({ ...next, categoryPaletteVersion: paletteVersion }));
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

  const categoryPalette = defaultCategories.map(({ color }, index) => [paletteNames[index], color]);
  return { load, update, subscribe, categoryPalette };
})();
