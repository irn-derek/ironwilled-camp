(() => {
  // Single source of truth for program dates — every other date in this file
  // is derived from CAMP_START, nothing else is hardcoded.
  const CAMP_START = new Date(2026, 6, 6); // July 6, 2026 — live now
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
  const POINTER_KEY = 'camp:pointer:v1';

  // Every date helper below uses local getters/constructors (getFullYear,
  // getMonth, getDate, setDate, the multi-arg Date constructor) — never
  // getUTC*, never a bare "YYYY-MM-DD" string (which Date parses as UTC
  // midnight). That keeps "today" anchored to the visitor's own clock.
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
  // identical to plain `new Date()`. Read fresh every call (not cached) so
  // a tab left open still sees the real date change at midnight.
  function resolveToday() {
    const override = new URLSearchParams(location.search).get('asOf');
    if (override) {
      const parsed = new Date(`${override}T00:00:00`);
      if (!isNaN(parsed)) return startOfDay(parsed);
    }
    return startOfDay(new Date());
  }

  const campStartDay = startOfDay(CAMP_START);

  function realDayOffset() {
    return Math.round((resolveToday() - campStartDay) / 86400000); // 0 === program day 1
  }

  function dateKeyForIndex(index) {
    return dateKey(addDays(campStartDay, index));
  }

  let days = loadJSON(DAYS_KEY);
  let asked = loadJSON(ASKED_KEY);
  let pointer = Object.assign({ manualOffset: null, lastSeenIndex: null }, loadJSON(POINTER_KEY));

  function persistPointer() {
    saveJSON(POINTER_KEY, pointer);
  }

  // Recomputed every sync() call, never cached across a day boundary.
  let isPreLaunch = false;
  let daysUntilStart = 0;
  let todayIndex = 0;
  let todayKey = '';
  let honestyQueue = [];

  const state = {
    checked: [false, false, false, false, false, false],
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
    honestyEyebrow: document.getElementById('honestyEyebrow'),
    honestyYes: document.getElementById('honestyYes'),
    honestyNo: document.getElementById('honestyNo'),
    advanceBtn: document.getElementById('advanceDayBtn'),
    advanceDayNum: document.getElementById('advanceDayNum'),
  };

  function loadTodayChecked() {
    const rec = days[todayKey];
    state.checked = rec ? rec.checked.slice() : [false, false, false, false, false, false];
  }

  function persistToday() {
    days[todayKey] = { checked: state.checked.slice() };
    saveJSON(DAYS_KEY, days);
  }

  function recordDone(index) {
    const rec = days[dateKeyForIndex(index)];
    return rec ? rec.checked.filter(Boolean).length : 0;
  }

  function isDayComplete(index) {
    return recordDone(index) === 6;
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
      if (isDayComplete(d)) streak++;
      else break;
    }
    return streak;
  }

  // Any day between the last day the tracker actually showed and the new
  // current day — whether that gap opened because the calendar rolled over
  // (possibly by more than one day), or because the user manually advanced —
  // gets queued for an honesty check if it wasn't completed and hasn't been
  // asked about yet.
  function queueGapDays(fromIndex, toIndex) {
    for (let d = fromIndex; d < toIndex; d++) {
      const key = dateKeyForIndex(d);
      if (!isDayComplete(d) && !asked[key]) {
        honestyQueue.push({ key, index: d });
      }
    }
  }

  // Recomputes the effective "current day" from the real calendar date and
  // any manual advance, and detects/queues any gap that opened since the
  // tracker was last shown. Safe to call repeatedly (on load, on an
  // interval, on tab focus) — a no-op if nothing has changed.
  function sync() {
    const real = realDayOffset();
    const raw = pointer.manualOffset != null ? Math.max(real, pointer.manualOffset) : real;

    isPreLaunch = raw < 0;
    daysUntilStart = isPreLaunch ? -raw : 0;
    todayIndex = Math.max(0, Math.min(raw, PROGRAM_LENGTH - 1));
    todayKey = dateKeyForIndex(todayIndex);

    if (pointer.lastSeenIndex === null) {
      // First-ever visit: nothing to audit, just record where we start.
      pointer.lastSeenIndex = todayIndex;
      persistPointer();
    } else if (!isPreLaunch && todayIndex > pointer.lastSeenIndex) {
      queueGapDays(pointer.lastSeenIndex, todayIndex);
      pointer.lastSeenIndex = todayIndex;
      persistPointer();
    }

    loadTodayChecked();
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

  function processHonestyQueue() {
    if (honestyQueue.length === 0) {
      els.honestyOverlay.hidden = true;
      return;
    }
    const item = honestyQueue[0];
    els.honestyEyebrow.textContent = `Day ${item.index + 1}`;
    els.honestyOverlay.hidden = false;

    const resolve = (completed) => {
      if (completed) {
        days[item.key] = { checked: [true, true, true, true, true, true] };
        saveJSON(DAYS_KEY, days);
      }
      asked[item.key] = true;
      saveJSON(ASKED_KEY, asked);
      honestyQueue.shift();
      processHonestyQueue();
      render();
    };

    els.honestyYes.onclick = () => resolve(true);
    els.honestyNo.onclick = () => resolve(false);
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

  function advanceDay() {
    if (state.checked.filter(Boolean).length !== 6) return;
    if (todayIndex >= PROGRAM_LENGTH - 1) return;
    persistToday();
    const next = todayIndex + 1;
    pointer.manualOffset = pointer.manualOffset != null ? Math.max(pointer.manualOffset, next) : next;
    persistPointer();
    sync();
    processHonestyQueue();
    render();
  }

  function buildChecklist() {
    els.checklist.innerHTML = '';
    HABITS.forEach((habit, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'checklist-item';
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
      item.disabled = isPreLaunch;
    });

    els.logGrid.innerHTML = '';
    for (let d = 0; d < PROGRAM_LENGTH; d++) {
      const status = isPreLaunch ? 'upcoming' : statusForDay(d, doneToday);
      const cell = document.createElement('div');
      cell.className = `log-cell log-cell--${status === 'pending' ? 'upcoming' : status}`;
      if (!isPreLaunch && d === todayIndex) cell.classList.add('log-cell--today');
      els.logGrid.appendChild(cell);
    }

    const canAdvance = !isPreLaunch && doneToday === 6 && todayIndex < PROGRAM_LENGTH - 1;
    els.advanceBtn.hidden = !canAdvance;
    if (canAdvance) els.advanceDayNum.textContent = String(todayIndex + 2);
  }

  function recheck() {
    sync();
    render();
    processHonestyQueue();
  }

  buildChecklist();
  sync();
  render();
  processHonestyQueue();

  els.toast.addEventListener('click', hideToast);
  els.advanceBtn.addEventListener('click', advanceDay);

  // Catches a calendar rollover while the tab stays open — a light polling
  // safety net plus an immediate recheck when the tab regains focus/visibility,
  // since backgrounded-tab timers are commonly throttled by the browser.
  setInterval(recheck, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) recheck();
  });
  window.addEventListener('focus', recheck);
})();
