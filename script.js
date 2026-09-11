(() => {
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
  const START_KEY = 'camp:start:v1';
  const MILESTONE_KEY = 'camp:milestone30:v1';
  const EXTRA_MILESTONES_SEEN_KEY = 'camp:milestonesSeen:v1';

  // Day-count check-ins that are encouragement only — a toast, nothing more.
  const LIGHT_MILESTONES = {
    35: { title: '35 days.', note: 'Five past the finish. Still going.' },
    55: { title: '55 days.', note: 'This is just what you do now.' },
  };

  // Reward-eligible: the flagship days (matches the Trophy Case) plus every
  // repeat Camp completion (30, 60, 90, ...). These get the reward dialog and
  // a pre-filled email, not just a toast — reserved for the genuinely big ones.
  const FLAGSHIP_DAYS = [50, 75, 100];
  const REWARD_EMAIL = 'derek@theironwilled.com';

  const TROPHIES = [
    { day: PROGRAM_LENGTH, label: 'Camp', title: 'Full Camp — 30 days complete' },
    { day: 50, label: '50', title: '50 Days' },
    { day: 75, label: '75', title: '75 Days' },
    { day: 100, label: '100', title: '100 Days' },
  ];

  function isCampCompletionDay(dayNumber) {
    return dayNumber % PROGRAM_LENGTH === 0;
  }

  function isRewardEligible(dayNumber) {
    return FLAGSHIP_DAYS.includes(dayNumber) || isCampCompletionDay(dayNumber);
  }

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

  // Day 1 is personal, not a shared calendar date — it's whatever day this
  // visitor first opens the tracker on, persisted so it never moves again.
  // A fixed global start date would mean everyone lands further into the
  // program the longer the link has been live, instead of starting at Day 1.
  function loadProgramStart() {
    const stored = localStorage.getItem(START_KEY);
    if (stored) {
      const parsed = new Date(`${stored}T00:00:00`);
      if (!isNaN(parsed)) return startOfDay(parsed);
    }
    const start = resolveToday();
    localStorage.setItem(START_KEY, dateKey(start));
    return start;
  }

  const programStart = loadProgramStart();

  function realDayOffset() {
    return Math.round((resolveToday() - programStart) / 86400000); // 0 === program day 1
  }

  function dateKeyForIndex(index) {
    return dateKey(addDays(programStart, index));
  }

  let days = loadJSON(DAYS_KEY);
  let asked = loadJSON(ASKED_KEY);
  let pointer = Object.assign({ manualOffset: null, lastSeenIndex: null }, loadJSON(POINTER_KEY));

  function persistPointer() {
    saveJSON(POINTER_KEY, pointer);
  }

  // Recomputed every sync() call, never cached across a day boundary.
  let todayIndex = 0;
  let todayKey = '';
  let honestyQueue = [];
  let honestyBatchTotal = 0;

  const state = {
    checked: [false, false, false, false, false, false],
  };

  const els = {
    dayLine: document.getElementById('dayLine'),
    campProgressEyebrow: document.getElementById('campProgressEyebrow'),
    campProgressNumber: document.getElementById('campProgressNumber'),
    campProgressLabel: document.getElementById('campProgressLabel'),
    campProgressCompletions: document.getElementById('campProgressCompletions'),
    streakNumber: document.getElementById('streakNumber'),
    doneCount: document.getElementById('doneCount'),
    checklist: document.getElementById('checklist'),
    logTitle: document.getElementById('logTitle'),
    logCount: document.getElementById('logCount'),
    logGrid: document.getElementById('logGrid'),
    legend: document.getElementById('legend'),
    toast: document.getElementById('campToast'),
    toastText: document.getElementById('campToastText'),
    toastStreak: document.getElementById('campToastStreak'),
    honestyOverlay: document.getElementById('honestyOverlay'),
    honestyDialog: document.getElementById('honestyDialog'),
    honestyEyebrow: document.getElementById('honestyEyebrow'),
    honestyProgress: document.getElementById('honestyProgress'),
    honestyYes: document.getElementById('honestyYes'),
    honestyNo: document.getElementById('honestyNo'),
    advanceBtn: document.getElementById('advanceDayBtn'),
    advanceAnywayBtn: document.getElementById('advanceAnywayBtn'),
    resetBtn: document.getElementById('resetBtn'),
    themeButtons: document.querySelectorAll('.camp-theme-btn'),
    dayDetailOverlay: document.getElementById('dayDetailOverlay'),
    dayDetailEyebrow: document.getElementById('dayDetailEyebrow'),
    dayDetailStatus: document.getElementById('dayDetailStatus'),
    dayDetailChecklist: document.getElementById('dayDetailChecklist'),
    dayDetailIntegrity: document.getElementById('dayDetailIntegrity'),
    dayDetailIntegrityConfirm: document.getElementById('dayDetailIntegrityConfirm'),
    dayDetailIntegrityCancel: document.getElementById('dayDetailIntegrityCancel'),
    dayDetailActions: document.getElementById('dayDetailActions'),
    dayDetailEditBtn: document.getElementById('dayDetailEditBtn'),
    dayDetailCloseBtn: document.getElementById('dayDetailCloseBtn'),
    milestoneOverlay: document.getElementById('milestoneOverlay'),
    milestoneEmailBtn: document.getElementById('milestoneEmailBtn'),
    milestoneKeepGoing: document.getElementById('milestoneKeepGoing'),
    milestoneStartOver: document.getElementById('milestoneStartOver'),
    trophyCase: document.getElementById('trophyCase'),
    claimRewardsLink: document.getElementById('claimRewardsLink'),
    rewardOverlay: document.getElementById('rewardOverlay'),
    rewardEyebrow: document.getElementById('rewardEyebrow'),
    rewardHeadline: document.getElementById('rewardHeadline'),
    rewardEmailBtn: document.getElementById('rewardEmailBtn'),
    rewardDismiss: document.getElementById('rewardDismiss'),
  };

  const THEME_KEY = 'camp:theme:v1';
  const THEMES = ['dark', 'light', 'stealth'];

  function loadTheme() {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      return THEMES.includes(stored) ? stored : 'dark';
    } catch (e) {
      return 'dark';
    }
  }

  function applyTheme(theme) {
    if (theme === 'dark') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    els.themeButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.themeChoice === theme);
    });
  }

  function setTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
    applyTheme(theme);
  }

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

  // How many full 30-day cycles have been completed — Camp #1 at day 30,
  // #2 at day 60, and so on. Requires them in sequence (matches how a
  // "completion" is meant to be earned); purely derived from the day
  // records, so it's always the current truth, not a stored counter.
  function campCompletionCount() {
    let count = 0;
    while (isDayComplete(PROGRAM_LENGTH * (count + 1) - 1)) count++;
    return count;
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
    const before = honestyQueue.length;
    for (let d = fromIndex; d < toIndex; d++) {
      const key = dateKeyForIndex(d);
      if (!isDayComplete(d) && !asked[key]) {
        honestyQueue.push({ key, index: d });
      }
    }
    honestyBatchTotal += honestyQueue.length - before;
  }

  // Recomputes the effective "current day" from the real calendar date and
  // any manual advance, and detects/queues any gap that opened since the
  // tracker was last shown. Safe to call repeatedly (on load, on an
  // interval, on tab focus) — a no-op if nothing has changed.
  function sync() {
    const real = realDayOffset();
    const raw = pointer.manualOffset != null ? Math.max(real, pointer.manualOffset) : real;

    // No upper clamp — the 30-day commitment doesn't force a stop. Streak and
    // the checklist keep running past Day 30; only the log's fixed window
    // (see render()) treats 30 as a boundary, and it slides forward instead.
    todayIndex = Math.max(0, raw);
    todayKey = dateKeyForIndex(todayIndex);

    if (pointer.lastSeenIndex === null) {
      // First-ever visit: nothing to audit, just record where we start.
      pointer.lastSeenIndex = todayIndex;
      persistPointer();
    } else if (todayIndex > pointer.lastSeenIndex) {
      queueGapDays(pointer.lastSeenIndex, todayIndex);
      pointer.lastSeenIndex = todayIndex;
      persistPointer();
    }

    loadTodayChecked();
  }

  let toastTimer = null;
  function showToast(streak) {
    els.toastText.textContent = 'Day forged.';
    els.toastStreak.textContent = `Streak ${streak}.`;
    els.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 3200);
  }
  function showMilestoneToast(dayNumber) {
    const m = LIGHT_MILESTONES[dayNumber];
    els.toastText.textContent = m.title;
    els.toastStreak.textContent = m.note;
    els.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 4200);
  }
  function hideToast() {
    els.toast.classList.remove('is-visible');
  }

  // ===================== REWARDS (email us — verified by conversation) =====================
  // The app can't prove honesty on its own (Advance Anyway and Day Detail
  // both exist), so rewards aren't auto-granted — they're an invitation to
  // email, with enough context (start date, today, streak, completions) to
  // make a quick, casual verification easy on the other end.
  function currentStreakValue() {
    const doneToday = state.checked.filter(Boolean).length;
    return doneToday === 6 ? historicalStreak() + 1 : historicalStreak();
  }

  function buildMailto(subject, body) {
    return `mailto:${REWARD_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function rewardMeta(dayNumber) {
    if (isCampCompletionDay(dayNumber)) {
      const campNum = dayNumber / PROGRAM_LENGTH;
      return { eyebrow: `Camp #${campNum}`, headline: `${dayNumber} days. Camp #${campNum}, done.` };
    }
    return { eyebrow: `Day ${dayNumber}`, headline: `${dayNumber} days. Milestone reached.` };
  }

  function verificationLines() {
    return [
      `Program started: ${dateKey(programStart)}`,
      `Today: ${dateKey(resolveToday())}`,
      `Current streak: ${currentStreakValue()}`,
      `Camp completions: ${campCompletionCount()}`,
    ];
  }

  function rewardMailBody(meta) {
    return [`I just hit: ${meta.headline}`, '', 'For verification:', ...verificationLines(), '', '(Sent from the Camp tracker.)'].join('\n');
  }

  let rewardActiveDay = null;
  function showRewardMilestone(dayNumber) {
    rewardActiveDay = dayNumber;
    const meta = rewardMeta(dayNumber);
    els.rewardEyebrow.textContent = meta.eyebrow;
    els.rewardHeadline.textContent = meta.headline;
    els.rewardEmailBtn.href = buildMailto(`Camp Milestone — ${meta.eyebrow}`, rewardMailBody(meta));
    els.rewardOverlay.hidden = false;
  }

  function closeReward() {
    if (rewardActiveDay != null) markMilestoneSeen(rewardActiveDay);
    els.rewardOverlay.hidden = true;
    rewardActiveDay = null;
  }

  function hasAnyReward() {
    if (campCompletionCount() >= 1) return true;
    return FLAGSHIP_DAYS.some((d) => isDayComplete(d - 1));
  }

  function claimRewardsMailBody() {
    const completions = campCompletionCount();
    return [
      "Here's where I'm at:",
      `- Camp completions: ${completions}`,
      ...FLAGSHIP_DAYS.map((d) => `- ${d} days: ${isDayComplete(d - 1) ? 'yes' : 'not yet'}`),
      '',
      ...verificationLines(),
      '',
      '(Sent from the Camp tracker.)',
    ].join('\n');
  }

  function processHonestyQueue() {
    if (honestyQueue.length === 0) {
      els.honestyOverlay.hidden = true;
      honestyBatchTotal = 0;
      maybeShowMilestone();
      checkOtherMilestones();
      return;
    }
    const item = honestyQueue[0];
    const position = honestyBatchTotal - honestyQueue.length + 1;
    els.honestyEyebrow.textContent = `Day ${item.index + 1}`;
    els.honestyProgress.textContent = honestyBatchTotal > 1 ? `${position} of ${honestyBatchTotal}` : '';
    els.honestyOverlay.hidden = false;
    // Re-trigger the entry fade on every item so consecutive queued days each
    // read as a new prompt, not a stuck repeat of the last one.
    els.honestyDialog.classList.remove('is-entering');
    void els.honestyDialog.offsetWidth;
    els.honestyDialog.classList.add('is-entering');

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
      // Day 30 gets its own dialog; other reward-eligible days (flagship
      // days and repeat Camp completions) get the reward dialog; the light
      // check-ins get a bigger toast; everything else gets the everyday one.
      // Never more than one at once — they'd step on the same moment.
      const dayNumber = todayIndex + 1;
      if (dayNumber === PROGRAM_LENGTH) {
        maybeShowMilestone();
      } else if (isRewardEligible(dayNumber)) {
        showRewardMilestone(dayNumber);
      } else if (LIGHT_MILESTONES[dayNumber]) {
        showMilestoneToast(dayNumber);
        markMilestoneSeen(dayNumber);
      } else {
        showToast(historicalStreak() + 1);
      }
    }
  }

  function doAdvance() {
    persistToday();
    const next = todayIndex + 1;
    pointer.manualOffset = pointer.manualOffset != null ? Math.max(pointer.manualOffset, next) : next;
    persistPointer();
    sync();
    processHonestyQueue();
    render();
  }

  function advanceDay() {
    if (state.checked.filter(Boolean).length !== 6) return;
    doAdvance();
  }

  // A day that ends incomplete still counts — it just goes in the log as
  // missed, same as a day skipped by the real calendar. Lets someone get
  // back on track tomorrow instead of being stuck unable to move on, or
  // feeling like a full reset is the only way forward.
  function advanceAnyway() {
    const doneToday = state.checked.filter(Boolean).length;
    if (doneToday === 6) return;
    if (!confirm(`Mark Day ${todayIndex + 1} incomplete and move to Day ${todayIndex + 2}?`)) return;
    // Already explicitly acknowledged above — don't also queue an honesty
    // prompt asking the same thing again once the day is behind us.
    asked[todayKey] = true;
    saveJSON(ASKED_KEY, asked);
    doAdvance();
  }

  // Wipes all local progress and re-anchors Day 1 to today — for a failed
  // attempt or a deliberate restart, not something that should ever require
  // digging into devtools.
  function performReset() {
    localStorage.removeItem(DAYS_KEY);
    localStorage.removeItem(ASKED_KEY);
    localStorage.removeItem(POINTER_KEY);
    localStorage.removeItem(START_KEY);
    localStorage.removeItem(MILESTONE_KEY);
    localStorage.removeItem(EXTRA_MILESTONES_SEEN_KEY);
    location.reload();
  }

  function resetProgram() {
    if (!confirm('Reset all progress and start over at Day 1?')) return;
    performReset();
  }

  // ===================== 30-DAY MILESTONE =====================
  // Fires the first time Day 30 is seen complete — whether that's the live
  // moment of checking the 6th box, or just opening the app later and
  // finding it already done (including for anyone who'd already finished
  // before this existed). Shown once; "Keep Going" just records that and
  // lets the now-uncapped program continue, "Start Over" resets outright.
  function maybeShowMilestone() {
    if (honestyQueue.length > 0) return; // let the honesty backlog clear first
    if (localStorage.getItem(MILESTONE_KEY) === 'true') return;
    if (!isDayComplete(PROGRAM_LENGTH - 1)) return;
    const meta = rewardMeta(PROGRAM_LENGTH);
    els.milestoneEmailBtn.href = buildMailto(`Camp Milestone — ${meta.eyebrow}`, rewardMailBody(meta));
    els.milestoneOverlay.hidden = false;
  }

  function dismissMilestone() {
    localStorage.setItem(MILESTONE_KEY, 'true');
    els.milestoneOverlay.hidden = true;
  }

  // ===================== OTHER MILESTONES (35, 50, 55, 75, 90+, 100...) =====================
  function markMilestoneSeen(dayNumber) {
    const seen = loadJSON(EXTRA_MILESTONES_SEEN_KEY);
    seen[dayNumber] = true;
    saveJSON(EXTRA_MILESTONES_SEEN_KEY, seen);
  }

  // Catches the same "already done before you opened the app" case as Day
  // 30 — checked in ascending order so a long absence surfaces the earliest
  // unseen milestone first, one at a time rather than piling them up.
  function checkOtherMilestones() {
    if (honestyQueue.length > 0) return;
    if (!els.milestoneOverlay.hidden) return;
    if (!els.rewardOverlay.hidden) return;
    const seen = loadJSON(EXTRA_MILESTONES_SEEN_KEY);
    const candidates = new Set(Object.keys(LIGHT_MILESTONES).map(Number));
    FLAGSHIP_DAYS.forEach((d) => candidates.add(d));
    for (let k = 2; PROGRAM_LENGTH * k <= todayIndex + 1; k++) candidates.add(PROGRAM_LENGTH * k);
    const ordered = [...candidates].sort((a, b) => a - b);
    for (const dayNumber of ordered) {
      if (seen[dayNumber]) continue;
      if (!isDayComplete(dayNumber - 1)) continue;
      if (isRewardEligible(dayNumber)) {
        showRewardMilestone(dayNumber);
      } else {
        showMilestoneToast(dayNumber);
        markMilestoneSeen(dayNumber);
      }
      return;
    }
  }

  // ===================== DAY DETAIL (view/edit a past day) =====================
  // Locked (read-only) by default every time it opens, even for a day that
  // was unlocked in a previous visit — the integrity gate should mean
  // something each time, not just once ever.
  let dayDetailIndex = null;
  let dayDetailUnlocked = false;

  function dayDetailChecked() {
    const rec = days[dateKeyForIndex(dayDetailIndex)];
    return rec ? rec.checked.slice() : [false, false, false, false, false, false];
  }

  function renderDayDetail() {
    const checked = dayDetailChecked();
    const done = checked.filter(Boolean).length;

    els.dayDetailEyebrow.textContent = `Day ${dayDetailIndex + 1}`;
    els.dayDetailStatus.textContent = done === 6 ? 'Complete' : `${done} / 6`;

    els.dayDetailChecklist.innerHTML = '';
    HABITS.forEach((habit, i) => {
      const row = document.createElement(dayDetailUnlocked ? 'button' : 'div');
      if (dayDetailUnlocked) row.type = 'button';
      row.className = 'checklist-item' + (dayDetailUnlocked ? '' : ' checklist-item--locked');
      row.classList.toggle('is-checked', !!checked[i]);
      row.innerHTML = checklistItemInnerHTML(habit);
      if (dayDetailUnlocked) {
        row.addEventListener('click', () => toggleDayDetailItem(i));
      }
      els.dayDetailChecklist.appendChild(row);
    });

    els.dayDetailIntegrity.hidden = true;
    els.dayDetailActions.hidden = false;
    els.dayDetailEditBtn.hidden = dayDetailUnlocked;
  }

  function toggleDayDetailItem(i) {
    const checked = dayDetailChecked();
    checked[i] = !checked[i];
    days[dateKeyForIndex(dayDetailIndex)] = { checked };
    saveJSON(DAYS_KEY, days);
    renderDayDetail();
    render(); // streak and the log grid both depend on this day's record
  }

  function openDayDetail(index) {
    dayDetailIndex = index;
    dayDetailUnlocked = false;
    renderDayDetail();
    els.dayDetailOverlay.hidden = false;
  }

  function closeDayDetail() {
    els.dayDetailOverlay.hidden = true;
    dayDetailIndex = null;
  }

  function requestDayDetailEdit() {
    els.dayDetailActions.hidden = true;
    els.dayDetailIntegrity.hidden = false;
  }

  function confirmDayDetailEdit() {
    dayDetailUnlocked = true;
    renderDayDetail();
  }

  function cancelDayDetailEdit() {
    els.dayDetailIntegrity.hidden = true;
    els.dayDetailActions.hidden = false;
  }

  function checklistItemInnerHTML(habit) {
    return `
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
  }

  function buildChecklist() {
    els.checklist.innerHTML = '';
    HABITS.forEach((habit, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'checklist-item';
      button.innerHTML = checklistItemInnerHTML(habit);
      button.addEventListener('click', () => toggle(i));
      els.checklist.appendChild(button);
    });
  }

  function render() {
    const doneToday = state.checked.filter(Boolean).length;
    const streak = doneToday === 6 ? historicalStreak() + 1 : historicalStreak();
    const pastProgram = todayIndex >= PROGRAM_LENGTH;

    els.dayLine.textContent = pastProgram
      ? `Day ${todayIndex + 1} — Camp Complete`
      : `Day ${todayIndex + 1} of ${PROGRAM_LENGTH}`;
    els.streakNumber.textContent = String(streak);
    els.doneCount.textContent = `${doneToday} / 6`;

    // The main event: not "how far into the program," but "how close to
    // completing Camp." Retargets itself the instant a Camp is finished —
    // completions is derived fresh every render, so the next target (Camp
    // #2, #3, ...) just appears with no special-casing for "just finished."
    const completions = campCompletionCount();
    const nextCampDay = PROGRAM_LENGTH * (completions + 1);
    const daysToNextCamp = Math.max(0, nextCampDay - (todayIndex + 1));
    const targetLabel = completions === 0 ? 'Camp' : `Camp #${completions + 1}`;
    els.campProgressEyebrow.textContent = `To ${targetLabel}`;
    els.campProgressNumber.textContent = String(daysToNextCamp);
    els.campProgressLabel.textContent = `Days to ${targetLabel}`;
    els.campProgressCompletions.textContent = `Camp Completions: ${completions}`;

    const anyReward = hasAnyReward();
    els.claimRewardsLink.hidden = !anyReward;
    if (anyReward) {
      els.claimRewardsLink.href = buildMailto('Camp Rewards', claimRewardsMailBody());
    }

    // Through Day 30 the log is the fixed program grid. From Day 31 on, it
    // becomes a rolling window of the most recent 30 days — always 30 cells,
    // sliding forward with today — so finishing the program never means the
    // log (or the streak driving it) has to stop.
    const windowStart = Math.max(0, todayIndex - PROGRAM_LENGTH + 1);
    els.logTitle.textContent = pastProgram ? 'Last 30 Days' : `${PROGRAM_LENGTH}-Day Log`;
    els.logCount.textContent = pastProgram
      ? `${windowStart + 1}–${todayIndex + 1}`
      : `${todayIndex + 1} / ${PROGRAM_LENGTH}`;

    [...els.checklist.children].forEach((item, i) => {
      item.classList.toggle('is-checked', !!state.checked[i]);
    });

    els.logGrid.innerHTML = '';
    for (let d = windowStart; d <= windowStart + PROGRAM_LENGTH - 1; d++) {
      const status = statusForDay(d, doneToday);
      const cell = document.createElement('div');
      cell.className = `log-cell log-cell--${status === 'pending' ? 'upcoming' : status}`;
      if (d === todayIndex) cell.classList.add('log-cell--today');
      if (d < todayIndex) {
        cell.classList.add('log-cell--clickable');
        cell.addEventListener('click', () => openDayDetail(d));
      }
      els.logGrid.appendChild(cell);
    }

    els.advanceBtn.hidden = doneToday !== 6;
    els.advanceAnywayBtn.hidden = doneToday === 6;

    renderTrophyCase();
  }

  // Purely derived from the day records, same as everything else — earned
  // status always reflects the truth, so correcting a day in Day Detail
  // (e.g. un-completing an accidental Day 30) un-earns the trophy too.
  function renderTrophyCase() {
    els.trophyCase.innerHTML = '';
    TROPHIES.forEach((t) => {
      const earned = isDayComplete(t.day - 1);
      const badge = document.createElement('div');
      badge.className = 'trophy-badge' + (earned ? ' is-earned' : '');
      badge.title = t.title;
      badge.innerHTML = `
        <span class="trophy-badge__icon"></span>
        <span class="trophy-badge__label">${t.label}</span>
      `;
      els.trophyCase.appendChild(badge);
    });
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
  applyTheme(loadTheme());

  els.toast.addEventListener('click', hideToast);
  els.advanceBtn.addEventListener('click', advanceDay);
  els.advanceAnywayBtn.addEventListener('click', advanceAnyway);
  els.resetBtn.addEventListener('click', resetProgram);
  els.themeButtons.forEach((btn) => {
    btn.addEventListener('click', () => setTheme(btn.dataset.themeChoice));
  });
  els.dayDetailEditBtn.addEventListener('click', requestDayDetailEdit);
  els.dayDetailIntegrityConfirm.addEventListener('click', confirmDayDetailEdit);
  els.dayDetailIntegrityCancel.addEventListener('click', cancelDayDetailEdit);
  els.dayDetailCloseBtn.addEventListener('click', closeDayDetail);
  els.dayDetailOverlay.addEventListener('click', (e) => {
    if (e.target === els.dayDetailOverlay) closeDayDetail();
  });
  els.milestoneKeepGoing.addEventListener('click', dismissMilestone);
  els.milestoneStartOver.addEventListener('click', performReset);
  els.rewardEmailBtn.addEventListener('click', closeReward);
  els.rewardDismiss.addEventListener('click', closeReward);

  // Catches a calendar rollover while the tab stays open — a light polling
  // safety net plus an immediate recheck when the tab regains focus/visibility,
  // since backgrounded-tab timers are commonly throttled by the browser.
  setInterval(recheck, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) recheck();
  });
  window.addEventListener('focus', recheck);
})();
