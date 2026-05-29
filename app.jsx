// ============================================
// APP — Inkwell habit tracker
// ============================================

const { useState, useEffect, useMemo, useCallback, useRef } = React;
const { HabitRow, HabitModal, PauseModal, CheckMark } = window.Components;
const {
  RecoveryScreen, WeeklyReview, MVDButton, BodyDoubleCounter,
  pickToastLine, pickAllDoneLine, MVD_TOAST,
} = window.Screens;
const {
  dayKey, addDays, isScheduled, computeStreak, TOD_BUCKETS, isPausedOn,
} = window.HabitUtils;
const { PAUSE_REASON_LABEL } = window.PauseMeta;

const LS = {
  HABITS:    'tally-habits',
  PAUSE:     'tally-pause',
  PAUSE_HX:  'tally-pause-history',
  MVD:       'tally-mvd-logged',
  THEME:     'tally-theme',
  SEEN_WB:   'tally-seen-welcome-back',
};
function lsGet(k, fallback) {
  try {
    const v = localStorage.getItem(k);
    return v == null ? fallback : JSON.parse(v);
  } catch (_) { return fallback; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
}

// ---- Seed data ----
function seedHabits(today) {
  const mk = (id, name, color, schedule, timeOfDay, reminderTime, fillFn) => {
    const completions = {};
    for (let i = 0; i < 70; i++) {
      const d = addDays(today, -i);
      const tmp = { schedule };
      if (!isScheduled(tmp, d)) continue;
      if (fillFn(d, i)) completions[dayKey(d)] = true;
    }
    return { id, name, color, schedule, timeOfDay, reminderTime: reminderTime || null, completions, createdAt: dayKey(addDays(today, -70)) };
  };
  const dense  = (_, i) => i === 0 ? false : Math.random() < 0.88;
  const medium = (_, i) => i === 0 ? false : Math.random() < 0.65;
  const sparse = (_, i) => i === 0 ? false : Math.random() < 0.45;

  // morning
  const water = mk('h1', 'Drink water', 'cobalt', { type: 'daily' }, 'morning', '07:00', dense);
  for (let i = 0; i < 12; i++) water.completions[dayKey(addDays(today, -i))] = true;
  const pages = mk('h2', 'Morning pages', 'stone', { type: 'daily' }, 'morning', '06:30', medium);
  // afternoon
  const run = mk('h3', 'Run', 'cloud', { type: 'specific_days', days: [1, 3, 5] }, 'afternoon', null, dense);
  const stretch = mk('h4', 'Stretch 10 min', 'butter', { type: 'weekly_count', count: 3 }, 'afternoon', null, medium);
  // evening
  const read = mk('h5', 'Read 20 pages', 'plum', { type: 'daily' }, 'evening', '21:00', medium);
  for (let i = 1; i < 8; i++) read.completions[dayKey(addDays(today, -i))] = true;
  const lang = mk('h6', 'Spanish · Duolingo', 'pop', { type: 'weekly_count', count: 5 }, 'evening', null, sparse);

  read.shared = true;
  run.shared = true;

  return [water, pages, run, stretch, read, lang];
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showProgressBar": true,
  "showBodyDouble": true,
  "showMVD": true
}/*EDITMODE-END*/;

function App() {
  const [today] = useState(() => new Date());

  // ---- Pause: load + auto-resume on mount if expired ----
  const initialPauseState = useMemo(() => {
    const stored = lsGet(LS.PAUSE, null);
    const todayK = dayKey(new Date());
    if (stored && stored.endDate < todayK) {
      // expired — archive and trigger welcome-back
      const history = lsGet(LS.PAUSE_HX, []);
      const next = [...history, { ...stored, resumedAt: todayK }];
      lsSet(LS.PAUSE_HX, next);
      lsSet(LS.PAUSE, null);
      return { active: null, justEnded: stored };
    }
    return { active: stored, justEnded: null };
  }, []);

  const [pause, setPauseState] = useState(initialPauseState.active);
  const [justEndedPause, setJustEndedPause] = useState(initialPauseState.justEnded);

  const [habits, setHabits] = useState(() => {
    const stored = lsGet(LS.HABITS, null);
    return stored && Array.isArray(stored) && stored.length > 0 ? stored : seedHabits(new Date());
  });
  const [tab, setTab] = useState('today');
  const [view, setView] = useState(() => initialPauseState.justEnded ? 'recovery' : 'today');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDefaultTOD, setModalDefaultTOD] = useState(null);
  const [editingHabit, setEditingHabit] = useState(null);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem(LS.THEME);
    if (stored) return stored;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [toast, setToast] = useState(null);
  const [mvdLogged, setMvdLogged] = useState(() => lsGet(LS.MVD, {}));
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const toastTimerRef = useRef(null);

  // ---- persistence ----
  useEffect(() => { lsSet(LS.HABITS, habits); }, [habits]);
  useEffect(() => { lsSet(LS.PAUSE, pause); }, [pause]);
  useEffect(() => { lsSet(LS.MVD, mvdLogged); }, [mvdLogged]);

  // apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(LS.THEME, theme);
  }, [theme]);

  const showToast = useCallback((text) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now() + Math.random(), text });
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // ---- toggle (hero interaction) ----
  const toggle = useCallback((id, dKeyOverride) => {
    setHabits(prev => prev.map(h => {
      if (h.id !== id) return h;
      const dKey = dKeyOverride || dayKey(today);
      const cmp = { ...h.completions };
      const wasDone = !!cmp[dKey];
      if (wasDone) delete cmp[dKey];
      else cmp[dKey] = true;
      if (!wasDone) {
        setTimeout(() => {
          const streakNow = computeStreak({ ...h, completions: cmp }, today, pause);
          showToast(pickToastLine(streakNow));
        }, 350);
      }
      return { ...h, completions: cmp };
    }));
  }, [today, showToast, pause]);

  // ---- pause actions ----
  const startPause = useCallback((p) => {
    setPauseState(p);
    setPauseModalOpen(false);
    setBannerDismissed(false);
    showToast(`${PAUSE_REASON_LABEL[p.reason] || 'Paused'}. We held the door.`);
  }, [showToast]);

  const resumeNow = useCallback(() => {
    if (!pause) return;
    const history = lsGet(LS.PAUSE_HX, []);
    const todayK = dayKey(new Date());
    lsSet(LS.PAUSE_HX, [...history, { ...pause, resumedAt: todayK, resumedEarly: true }]);
    setJustEndedPause(pause);
    setPauseState(null);
    setView('recovery');
  }, [pause]);

  const onPausedTap = useCallback(() => {
    showToast("Paused. Resume to log.");
  }, [showToast]);

  // ---- add ----
  const addHabit = useCallback((data) => {
    setHabits(prev => [...prev, {
      id: 'h' + Date.now(),
      ...data,
      completions: {},
      createdAt: dayKey(new Date()),
    }]);
    setModalOpen(false);
    setModalDefaultTOD(null);
    setTimeout(() => showToast(`Added · ${data.name}`), 100);
  }, [showToast]);

  const editHabit = useCallback((id, data) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, ...data } : h));
    setEditingHabit(null);
    setTimeout(() => showToast(`Updated · ${data.name}`), 100);
  }, [showToast]);

  const deleteHabit = useCallback((id) => {
    setHabits(prev => prev.filter(h => h.id !== id));
  }, []);

  const logMVD = useCallback(() => {
    setMvdLogged(prev => ({ ...prev, [dayKey(today)]: true }));
    showToast(MVD_TOAST);
  }, [today, showToast]);

  // ---- derived: today stats ----
  const todayKey = dayKey(today);
  const pausedToday = isPausedOn(today, pause);
  const scheduledToday = habits.filter(h => isScheduled(h, today));
  const completedToday = scheduledToday.filter(h => h.completions[todayKey]).length;
  const total = scheduledToday.length;
  const pct = total === 0 ? 0 : Math.round((completedToday / total) * 100);
  const longestStreak = habits.reduce((m, h) => Math.max(m, computeStreak(h, today, pause)), 0);
  const allDone = !pausedToday && total > 0 && completedToday === total;

  // ---- celebrate "all done" once per day ----
  const [allDoneToasted, setAllDoneToasted] = useState(false);
  useEffect(() => {
    if (allDone && !allDoneToasted) {
      setAllDoneToasted(true);
      setTimeout(() => showToast(pickAllDoneLine()), 600);
    }
    if (!allDone && allDoneToasted) setAllDoneToasted(false);
  }, [allDone, allDoneToasted, showToast]);

  // ---- missed-yesterday banner ----
  const slippedHabits = useMemo(() => {
    return habits.filter(h => window.HabitUtils.slippedYesterday(h, today, pause));
  }, [habits, today, pause]);
  const showMissBanner = !pausedToday && slippedHabits.length > 0 && !bannerDismissed && view === 'today';

  // ---- MVD visible? ----
  const showMVD = !pausedToday && tweaks.showMVD && completedToday === 0 && total > 0 && !mvdLogged[todayKey];

  // ---- pause banner ----
  const fmtPauseEnd = () => {
    if (!pause) return '';
    try {
      const d = new Date(pause.endDate + 'T00:00:00');
      return d.toLocaleString('en', { weekday: 'short', month: 'short', day: 'numeric' }).toLowerCase();
    } catch (_) { return pause.endDate; }
  };
  const pauseGapDays = useMemo(() => {
    if (!justEndedPause) return 0;
    const s = new Date(justEndedPause.startDate + 'T00:00:00');
    const e = new Date(justEndedPause.endDate + 'T00:00:00');
    return Math.round((e - s) / 86400000) + 1;
  }, [justEndedPause]);

  // ---- group by time of day ----
  // Predictable layout: don't reorder by completion state. Habit order stays put.
  const grouped = useMemo(() => {
    return TOD_BUCKETS.map(bucket => {
      const list = habits.filter(h => (h.timeOfDay || 'whenever') === bucket.id);
      return { bucket, list };
    }).filter(g => g.list.length > 0);
  }, [habits]);

  // date strings
  const dateStr = today.toLocaleString('en', { month: 'long', day: 'numeric' }).toLowerCase();
  const dowStr = today.toLocaleString('en', { weekday: 'long' }).toLowerCase();

  // -------- Recovery screen --------
  if (view === 'recovery') {
    return (
      <RecoveryScreen
        habits={habits}
        today={today}
        gapDays={pauseGapDays || 5}
        pauseReason={justEndedPause ? justEndedPause.reason : null}
        onResume={() => { logMVD(); setJustEndedPause(null); setView('today'); }}
        onShowAll={() => { setJustEndedPause(null); setView('today'); }}
        onToggleHabit={(id) => { toggle(id); setJustEndedPause(null); setView('today'); }}
      />
    );
  }

  // -------- Main app --------
  return (
    <div className="app">

      {/* Topbar */}
      <div className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <span className="brand-name">tally</span>
        </div>
        <div className="topbar-actions">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'today'} className="tab" onClick={() => setTab('today')}>Today</button>
            <button role="tab" aria-selected={tab === 'review'} className="tab" onClick={() => setTab('review')}>Review</button>
          </div>
          {!pause && (
            <button
              className="icon-btn"
              onClick={() => setPauseModalOpen(true)}
              aria-label="Take a pause"
              title="Take a pause"
            >
              <window.Icons.Pause />
            </button>
          )}
          <button
            className="icon-btn"
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          >
            {theme === 'dark' ? <window.Icons.Sun /> : <window.Icons.Moon />}
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="hero">
        <h1 className="hero-date">
          <span className="dow">{dowStr}</span>
          {dateStr}
        </h1>
        <div className="hero-stats">
          <div className="stat">
            <div className="stat-num">{completedToday}<span className="dim">/{total || 0}</span></div>
            <div className="stat-label">today</div>
          </div>
          <div className="stat">
            <div className="stat-num">{longestStreak}<span className="dim" style={{ fontSize: 14 }}>d</span></div>
            <div className="stat-label">streak</div>
          </div>
        </div>
      </div>

      {/* progress hairline */}
      {tab === 'today' && tweaks.showProgressBar && total > 0 && !pausedToday && (
        <div className="progress-row">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: pct + '%' }} />
          </div>
          <div className="progress-label">{pct}%</div>
        </div>
      )}

      {/* pause banner — non-dismissible truth-teller */}
      {pause && (
        <div className="pause-banner">
          <div className="copy">
            {PAUSE_REASON_LABEL[pause.reason] || 'On pause'} · resumes {fmtPauseEnd()}
          </div>
          <button onClick={resumeNow} className="pause-resume" aria-label="Resume now">resume now</button>
        </div>
      )}

      {/* missed-yesterday banner */}
      {tab === 'today' && showMissBanner && (
        <div className="miss-banner">
          <div className="copy">
            You missed yesterday. The streak survived. We don't tell on you.
          </div>
          <button onClick={() => setBannerDismissed(true)} aria-label="Dismiss">
            <window.Icons.X size={14} />
          </button>
        </div>
      )}

      {/* Today */}
      {tab === 'today' && (
        habits.length === 0 ? (
          <div className="empty">
            <div className="empty-title">A blank slate.<br/>Almost dangerous.</div>
            <div className="empty-sub">Pick one to start. You can add a hundred later.</div>
            <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
              Pick one to start
            </button>
          </div>
        ) : (
          <>
            {grouped.map(({ bucket, list }) => (
              <div className="bucket" key={bucket.id}>
                <div className="bucket-head">
                  <div className="bucket-title">
                    <span className="bucket-glyph">{bucket.glyph}</span>
                    <span className="bucket-name">{bucket.label}</span>
                  </div>
                  <span className="bucket-count">
                    {list.filter(h => h.completions[todayKey]).length}/{list.filter(h => isScheduled(h, today)).length}
                  </span>
                </div>
                <div className="habit-list">
                  {list.map(h => (
                    <HabitRow key={h.id} habit={h} today={today} pause={pause} onToggle={toggle} onDelete={deleteHabit} onEdit={setEditingHabit} onPausedTap={onPausedTap} />
                  ))}
                </div>
              </div>
            ))}

            <div className="add-row">
              <button className="add-btn" onClick={() => { setModalDefaultTOD(null); setModalOpen(true); }}>
                <window.Icons.Plus size={13} /> add habit
              </button>
            </div>

            {showMVD && <MVDButton onLog={logMVD} />}

            {tweaks.showBodyDouble && <BodyDoubleCounter />}
          </>
        )
      )}

      {/* Review */}
      {tab === 'review' && (
        habits.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Nothing to review yet.</div>
            <div className="empty-sub">Add a habit, log it for a few days.</div>
          </div>
        ) : (
          <WeeklyReview habits={habits} today={today} pause={pause} />
        )
      )}

      {/* Add / Edit habit modal */}
      {(modalOpen || editingHabit) && (
        <HabitModal
          habit={editingHabit}
          onClose={() => { setModalOpen(false); setModalDefaultTOD(null); setEditingHabit(null); }}
          onSubmit={(data) => editingHabit ? editHabit(editingHabit.id, data) : addHabit(data)}
          onArchive={editingHabit ? (id) => { deleteHabit(id); setEditingHabit(null); } : null}
          defaultTimeOfDay={modalDefaultTOD}
        />
      )}

      {/* Pause modal */}
      {pauseModalOpen && (
        <PauseModal
          onClose={() => setPauseModalOpen(false)}
          onPause={startPause}
        />
      )}

      {/* Toast */}
      <div className="toast-zone">
        {toast && <div className="toast" key={toast.id}>{toast.text}</div>}
      </div>

      {/* Tweaks panel */}
      <window.TweaksPanel title="Tweaks">
        <window.TweakSection label="Theme">
          <window.TweakRadio
            label="Mode"
            value={theme}
            onChange={setTheme}
            options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
          />
        </window.TweakSection>
        <window.TweakSection label="Display">
          <window.TweakToggle
            label="Progress hairline"
            value={tweaks.showProgressBar}
            onChange={(v) => setTweak('showProgressBar', v)}
          />
          <window.TweakToggle
            label='"I did one thing" button'
            value={tweaks.showMVD}
            onChange={(v) => setTweak('showMVD', v)}
          />
          <window.TweakToggle
            label="Body-doubling counter"
            value={tweaks.showBodyDouble}
            onChange={(v) => setTweak('showBodyDouble', v)}
          />
        </window.TweakSection>
        <window.TweakSection label="Life happens">
          {!pause && (
            <window.TweakButton onClick={() => setPauseModalOpen(true)}>
              Take a pause
            </window.TweakButton>
          )}
          {pause && (
            <window.TweakButton onClick={resumeNow}>
              Resume now
            </window.TweakButton>
          )}
        </window.TweakSection>
        <window.TweakSection label="Demo">
          <window.TweakButton onClick={() => setView('recovery')}>
            Show recovery screen
          </window.TweakButton>
          <window.TweakButton onClick={() => { setBannerDismissed(false); }}>
            Show "missed yesterday" banner
          </window.TweakButton>
          <window.TweakButton onClick={() => showToast(pickToastLine(0))}>
            Trigger a random toast
          </window.TweakButton>
        </window.TweakSection>
      </window.TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
