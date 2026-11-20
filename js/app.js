const content = document.querySelector("#content");
const screens = [...content.querySelectorAll(".screen")];
const navigationLinks = [...document.querySelectorAll(".navigation a")];

function showScreen(moveFocus = false) {
  const requestedId = window.location.hash.slice(1);
  const activeScreen = screens.find((screen) => screen.id === requestedId) ?? screens[0];

  for (const screen of screens) {
    screen.hidden = screen !== activeScreen;
  }

  for (const link of navigationLinks) {
    if (link.hash === `#${activeScreen.id}`) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }

  content.scrollTop = 0;

  if (moveFocus) {
    activeScreen.querySelector("h1").focus({ preventScroll: true });
  }
}

window.addEventListener("hashchange", () => showScreen(true));
showScreen();

const timerAction = document.querySelector("#timer-action");
const timerValue = document.querySelector(".timer-value");
const timerCategories = document.querySelector(".category-grid");
const categoryName = document.querySelector("#current-category-name");
const categoryDot = document.querySelector(".current-category .category-dot");
const categoryHeading = document.querySelector("#category-heading");
const timerStatus = document.querySelector("#timer-status");
const todaySummary = document.querySelector("#today-summary");
const todayDate = document.querySelector("#today-date");
const todayDateLabel = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long", day: "numeric", month: "long",
});

let timerState;
let selectedCategory;
let renderedCategories;
let lastSummaryDay;
let saving = false;

function formatTime(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function localMidnight(timestamp, dayOffset = 0) {
  const day = new Date(timestamp);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + dayOffset).getTime();
}

function splitActivity(categoryId, startAt, end, firstId) {
  const records = [];
  for (let start = startAt; start < end;) {
    const segmentEnd = Math.min(end, localMidnight(start, 1));
    records.push({
      id: firstId ?? `activity-${crypto.getRandomValues(new Uint32Array(4)).join("-")}`,
      categoryId,
      startAt: new Date(start).toISOString(),
      endAt: new Date(segmentEnd).toISOString(),
    });
    firstId = undefined;
    start = segmentEnd;
  }
  return records;
}

function renderClock(now = Date.now()) {
  const active = timerState?.activeTimer;
  const value = formatTime(active ? now - Date.parse(active.startAt) : 0);
  if (timerValue.textContent !== value) timerValue.textContent = value;
}

function renderToday(now = Date.now()) {
  const today = localMidnight(now);
  const tomorrow = localMidnight(now, 1);
  if (today !== lastSummaryDay) {
    const date = new Date(today);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    todayDate.dateTime = `${date.getFullYear()}-${month}-${day}`;
    todayDate.textContent = todayDateLabel.format(date);
  }
  lastSummaryDay = today;
  const total = timerState.activities.reduce((sum, activity) => {
    const start = Math.max(today, Date.parse(activity.startAt));
    const end = Math.min(tomorrow, Date.parse(activity.endAt));
    return sum + Math.max(0, end - start);
  }, 0);
  todaySummary.textContent = total ? `Учтено: ${formatTime(total)}` : "Пока нет записей";
}

function renderTimer() {
  const { activeTimer: active, categories } = timerState;
  const selectedCategoryData = active
    ? categories.find(({ id }) => id === active.categoryId)
    : categories.find(({ id }) => id === selectedCategory) ?? categories[0];
  selectedCategory = active?.categoryId ?? selectedCategoryData?.id;
  categoryName.textContent = selectedCategoryData?.name ?? (active ? "Категория недоступна" : "Нет категорий");
  categoryDot.hidden = !selectedCategoryData;
  categoryDot.style.setProperty("--category-color", selectedCategoryData?.color ?? "");

  const signature = JSON.stringify(categories);
  if (signature !== renderedCategories) {
    const rows = categories.map(({ id, name, color }) => {
      const row = document.createElement("li");
      const button = document.createElement("button");
      const dot = document.createElement("span");
      button.type = "button";
      button.dataset.category = id;
      dot.className = "category-dot";
      dot.style.setProperty("--category-color", color);
      button.append(dot, name);
      row.append(button);
      return row;
    });
    timerCategories.replaceChildren(...rows);
    renderedCategories = signature;
  }
  for (const button of timerCategories.querySelectorAll("button")) {
    const selected = button.dataset.category === selectedCategory;
    button.disabled = false;
    button.setAttribute("aria-pressed", String(selected));
  }

  timerAction.disabled = !active && !selectedCategoryData;
  timerAction.querySelector("span").textContent = active ? "Остановить" : "Начать";
  timerAction.querySelector("use").setAttribute("href", active ? "#icon-stop" : "#icon-play");
  categoryHeading.textContent = active ? "Переключить занятие" : "Занятия";
  renderClock();
  renderToday();
}

async function changeTimer(nextCategory) {
  if (saving || !timerState) return;
  saving = true;
  const previous = timerState.activeTimer;
  let message = "Таймер обновлён в другой вкладке";

  try {
    timerState = await chronosStorage.update((state) => {
      const active = state.activeTimer;
      if (active?.startAt !== previous?.startAt || active?.categoryId !== previous?.categoryId) {
        return state;
      }
      if (nextCategory && !state.categories.some(({ id }) => id === nextCategory)) {
        message = "Эта категория больше недоступна.";
        return state;
      }

      const now = Date.now();
      const activeStart = active ? Date.parse(active.startAt) : 0;
      const records = active ? splitActivity(active.categoryId, activeStart, now) : [];
      const earliestStart = state.activities.reduce(
        (latest, record) => Math.max(latest, Date.parse(record.endAt)), activeStart);
      if (nextCategory && now < earliestStart) {
        message = "Время устройства изменилось. Проверьте часы и попробуйте снова.";
        return state;
      }

      const activeTimer = nextCategory ? { categoryId: nextCategory, startAt: new Date(now).toISOString() } : null;
      if (activeTimer) {
        message = records.length ? "Запись сохранена. Занятие переключено." : "Идёт учёт";
      } else {
        message = records.length ? "Запись сохранена" : "Таймер остановлен";
      }
      return { ...state, activeTimer, activities: [...state.activities, ...records] };
    });
    renderTimer();
    timerStatus.textContent = message;
  } catch {
    timerStatus.textContent = "Не удалось сохранить изменения. Попробуйте ещё раз.";
  } finally {
    saving = false;
  }
}

timerAction.addEventListener("click", () => {
  changeTimer(timerState?.activeTimer ? null : selectedCategory);
});

timerCategories.addEventListener("click", (event) => {
  const category = event.target.closest("button")?.dataset.category;
  if (!timerState || saving || !category || category === selectedCategory) return;
  if (timerState.activeTimer) {
    changeTimer(category);
  } else {
    selectedCategory = category;
    timerStatus.textContent = "";
    renderTimer();
  }
});

function loadTimer() {
  try {
    timerState = chronosStorage.load();
    renderTimer();
    timerStatus.textContent = timerState.activeTimer ? "Идёт учёт" : "";
  } catch {
    timerState = undefined;
    timerAction.disabled = true;
    for (const button of timerCategories.querySelectorAll("button")) button.disabled = true;
    timerStatus.textContent = "Не удалось загрузить данные таймера.";
  }
}

function refreshClock() {
  if (!timerState) return;
  const now = Date.now();
  renderClock(now);
  if (localMidnight(now) !== lastSummaryDay) renderToday(now);
}

loadTimer();
chronosStorage.subscribe(() => { if (!saving) loadTimer(); }, { includeLocal: true });
document.addEventListener("visibilitychange", refreshClock);
window.setInterval(refreshClock, 250);
