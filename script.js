(() => {
  // Single source of truth for program dates — every other date in this file
  // is derived from CAMP_START, nothing else is hardcoded.
  const CAMP_START = new Date(2026, 7, 1); // August 1, 2026
  const PROGRAM_LENGTH = 30;

  const HABITS = [
    { title: 'Train', subtitle: '45 min training or recovery' },
    { title: 'Solitude', subtitle: '10 min alone, no noise' },
    { title: 'Write', subtitle: '10 min on the page' },
    { title: 'Read', subtitle: '10 min in a book' },
    { title: 'Water', subtitle: 'One gallon, finished' },
    { title: 'Fuel', subtitle: 'No cheat meals' },
  ];

  const DAYS_KEY = 'camp:days:v1';
  const ASKED_KEY = 'camp:asked:v1';

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function dateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function loadJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ?asOf=YYYY-MM-DD lets a real visitor URL preview any program day for
  // testing, without touching the system clock. Absent, behavior is
  // identical to plain `new Date()`.
  function resolveToday() {
    const override = new URLSearchParams(location.search).get('asOf');
    if (override) {
      const parsed = new Date(`${override}T00:00:00`);
      if (!isNaN(parsed)) return startOfDay(parsed);
    }
    return startOfDay(new Date());
  }

  const campStartDay = startOfDay(CAMP_START);
  const today = resolveToday();
  const dayOffset = Math.round((today - campStartDay) / 86400000); // 0 === program day 1

  const isPreLaunch = dayOffset < 0;
  const daysUntilStart = isPreLaunch ? -dayOffset : 0;
  const todayIndex = Math.max(0, Math.min(dayOffset, PROGRAM_LENGTH - 1));
  const todayKey = dateKey(today);

  function dateKeyForIndex(index) {
    return dateKey(addDays(campStartDay, index));
  }

  let days = loadJSON(DAYS_KEY);
  let asked = loadJSON(ASKED_KEY);

  const state = {
    checked: (days[todayKey] && days[todayKey].checked)
      ? days[todayKey].checked.slice()
      : [false, false, false, false, false, false],
  };

  const els = {
    dayLine: document.getElementById('dayLine'),
    streakNumber: document.getElementById('streakNumber'),
    doneCount: document.getElementById('doneCount'),
    checklist: document.getElementById('checklist'),
    logTitle: document.getElementById('logTitle'),
    logCount: document.getElementById('logCount'),
    logGrid: document.getElementById('logGrid'),
    legend: document.getElementById('legend'),
    toast: document.getElementById('campToast'),
    toastStreak: document.getElementById('campToastStreak'),
    honestyOverlay: document.getElementById('honestyOverlay'),
    honestyYes: document.getElementById('honestyYes'),
    honestyNo: document.getElementById('honestyNo'),
  };

  function persistToday() {
    days[todayKey] = { checked: state.checked.slice() };
    saveJSON(DAYS_KEY, days);
  }

  function recordDone(index) {
    const rec = days[dateKeyForIndex(index)];
    return rec ? rec.checked.filter(Boolean).length : 0;
  }

  // Days with no stored record are "upcoming" rather than "missed" — we have
  // no evidence the user had even started using the tracker yet that day.
  function statusForDay(index, doneToday) {
    if (index === todayIndex) return doneToday === 6 ? 'complete' : 'pending';
    if (index > todayIndex) return 'upcoming';
    const rec = days[dateKeyForIndex(index)];
    if (!rec) return 'upcoming';
    return rec.checked.filter(Boolean).length === 6 ? 'complete' : 'missed';
  }

  function historicalStreak() {
    let streak = 0;
    for (let d = todayIndex - 1; d >= 0; d--) {
      if (recordDone(d) === 6) streak++;
      else break;
    }
    return streak;
  }

  let toastTimer = null;
  function showToast(streak) {
    els.toastStreak.textContent = `Streak ${streak}.`;
    els.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 3200);
  }
  function hideToast() {
    els.toast.classList.remove('is-visible');
  }

  function toggle(index) {
    const prevDone = state.checked.filter(Boolean).length;
    state.checked[index] = !state.checked[index];
    const newDone = state.checked.filter(Boolean).length;
    persistToday();
    render();
    if (prevDone < 6 && newDone === 6) {
      showToast(historicalStreak() + 1);
    }
  }

  function buildChecklist() {
    els.checklist.innerHTML = '';
    HABITS.forEach((habit, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'checklist-item';
      button.disabled = isPreLaunch;
      button.innerHTML = `
        <span class="checklist-item__accent"></span>
        <span class="checklist-item__box">
          <span class="checklist-item__fill">
            <span class="checklist-item__check"></span>
          </span>
        </span>
        <span class="checklist-item__copy">
          <span class="checklist-item__title">${habit.title}</span>
          <span class="checklist-item__subtitle">${habit.subtitle}</span>
        </span>
      `;
      button.addEventListener('click', () => toggle(i));
      els.checklist.appendChild(button);
    });
  }

  function render() {
    const doneToday = state.checked.filter(Boolean).length;

    if (isPreLaunch) {
      const label = daysUntilStart === 1 ? 'day' : 'days';
      els.dayLine.textContent = `Camp starts in ${daysUntilStart} ${label}`;
      els.streakNumber.textContent = '0';
      els.doneCount.textContent = '0 / 6';
    } else {
      const streak = doneToday === 6 ? historicalStreak() + 1 : historicalStreak();
      els.dayLine.textContent = `Day ${todayIndex + 1} of ${PROGRAM_LENGTH}`;
      els.streakNumber.textContent = String(streak);
      els.doneCount.textContent = `${doneToday} / 6`;
    }

    els.logTitle.textContent = `${PROGRAM_LENGTH}-Day Log`;
    els.logCount.textContent = isPreLaunch ? `— / ${PROGRAM_LENGTH}` : `${todayIndex + 1} / ${PROGRAM_LENGTH}`;

    [...els.checklist.children].forEach((item, i) => {
      item.classList.toggle('is-checked', !!state.checked[i]);
    });

    els.logGrid.innerHTML = '';
    for (let d = 0; d < PROGRAM_LENGTH; d++) {
      const status = isPreLaunch ? 'upcoming' : statusForDay(d, doneToday);
      const cell = document.createElement('div');
      cell.className = `log-cell log-cell--${status === 'pending' ? 'upcoming' : status}`;
      if (!isPreLaunch && d === todayIndex) cell.classList.add('log-cell--today');
      els.logGrid.appendChild(cell);
    }
  }

  function maybePromptYesterdayHonesty() {
    if (isPreLaunch || todayIndex - 1 < 0) return;
    const yesterdayKey = dateKeyForIndex(todayIndex - 1);
    const rec = days[yesterdayKey];
    if (!rec || asked[yesterdayKey]) return;
    if (rec.checked.filter(Boolean).length === 6) return;

    els.honestyOverlay.hidden = false;

    const resolve = (completed) => {
      if (completed) {
        days[yesterdayKey] = { checked: [true, true, true, true, true, true] };
        saveJSON(DAYS_KEY, days);
      }
      asked[yesterdayKey] = true;
      saveJSON(ASKED_KEY, asked);
      els.honestyOverlay.hidden = true;
      render();
    };

    els.honestyYes.onclick = () => resolve(true);
    els.honestyNo.onclick = () => resolve(false);
  }

  buildChecklist();
  render();
  els.toast.addEventListener('click', hideToast);
  maybePromptYesterdayHonesty();
})();
