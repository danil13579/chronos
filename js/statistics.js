(() => {
  const byId = (id) => document.getElementById(id);
  const screen = byId("statistics");
  const calendar = byId("stats-date");
  const modes = [...screen.querySelectorAll("[data-stats-mode]")];
  const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const weekdayColors = ["#a296b6", "#bc9d73", "#8cabb4", "#8295b2", "#b88b9b", "#9fa883", "#b3917d"];
  const dateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
  const compactNumber = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
  let mode = "day";
  let selected = localMidnight(Date.now());

  function duration(ms) {
    const [hours, minutes, seconds] = formatTime(ms).split(":").map(Number);
    if (hours) return `${hours} ч ${minutes} мин`;
    if (minutes) return `${minutes} мин`;
    if (ms && !seconds) return "<1 с";
    return `${seconds} с`;
  }

  function periodData(activities, start, days) {
    const boundaries = Array.from({ length: days + 1 }, (_, index) => localMidnight(start, index));
    const totals = Array(days).fill(0);
    const categories = new Map();
    let count = 0;
    let total = 0;
    for (const activity of activities) {
      const from = Math.max(start, Date.parse(activity.startAt));
      const to = Math.min(boundaries[days], Date.parse(activity.endAt));
      if (!(from < to)) continue;
      const elapsed = to - from;
      count++;
      total += elapsed;
      categories.set(activity.categoryId, (categories.get(activity.categoryId) ?? 0) + elapsed);
      for (let index = 0; index < days; index++) {
        totals[index] += Math.max(0, Math.min(to, boundaries[index + 1]) - Math.max(from, boundaries[index]));
      }
    }
    return { categories, count, total, totals };
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderCategories(data, categories) {
    const categoryColors = new Map(categories.map((item) => [item.id, item]));
    const legend = byId("stats-legend");
    legend.replaceChildren();
    const stops = [];
    let elapsed = 0;
    const entries = [...data.categories].sort((a, b) => b[1] - a[1]);
    for (const [id, time] of entries) {
      const { name, color } = categoryColors.get(id) ?? { name: "Категория недоступна", color: "var(--subtle)" };
      const fraction = time / data.total;
      const dot = element("span", "category-dot");
      dot.style.setProperty("--category-color", color);
      const row = element("li", "");
      const percent = fraction < 0.001 ? "<0,1%" : `${compactNumber.format(fraction * 100)}%`;
      row.append(dot, element("span", "stats-category-name", name),
        element("span", "stats-legend-value", duration(time)), element("strong", "stats-percent", percent));
      legend.append(row);
      const start = elapsed / data.total * 100;
      elapsed += time;
      stops.push(`${color} ${start}% ${elapsed / data.total * 100}%`);
    }
    screen.querySelector(".stats-ring").style.background = `conic-gradient(${stops.join(", ")})`;
    byId("stats-ring-total").textContent = duration(data.total);
  }

  function svgElement(tag, attributes) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  }

  function renderWeek(totals) {
    const peak = Math.max(...totals);
    const bars = byId("stats-bars");
    const trend = byId("stats-trend");
    bars.replaceChildren();
    const labels = element("div", "stats-trend-labels");
    const svg = svgElement("svg", {
      viewBox: "0 0 280 76", role: "img", "aria-label": "Динамика учтённого времени",
    });
    const description = svgElement("desc", {});
    description.id = "stats-trend-values";
    svg.setAttribute("aria-describedby", description.id);
    description.textContent = totals.map((time, index) => `${weekdays[index]}: ${formatTime(time)}`).join(". ");
    svg.append(description);
    for (const y of [10, 40, 70]) svg.append(svgElement("line", { x1: 0, x2: 280, y1: y, y2: y, class: "stats-gridline" }));
    const points = [];

    totals.forEach((time, index) => {
      const ratio = time / peak;
      const column = element("li", "stats-column");
      const compact = time >= 3600000 ? `${compactNumber.format(time / 3600000)}ч` : duration(time).replace(" ", "");
      const value = element("span", "stats-bar-value", compact);
      value.setAttribute("aria-hidden", "true");
      const track = element("span", "stats-bar-track");
      const fill = element("span", "stats-bar-fill");
      fill.style.height = `${ratio * 100}%`;
      fill.style.backgroundColor = weekdayColors[index];
      track.setAttribute("aria-hidden", "true");
      track.append(fill);
      column.append(value, track, element("span", "muted", weekdays[index]),
        element("span", "visually-hidden", formatTime(time)));
      column.title = formatTime(time);
      bars.append(column);
      labels.append(element("span", "", weekdays[index]));
      points.push([20 + index * 40, 70 - ratio * 60]);
    });

    const coordinates = points.map((point) => point.join(",")).join(" ");
    svg.append(svgElement("polygon", { points: `20,70 ${coordinates} 260,70`, class: "stats-area" }));
    svg.append(svgElement("polyline", { points: coordinates, class: "stats-line" }));
    for (const [cx, cy] of points) svg.append(svgElement("circle", { cx, cy, r: 3, class: "stats-point" }));
    labels.setAttribute("aria-hidden", "true");
    trend.replaceChildren(svg, labels);
  }

  function render() {
    if (screen.hidden) return;
    const weekly = mode === "week";
    const start = weekly ? localMidnight(selected, -((new Date(selected).getDay() + 6) % 7)) : selected;
    const date = new Date(selected);
    calendar.value = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((part, index) => String(part).padStart(index ? 2 : 4, "0")).join("-");
    byId("stats-range").textContent = weekly
      ? `${shortDate.format(start)} – ${shortDate.format(localMidnight(start, 6))}`
      : dateLabel.format(start);
    for (const button of modes) button.setAttribute("aria-pressed", String(button.dataset.statsMode === mode));

    const dashboard = byId("stats-dashboard");
    const empty = byId("stats-empty");
    let data;
    let categories;
    try {
      const state = chronosStorage.load();
      categories = state.categories;
      data = periodData(state.activities, start, weekly ? 7 : 1);
    } catch {
      empty.textContent = "Не удалось загрузить статистику.";
    }
    dashboard.hidden = !data?.count;
    empty.hidden = !dashboard.hidden;
    if (!data) return;
    if (!data.count) {
      empty.textContent = weekly ? "За эту неделю пока нет записей." : "За этот день пока нет записей.";
      return;
    }

    byId("stats-total").textContent = duration(data.total);
    byId("stats-count").textContent = data.count;
    byId("stats-average-card").hidden = !weekly;
    byId("stats-average").textContent = duration(data.total / 7);
    byId("stats-week-charts").hidden = !weekly;
    renderCategories(data, categories);
    if (weekly) renderWeek(data.totals);
  }

  function renderSelectedPeriod() {
    render();
    if (!screen.hidden) byId("stats-dashboard").scrollTop = 0;
  }

  for (const button of modes) button.addEventListener("click", () => {
    if (mode === button.dataset.statsMode) return;
    mode = button.dataset.statsMode;
    renderSelectedPeriod();
  });

  function move(direction) {
    selected = localMidnight(selected, direction * (mode === "week" ? 7 : 1));
    renderSelectedPeriod();
  }

  byId("stats-previous").addEventListener("click", () => move(-1));
  byId("stats-next").addEventListener("click", () => move(1));
  calendar.addEventListener("change", () => {
    const date = Date.parse(`${calendar.value}T12:00`);
    if (Number.isFinite(date)) selected = localMidnight(date);
    renderSelectedPeriod();
  });

  window.addEventListener("hashchange", renderSelectedPeriod);
  chronosStorage.subscribe(render, { includeLocal: true });
  render();
})();
