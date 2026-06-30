(() => {
  const HABITS = [
    { title: 'Train', subtitle: '45 min training or recovery' },
    { title: 'Solitude', subtitle: '10 min alone, no noise' },
    { title: 'Write', subtitle: '10 min on the page' },
    { title: 'Read', subtitle: '10 min in a book' },
    { title: 'Water', subtitle: 'One gallon, finished' },
    { title: 'Fuel', subtitle: 'No cheat meals' },
  ];

  // Mock history for days before "today" — same fixture as the design comp.
  const PAST = ['complete', 'complete', 'missed', 'complete', 'complete', 'complete', 'complete', 'complete', 'complete', 'complete', 'complete', 'complete', 'complete', 'complete', 'complete'];

  const props = {
    day: 16,
    programLength: 30,
    showLegend: true,
  };

  const state = {
    checked: [true, true, false, true, true, false],
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
  };

  function toggle(index) {
    state.checked[index] = !state.checked[index];
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
    const total = props.programLength;
    const day = Math.max(1, Math.min(props.day, total));
    const todayIndex = day - 1;

    const done = state.checked.filter(Boolean).length;
    const todayStatus = done === 6 ? 'complete' : 'pending';

    const statuses = [];
    for (let d = 0; d < total; d++) {
      if (d < todayIndex) statuses.push(PAST[d] || 'complete');
      else if (d === todayIndex) statuses.push(todayStatus);
      else statuses.push('upcoming');
    }

    let streak = 0;
    for (let d = todayIndex; d >= 0; d--) {
      if (statuses[d] === 'complete') streak++;
      else break;
    }

    els.dayLine.textContent = `Day ${day} of ${total}`;
    els.streakNumber.textContent = String(streak);
    els.doneCount.textContent = `${done} / 6`;
    els.logTitle.textContent = `${total}-Day Log`;
    els.logCount.textContent = `${day} / ${total}`;
    els.legend.style.display = props.showLegend ? '' : 'none';

    [...els.checklist.children].forEach((item, i) => {
      item.classList.toggle('is-checked', !!state.checked[i]);
    });

    els.logGrid.innerHTML = '';
    statuses.forEach((status, d) => {
      const cell = document.createElement('div');
      cell.className = `log-cell log-cell--${status === 'pending' ? 'upcoming' : status}`;
      if (d === todayIndex) cell.classList.add('log-cell--today');
      els.logGrid.appendChild(cell);
    });
  }

  buildChecklist();
  render();
})();
