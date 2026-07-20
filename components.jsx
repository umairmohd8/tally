// ============================================
// HABIT UTILITIES + UI COMPONENTS · Inkwell skin
// ============================================

// ---- Colors ----
const COLORS = [
  { key: 'pop',    value: '#E66B3D' },
  { key: 'cloud',  value: '#86B89A' },
  { key: 'butter', value: '#D4A656' },
  { key: 'cobalt', value: '#5C7DB0' },
  { key: 'plum',   value: '#9F6DA8' },
  { key: 'stone',  value: '#7A726A' },
];
const colorOf = (key) => (COLORS.find(c => c.key === key) || COLORS[0]).value;

// ---- Day math ----
const dayKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (date) => {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7; // Convert Sunday (0) to 7
  d.setDate(d.getDate() - (day - 1));
  return d;
};

// ---- Schedule ----
function getSchedule(habit) {
  if (habit && habit.schedule) return habit.schedule;
  return { type: 'daily' };
}
// ---- Deadline ----
// habit.endDate is a "YYYY-MM-DD" dayKey = the LAST active day (inclusive). Absent = forever.
function isEnded(habit, date) {
  if (!habit || !habit.endDate) return false;
  return dayKey(date) > habit.endDate;
}
// inclusive day count between two dayKeys ("2026-05-29")
function dayCountBetween(startKey, endKey) {
  try {
    const s = new Date(startKey + 'T00:00:00');
    const e = new Date(endKey + 'T00:00:00');
    return Math.round((e - s) / 86400000) + 1;
  } catch (_) { return 0; }
}
function endDateLabel(habit) {
  if (!habit || !habit.endDate) return '';
  try {
    const d = new Date(habit.endDate + 'T00:00:00');
    return d.toLocaleString('en', { month: 'short', day: 'numeric' }).toLowerCase();
  } catch (_) { return habit.endDate; }
}

const isScheduled = (habit, date) => {
  if (isEnded(habit, date)) return false;
  const sc = getSchedule(habit);
  if (sc.type === 'daily') return true;
  if (sc.type === 'specific_days') return (sc.days || []).includes(date.getDay());
  if (sc.type === 'weekly_count') return true;
  return true;
};
function scheduleLabel(habit) {
  const sc = getSchedule(habit);
  if (sc.type === 'daily') return 'every day';
  if (sc.type === 'weekly_count') return `${sc.count}× / week`;
  if (sc.type === 'specific_days') {
    const days = (sc.days || []).slice().sort();
    if (days.length === 7) return 'every day';
    if (days.length === 5 && days.join(',') === '1,2,3,4,5') return 'weekdays';
    if (days.length === 2 && days.join(',') === '0,6') return 'weekends';
    return days.map(d => ['S','M','T','W','T','F','S'][d]).join(' ');
  }
  return '';
}

// ---- Pause ----
// Pause windows bridge: days inside are neither credited nor counted as slips.
function isPausedOn(date, pause) {
  if (!pause) return false;
  const k = dayKey(date);
  return k >= pause.startDate && k <= pause.endDate;
}

// ---- Streak: "Don't miss twice" ----
// Walk back; allow exactly ONE missed scheduled day before resetting.
// Today only counts if completed; an uncompleted today is treated as "in progress" (skipped, not slipped).
// Pause days bridge: skipped entirely, no credit, no slip cost. Strict — slip allowance does not refresh across a pause.
function computeStreak(habit, today, pause) {
  const sc = getSchedule(habit);
  if (sc.type === 'weekly_count') {
    const target = sc.count || 1;
    let weeks = 0;
    if (weekCompletions(habit, today, pause) >= target) weeks++;
    let cursor = addDays(startOfWeek(today), -7);
    for (let i = 0; i < 104; i++) {
      if (weekCompletions(habit, cursor, pause) >= target) weeks++;
      else break;
      cursor = addDays(cursor, -7);
    }
    return weeks;
  }
  let streak = 0;
  let allowedSlip = 1;
  let cur = new Date(today);
  if (!habit.completions[dayKey(cur)] && isScheduled(habit, cur) && !isPausedOn(cur, pause)) {
    cur = addDays(cur, -1);
  }
  for (let i = 0; i < 365; i++) {
    if (isPausedOn(cur, pause)) {
      // bridge
    } else if (isScheduled(habit, cur)) {
      if (habit.completions[dayKey(cur)]) {
        streak++;
      } else if (allowedSlip > 0) {
        allowedSlip--;
      } else {
        break;
      }
    }
    cur = addDays(cur, -1);
  }
  return streak;
}

function slippedYesterday(habit, today, pause) {
  // Weekly-count habits have no per-day cadence — you have the whole week to
  // hit the target, so a single un-checked day is never a "slip".
  if (getSchedule(habit).type === 'weekly_count') return false;
  const yesterday = addDays(today, -1);
  if (isPausedOn(yesterday, pause)) return false;
  if (!isScheduled(habit, yesterday)) return false;
  if (habit.completions[dayKey(yesterday)]) return false;
  for (let i = 2; i < 6; i++) {
    const d = addDays(today, -i);
    if (isPausedOn(d, pause)) continue;
    if (habit.completions[dayKey(d)]) return true;
  }
  return false;
}

function weekCompletions(habit, anyDateInWeek, pause) {
  const start = startOfWeek(anyDateInWeek);
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    if (isPausedOn(d, pause)) continue;
    if (habit.completions[dayKey(d)]) n++;
  }
  return n;
}

function formatReminderTime(t) {
  if (!t) return null;
  const [hh, mm] = t.split(':').map(Number);
  if (Number.isNaN(hh)) return t;
  const period = hh >= 12 ? 'pm' : 'am';
  const h12 = ((hh + 11) % 12) + 1;
  return mm === 0 ? `${h12}${period}` : `${h12}:${String(mm).padStart(2, '0')}${period}`;
}

// ---- Time-of-day buckets ----
const TOD_BUCKETS = [
  { id: 'morning',   label: 'morning',   glyph: '☀' },
  { id: 'afternoon', label: 'afternoon', glyph: '◐' },
  { id: 'evening',   label: 'evening',   glyph: '☾' },
  { id: 'whenever',  label: 'whenever',  glyph: '·' },
];

window.HabitUtils = {
  COLORS, colorOf, dayKey, addDays, startOfWeek,
  getSchedule, isScheduled, scheduleLabel,
  computeStreak, slippedYesterday, weekCompletions,
  formatReminderTime, TOD_BUCKETS, isPausedOn,
  isEnded, endDateLabel, dayCountBetween,
};

// ============================================
// CHECK SVG — animated stroke-draw
// ============================================
function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <path className="check-path" d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

// ============================================
// HABIT ROW · the hero interaction lives here
// ============================================
function HabitRow({ habit, today, pause, onToggle, onDelete, onEdit, onPausedTap }) {
  const {
    colorOf, dayKey, addDays, isScheduled, computeStreak,
    getSchedule, weekCompletions, scheduleLabel, formatReminderTime,
    slippedYesterday, isPausedOn, isEnded, dayCountBetween,
  } = window.HabitUtils;

  const todayKey = dayKey(today);
  const done = !!habit.completions[todayKey];
  const swatch = colorOf(habit.color);
  const sc = getSchedule(habit);
  const isWeekly = sc.type === 'weekly_count';
  const weekDone = isWeekly ? weekCompletions(habit, today, pause) : 0;
  const weekMet = isWeekly && weekDone >= (sc.count || 1);
  const streak = computeStreak(habit, today, pause);
  const timeLabel = formatReminderTime(habit.reminderTime);
  const slipped = slippedYesterday(habit, today, pause);
  const pausedToday = isPausedOn(today, pause);
  const ended = isEnded(habit, today);
  const endedDays = ended && habit.endDate ? dayCountBetween(habit.createdAt || habit.endDate, habit.endDate) : 0;

  // 7-day dots
  const dots = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const k = dayKey(d);
    const sched = isScheduled(habit, d);
    const filled = !!habit.completions[k];
    const paused = isPausedOn(d, pause);
    const isToday = i === 0;
    const isYesterday = i === 1;
    let slippedDot = false;
    if (isYesterday && !filled && sched && !paused && !isWeekly) {
      for (let j = 2; j < 6; j++) {
        const dd = addDays(today, -j);
        if (isPausedOn(dd, pause)) continue;
        if (habit.completions[dayKey(dd)]) { slippedDot = true; break; }
      }
    }
    dots.push({ k, filled, sched, paused, isToday, slippedDot });
  }

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [pulse, setPulse] = React.useState(false);
  React.useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    setTimeout(() => window.addEventListener('click', close, { once: true }), 0);
    return () => window.removeEventListener('click', close);
  }, [menuOpen]);

  const handleToggle = (e) => {
    e?.stopPropagation();
    if (ended) return;
    if (pausedToday) {
      onPausedTap && onPausedTap();
      return;
    }
    if (navigator.vibrate && !done) {
      try { navigator.vibrate(8); } catch (_) {}
    }
    if (!done) {
      setPulse(true);
      setTimeout(() => setPulse(false), 500);
    }
    onToggle(habit.id, todayKey);
  };

  const scheduledToday = isScheduled(habit, today);

  const handleEdit = (e) => {
    e?.stopPropagation();
    onEdit && onEdit(habit);
  };

  return (
    <div className={`habit ${done || weekMet ? 'done' : ''} ${!scheduledToday && !isWeekly && !ended ? 'rest' : ''} ${pausedToday ? 'paused' : ''} ${ended ? 'ended' : ''}`}>
      <button
        className={`check ${done ? 'checked' : ''} ${pulse ? 'pulse' : ''}`}
        onClick={handleToggle}
        disabled={ended}
        aria-label={done ? `Mark ${habit.name} incomplete` : `Mark ${habit.name} complete`}
        style={{ borderColor: done && !ended ? swatch : undefined, background: done && !ended ? swatch : undefined }}
      >
        <CheckMark />
      </button>

      <div className="habit-body" role="button" tabIndex={0} onClick={handleEdit}
           onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEdit(e); } }}>
        <div className="habit-name">
          <span className="swatch" style={{ background: swatch }} />
          <span className="habit-name-text">{habit.name}</span>
          {ended && (
            <span className="meta-pill finished">{endedDays > 0 ? `done · ${endedDays} day${endedDays === 1 ? '' : 's'}` : 'finished'}</span>
          )}
          {habit.shareMode && habit.shareMode !== 'private' && (
            <span className="meta-pill shared" title="Friends can see this habit">shared</span>
          )}
          {!scheduledToday && !isWeekly && !ended && (
            <span className="meta-pill" style={{ background: 'transparent', color: 'var(--ink-30)', border: '1px solid var(--smoke)' }}>rest day</span>
          )}
          {slipped && !done && scheduledToday && !pausedToday && (
            <span className="meta-pill slip" title="Yesterday slipped. Streak still alive.">slipped yesterday</span>
          )}
          {isWeekly && (
            <span className={`meta-pill week ${weekMet ? 'met' : ''}`} title="Completions this week">
              {weekDone}/{sc.count}
              {weekMet && <window.Icons.Check size={9} stroke={3} />}
            </span>
          )}
        </div>
        <div className="habit-meta">
          {streak > 0 && (
            <span className="item" title={isWeekly ? `${streak} week streak` : `${streak} day streak`}>
              <span>{streak}{isWeekly ? 'w' : 'd'}</span>
            </span>
          )}
          <span className="item">{scheduleLabel(habit)}</span>
          {timeLabel && <span className="meta-pill time">{timeLabel}</span>}
          <span className="streak-dots" aria-label="Last 7 days">
            {dots.map((dot) => (
              <span
                key={dot.k}
                className={`streak-dot ${dot.filled ? 'filled' : ''} ${dot.slippedDot ? 'slipped' : ''} ${dot.paused ? 'paused' : ''} ${dot.isToday ? 'today' : ''}`}
                style={dot.filled && !dot.paused ? { background: swatch } : undefined}
                title={dot.paused ? `${dot.k} · paused` : dot.k}
              />
            ))}
          </span>
        </div>
      </div>

      <div className="habit-actions" style={{ position: 'relative' }}>
        <button
          className="icon-btn"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
          aria-label="More options"
          aria-expanded={menuOpen}
        >
          <window.Icons.More />
        </button>
        {menuOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: 40, right: 0, zIndex: 10,
              background: 'var(--card)', border: '1px solid var(--smoke)',
              borderRadius: 10, boxShadow: 'var(--shadow-lg)', minWidth: 160, padding: 4,
            }}
          >
            <button
              onClick={() => { onEdit && onEdit(habit); setMenuOpen(false); }}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6,
                fontSize: 13, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--card-2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <window.Icons.Edit size={13} /> Edit habit
            </button>
            <button
              onClick={() => { onDelete(habit.id); setMenuOpen(false); }}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6,
                fontSize: 13, color: 'var(--pop)', display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--card-2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <window.Icons.Trash size={13} /> Archive habit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// HABIT MODAL · add + edit · time-of-day instead of section
// ============================================
function HabitModal({ habit, onClose, onSubmit, onArchive, defaultTimeOfDay, friends = [], getShares }) {
  const { dayKey, addDays, dayCountBetween } = window.HabitUtils;
  const isEdit = !!habit;
  const sc0 = (habit && habit.schedule) || { type: 'daily' };

  const [name, setName] = React.useState(habit ? habit.name : '');
  const [color, setColor] = React.useState(habit ? habit.color : COLORS[0].key);
  const [timeOfDay, setTimeOfDay] = React.useState(habit ? (habit.timeOfDay || 'whenever') : (defaultTimeOfDay || 'morning'));
  const [scheduleType, setScheduleType] = React.useState(sc0.type || 'daily');
  const [weeklyCount, setWeeklyCount] = React.useState(sc0.type === 'weekly_count' ? (sc0.count || 3) : 3);
  const [specificDays, setSpecificDays] = React.useState(sc0.type === 'specific_days' ? (sc0.days || [1, 3, 5]) : [1, 3, 5]);
  const [reminderTime, setReminderTime] = React.useState(habit && habit.reminderTime ? habit.reminderTime : '');
  const [endDate, setEndDate] = React.useState(habit && habit.endDate ? habit.endDate : null);
  const [shareMode, setShareMode] = React.useState(habit ? (habit.shareMode || 'private') : 'private');
  const [sharedWith, setSharedWith] = React.useState([]);
  React.useEffect(() => {
    if (habit && (habit.shareMode || 'private') === 'selected' && getShares) {
      getShares(habit.id).then((ids) => setSharedWith(ids || [])).catch(() => {});
    }
  }, []);
  const inputRef = React.useRef(null);
  const timeRef = React.useRef(null);

  React.useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleDay = (i) => {
    setSpecificDays(prev => {
      if (prev.includes(i)) {
        const next = prev.filter(d => d !== i);
        return next.length === 0 ? prev : next;
      }
      return [...prev, i].sort();
    });
  };

  const buildSchedule = () => {
    if (scheduleType === 'daily') return { type: 'daily' };
    if (scheduleType === 'weekly_count') return { type: 'weekly_count', count: weeklyCount };
    if (scheduleType === 'specific_days') return { type: 'specific_days', days: specificDays };
    return { type: 'daily' };
  };

  // deadline helpers — N inclusive days counted from today, so "20 days" always means
  // 20 days from now (a chip can never silently end an existing habit in the past).
  const DURATIONS = [7, 14, 21, 30, 66];
  const todayKey = dayKey(new Date());
  const todayObj = new Date(todayKey + 'T00:00:00');
  const setDuration = (n) => setEndDate(dayKey(addDays(todayObj, n - 1)));
  const isDuration = (n) => endDate === dayKey(addDays(todayObj, n - 1));
  const deadlineDays = endDate ? dayCountBetween(todayKey, endDate) : 0;
  const deadlineLabel = () => {
    if (!endDate) return 'runs forever';
    try {
      const d = new Date(endDate + 'T00:00:00');
      const f = d.toLocaleString('en', { month: 'short', day: 'numeric' }).toLowerCase();
      if (deadlineDays <= 0) return `ended ${f}`;
      return `ends ${f} · ${deadlineDays} day${deadlineDays === 1 ? '' : 's'}`;
    } catch (_) { return ''; }
  };

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      color,
      timeOfDay,
      schedule: buildSchedule(),
      reminderTime: reminderTime || null,
      endDate: endDate || null,
      shareMode,
      sharedWith,
    });
  };

  const DAY_LETTERS = ['S','M','T','W','T','F','S'];

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit habit' : 'Add habit'}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-eyebrow">{isEdit ? 'Edit habit' : 'New habit'}</div>
            <div className="modal-title">{isEdit ? 'Tweak it' : 'What will you do?'}</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><window.Icons.X /></button>
        </div>

        <div className="modal-body">
          <div className="field">
            <input
              ref={inputRef}
              className="text-input"
              placeholder="e.g. Read 20 pages"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              maxLength={48}
            />
          </div>

          <div className="field">
            <div className="field-label">When-ish <span className="opt">· not a clock, a vibe</span></div>
            <div className="chip-row" role="radiogroup" aria-label="Time of day">
              {TOD_BUCKETS.map(b => (
                <button
                  key={b.id}
                  role="radio"
                  aria-checked={timeOfDay === b.id}
                  className="chip"
                  onClick={() => setTimeOfDay(b.id)}
                ><span style={{ marginRight: 4, opacity: 0.7 }}>{b.glyph}</span>{b.label}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field-label">Color</div>
            <div className="swatch-row" role="radiogroup" aria-label="Color">
              {COLORS.map(c => (
                <button
                  key={c.key}
                  role="radio"
                  aria-checked={color === c.key}
                  aria-label={c.key}
                  className="swatch-btn"
                  style={{ '--swatch': c.value }}
                  onClick={() => setColor(c.key)}
                />
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field-label">Cadence</div>
            <div className="chip-row" role="radiogroup" aria-label="Cadence type">
              {[
                { k: 'daily',         label: 'Every day' },
                { k: 'weekly_count',  label: 'Days / week' },
                { k: 'specific_days', label: 'Specific days' },
              ].map(c => (
                <button
                  key={c.k}
                  role="radio"
                  aria-checked={scheduleType === c.k}
                  className="chip"
                  onClick={() => setScheduleType(c.k)}
                >{c.label}</button>
              ))}
            </div>

            {scheduleType === 'weekly_count' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--ink-30)', marginBottom: 6, fontFamily: 'var(--mono)' }}>
                  {weeklyCount === 1 ? '1 day a week' : `${weeklyCount} days a week`}
                </div>
                <div className="count-row" role="radiogroup" aria-label="Days per week">
                  {[1,2,3,4,5,6,7].map(n => (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={weeklyCount === n}
                      className="count-cell"
                      onClick={() => setWeeklyCount(n)}
                    >{n}</button>
                  ))}
                </div>
              </div>
            )}

            {scheduleType === 'specific_days' && (
              <div style={{ marginTop: 10 }}>
                <div className="dow-row" role="group" aria-label="Days of the week">
                  {DAY_LETTERS.map((letter, i) => (
                    <button
                      key={i}
                      aria-checked={specificDays.includes(i)}
                      className="dow-cell"
                      onClick={() => toggleDay(i)}
                    >{letter}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="field">
            <div className="field-label">Deadline <span className="opt">· optional · ends after a stretch</span></div>
            <div className="chip-row" role="group" aria-label="Deadline">
              <button
                className="chip"
                aria-checked={!endDate}
                role="radio"
                onClick={() => setEndDate(null)}
              >Runs forever</button>
              {DURATIONS.map(n => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={isDuration(n)}
                  className="chip"
                  onClick={() => setDuration(n)}
                >{n} days</button>
              ))}
            </div>
            <div className="time-field" style={{ marginTop: 8 }}>
              <input
                type="date"
                value={endDate || ''}
                min={todayKey}
                onChange={(e) => setEndDate(e.target.value || null)}
                aria-label="Custom end date"
              />
            </div>
            <div className="deadline-summary">{deadlineLabel()}</div>
          </div>

          <div className="field">
            <div className="field-label">Sharing <span className="opt">· who can see this one</span></div>
            <div className="chip-row" role="radiogroup" aria-label="Sharing">
              <button className="chip" role="radio" aria-checked={shareMode === 'private'} onClick={() => setShareMode('private')}>Private</button>
              <button className="chip" role="radio" aria-checked={shareMode === 'all'} onClick={() => setShareMode('all')}>All friends</button>
              <button className="chip" role="radio" aria-checked={shareMode === 'selected'} onClick={() => setShareMode('selected')}>Choose friends</button>
            </div>
            {shareMode === 'selected' && (
              <div className="share-picker">
                {friends.length === 0 ? (
                  <div className="share-empty">add a friend first · nobody to pick yet</div>
                ) : friends.map((f) => (
                  <label key={f.id} className="share-friend">
                    <input type="checkbox" checked={sharedWith.includes(f.id)}
                      onChange={(e) => setSharedWith((prev) => e.target.checked ? [...prev, f.id] : prev.filter((x) => x !== f.id))} />
                    <span>{f.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <div className="field-label">Reminder time <span className="opt">· optional</span></div>
            {reminderTime ? (
              <div className="time-field">
                <input
                  ref={timeRef}
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                />
                <button className="time-clear" onClick={() => setReminderTime('')} aria-label="Clear">
                  <window.Icons.X />
                </button>
              </div>
            ) : (
              <button
                className="time-field-empty"
                onClick={() => {
                  setReminderTime('07:30');
                  setTimeout(() => timeRef.current?.focus(), 0);
                }}
              >
                <window.Icons.Bell /> Set time
              </button>
            )}
          </div>
        </div>

        <div className="modal-foot">
          {isEdit && onArchive && (
            <button className="btn btn-archive" onClick={() => onArchive(habit.id)} aria-label="Archive habit">
              <window.Icons.Trash size={13} /> archive
            </button>
          )}
          <div className="modal-foot-end">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!name.trim()} onClick={submit}>
              {isEdit ? 'Save' : 'Add habit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// PAUSE MODAL · vacation / heads-down / travelling / custom
// ============================================
const PAUSE_PRESETS = [
  { key: 'vacation', label: 'On vacation', days: 7 },
  { key: 'busy',     label: 'Heads down',  days: 5 },
  { key: 'travel',   label: 'Out of town', days: 4 },
  { key: 'custom',   label: 'Custom',      days: 3 },
];
const PAUSE_REASON_LABEL = {
  vacation: 'On vacation',
  busy:     'Heads down',
  travel:   'Out of town',
  custom:   'On pause',
};
function PauseModal({ onClose, onPause }) {
  const { dayKey, addDays } = window.HabitUtils;
  const todayD = new Date();
  const [reason, setReason] = React.useState('vacation');
  const [startDate, setStartDate] = React.useState(dayKey(todayD));
  const [endDate, setEndDate] = React.useState(dayKey(addDays(todayD, 6)));

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pickPreset = (k) => {
    setReason(k);
    const preset = PAUSE_PRESETS.find(p => p.key === k);
    if (preset && k !== 'custom') {
      const start = new Date();
      setStartDate(dayKey(start));
      setEndDate(dayKey(addDays(start, preset.days - 1)));
    }
  };

  const submit = () => {
    if (!startDate || !endDate) return;
    if (endDate < startDate) return;
    onPause({ reason, startDate, endDate });
  };

  const fmtRange = () => {
    try {
      const s = new Date(startDate + 'T00:00:00');
      const e = new Date(endDate + 'T00:00:00');
      const days = Math.round((e - s) / 86400000) + 1;
      const fmt = (d) => d.toLocaleString('en', { month: 'short', day: 'numeric' }).toLowerCase();
      return `${fmt(s)} – ${fmt(e)} · ${days} day${days === 1 ? '' : 's'}`;
    } catch (_) { return ''; }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Pause tally">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-eyebrow">Take a pause</div>
            <div className="modal-title">When are you back?</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><window.Icons.X /></button>
        </div>

        <div className="modal-body">
          <div className="field">
            <div className="field-label">Reason</div>
            <div className="chip-row" role="radiogroup" aria-label="Pause reason">
              {PAUSE_PRESETS.map(p => (
                <button
                  key={p.key}
                  role="radio"
                  aria-checked={reason === p.key}
                  className="chip"
                  onClick={() => pickPreset(p.key)}
                >{p.label}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field-label">Window</div>
            <div className="pause-range">
              <div className="time-field">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <span className="pause-range-sep">→</span>
              <div className="time-field">
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} />
              </div>
            </div>
            <div className="pause-range-summary">{fmtRange()}</div>
          </div>

          <div className="pause-promise">
            Streaks survive. We don't tell on you. Auto-resumes on the end date.
          </div>
        </div>

        <div className="modal-foot">
          <div className="modal-foot-end">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={submit}>Pause tally</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Back-compat alias: original AddHabitModal used onAdd; map it onto HabitModal's onSubmit.
function AddHabitModal({ onClose, onAdd, defaultTimeOfDay }) {
  return <HabitModal habit={null} onClose={onClose} onSubmit={onAdd} onArchive={null} defaultTimeOfDay={defaultTimeOfDay} />;
}

window.Components = { HabitRow, HabitModal, AddHabitModal, PauseModal, CheckMark };
window.PauseMeta = { PAUSE_PRESETS, PAUSE_REASON_LABEL };
