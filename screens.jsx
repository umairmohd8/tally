// ============================================
// SCREENS · Recovery, Weekly Review, MVD, BodyDouble, toast bank
// ============================================

// ---- Toast microcopy library ----
const TOAST_LINES = [
  "Logged. No further questions.",
  "Filed. The world spins on.",
  "One in the book.",
  "Look at you.",
  "Done. Next.",
  "Noted. Moving on.",
  "That's a yes.",
  "Easy.",
  "Counts.",
  "On the record.",
  "In the bag.",
  "Quietly, that mattered.",
  "Tally up.",
  "Stamp.",
  "Saved.",
  "Mhm.",
];

const STREAK_LINES = {
  3:  "Three days. We see you.",
  5:  "Five days. Quietly impressive.",
  7:  "A week. We're not allowed to say good job. We're thinking it.",
  10: "Ten days. Casual greatness.",
  14: "Two weeks. The habit is starting to think it owns you back.",
  21: "Three weeks. The science people will mention this in a podcast.",
  30: "A month. We're not crying.",
  50: "Fifty. You're not the same person you were.",
  100: "A hundred. We need a moment.",
};

const ALL_DONE_LINES = [
  "That's the list. Go outside.",
  "Clean sheet. Treat yourself.",
  "All done. Stop scrolling.",
];

const MVD_TOAST = "Counts. That's the deal.";

// rotation state, kept outside React so reloads don't reset within session
let _toastCursor = Math.floor(Math.random() * TOAST_LINES.length);
function pickToastLine(streak = 0) {
  if (streak && STREAK_LINES[streak]) return STREAK_LINES[streak];
  const line = TOAST_LINES[_toastCursor % TOAST_LINES.length];
  _toastCursor++;
  return line;
}
function pickAllDoneLine() {
  return ALL_DONE_LINES[Math.floor(Math.random() * ALL_DONE_LINES.length)];
}

// ---- Verdict line bank (Weekly Review) ----
function pickVerdict(pct) {
  if (pct >= 95) return "A near-perfect week. Disgusting.";
  if (pct >= 80) return "A pretty good week.";
  if (pct >= 60) return "A week with shape.";
  if (pct >= 40) return "Not bad. We've seen worse from us.";
  if (pct >= 20) return "A week. It happened. We're moving on.";
  return "A soft week. Pick one thing tomorrow.";
}

function pickReflection() {
  const lines = [
    "Sunday recap: don't ruin it by reading too closely.",
    "Past you is doing their best. So are you.",
    "The honest thing is showing up. The pretty thing is consistency.",
    "We don't grade you. The dots grade themselves.",
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

// ============================================
// MVD BUTTON — "I did at least one thing"
// ============================================
function MVDButton({ onLog }) {
  return (
    <div className="mvd-row">
      <button className="mvd-btn" onClick={onLog}>
        I did at least one thing today
      </button>
    </div>
  );
}

// ============================================
// BODY-DOUBLING COUNTER
// ============================================
// Real count of distinct users who completed a habit today (via Sync.checkinsToday).
// Fetches on mount and whenever `refresh` changes (i.e. when you check in). No polling.
// Renders nothing until it has a real number (backend off / not-yet-loaded / error → hidden).
function BodyDoubleCounter({ enabled, day, refresh }) {
  const [n, setN] = React.useState(null);
  React.useEffect(() => {
    if (!enabled || !window.Sync || !window.Sync.checkinsToday) { setN(null); return; }
    let alive = true;
    window.Sync.checkinsToday(day)
      .then((c) => { if (alive) setN(typeof c === 'number' ? c : null); })
      .catch(() => { if (alive) setN(null); });
    return () => { alive = false; };
  }, [enabled, day, refresh]);
  if (n === null) return null;
  const label = n === 0 ? 'be the first to check in today'
    : n === 1 ? '1 person checked in today'
    : `${n} people checked in today`;
  return (
    <div className="bd-counter" aria-live="off">
      <span className="pulse" />
      <span>{label}</span>
    </div>
  );
}

// ============================================
// RECOVERY SCREEN — 3+ days away
// ============================================
const PAUSE_HERO = {
  vacation: { hero: ['Welcome back.', 'The sand was worth it.'], sub: (d) => `${d} day${d === 1 ? '' : 's'} off. No math required.` },
  busy:     { hero: ['The week ate you.', 'We held the door.'],   sub: (d) => `${d} heads-down day${d === 1 ? '' : 's'}. Start small.` },
  travel:   { hero: ['Back on solid ground.', 'Pick one.'],       sub: (d) => `${d} day${d === 1 ? '' : 's'} away. No math required.` },
  custom:   { hero: ["You're back.", "That's the hard part."],   sub: (d) => `${d} day${d === 1 ? '' : 's'} paused. Streaks held.` },
};
function RecoveryScreen({ habits, today, gapDays = 5, pauseReason, onResume, onShowAll, onToggleHabit }) {
  const { dayKey, colorOf } = window.HabitUtils;
  const ranked = [...habits].sort((a, b) => {
    const ca = Object.keys(a.completions).length;
    const cb = Object.keys(b.completions).length;
    return cb - ca;
  }).slice(0, 2);

  const variant = pauseReason && PAUSE_HERO[pauseReason];
  const heroLines = variant ? variant.hero : ['Hey.', "It's been a minute."];
  const subLine = variant ? variant.sub(gapDays) : `${gapDays} days, no math required.`;
  const eyebrowText = pauseReason ? 'pause ended' : 'welcome back';
  const reassurance = pauseReason
    ? [`Streaks survived ${gapDays} paused day${gapDays === 1 ? '' : 's'}.`, "We held the door.", "Pick one to start."]
    : ["Your streaks didn't reset.", "We held the door.", "Pick one to start."];

  return (
    <div className="recovery">
      <div className="recovery-app">
        <div className="topbar">
          <div className="brand">
            <span className="brand-mark" />
            <span className="brand-name">tally</span>
          </div>
        </div>

        <div style={{ marginTop: 12, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-50)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {eyebrowText}
        </div>
        <h1 className="recovery-hero">{heroLines[0]}<br/>{heroLines[1]}</h1>
        <div className="recovery-sub">{subLine}</div>

        <div className="recovery-reassure">
          {reassurance.map((line, i) => <p key={i}>{line}</p>)}
        </div>

        <div className="recovery-list-label">today, gently</div>
        <div className="recovery-list">
          {ranked.map(h => {
            const swatch = colorOf(h.color);
            const done = !!h.completions[dayKey(today)];
            return (
              <div key={h.id} className={`habit ${done ? 'done' : ''}`} onClick={() => onToggleHabit(h.id)}
                   role="button" tabIndex={0}
                   onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleHabit(h.id); } }}>
                <button
                  className={`check ${done ? 'checked' : ''}`}
                  style={{ borderColor: done ? swatch : undefined, background: done ? swatch : undefined }}
                  onClick={(e) => { e.stopPropagation(); onToggleHabit(h.id); }}
                  aria-label={done ? 'Mark incomplete' : 'Mark complete'}
                >
                  <window.Components.CheckMark />
                </button>
                <div className="habit-body">
                  <div className="habit-name">
                    <span className="swatch" style={{ background: swatch }} />
                    <span className="habit-name-text">{h.name}</span>
                  </div>
                </div>
                <div className="habit-actions"></div>
              </div>
            );
          })}
        </div>

        <div className="recovery-foot">
          <button className="recovery-cta" onClick={onResume}>
            Just today, just one
          </button>
          <button className="recovery-escape" onClick={onShowAll}>
            show all my habits
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// WEEKLY REVIEW
// ============================================
function WeeklyReview({ habits, today, pause }) {
  const { dayKey, addDays, startOfWeek, isScheduled, isPausedOn } = window.HabitUtils;
  const start = startOfWeek(today);
  const weekLabel = `${start.toLocaleString('en', { month: 'short', day: 'numeric' }).toLowerCase()} – ${addDays(start, 6).toLocaleString('en', { month: 'short', day: 'numeric' }).toLowerCase()}`;

  let scheduled = 0, done = 0;
  habits.forEach(h => {
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      if (d > today) continue;
      if (isPausedOn(d, pause)) continue;
      if (isScheduled(h, d)) {
        scheduled++;
        if (h.completions[dayKey(d)]) done++;
      }
    }
  });
  const pct = scheduled === 0 ? 0 : Math.round((done / scheduled) * 100);
  const verdict = pickVerdict(pct);

  const perHabit = habits.map(h => {
    let s = 0, d = 0;
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, i);
      if (day > today) continue;
      if (isPausedOn(day, pause)) continue;
      if (isScheduled(h, day)) {
        s++;
        if (h.completions[dayKey(day)]) d++;
      }
    }
    return { habit: h, scheduled: s, done: d, pct: s ? d / s : 0 };
  });
  const winner = perHabit.filter(x => x.scheduled > 0).sort((a, b) => b.pct - a.pct)[0];
  const slipper = perHabit.filter(x => x.scheduled > 1 && x.pct < 0.6).sort((a, b) => a.pct - b.pct)[0];

  const [reflection, setReflection] = React.useState(pickReflection);

  return (
    <>
      <div className="review-card">
        <div className="review-eyebrow">{weekLabel}</div>
        <div className="review-verdict">{verdict}</div>
        <div className="review-stat">
          <span className="pct">{done}</span> of <span className="pct">{scheduled}</span> scheduled. <span className="pct">{pct}%</span>.
        </div>

        {winner && (
          <div className="review-tile win">
            <div className="lbl">most consistent</div>
            <div className="nm">{winner.habit.name}</div>
            <div className="sub">{winner.done}/{winner.scheduled} scheduled days</div>
          </div>
        )}

        {slipper && (
          <div className="review-tile slip">
            <div className="lbl">slipped a bit</div>
            <div className="nm">{slipper.habit.name}</div>
            <div className="sub">{slipper.done}/{slipper.scheduled} · no judgment</div>
          </div>
        )}

        <button
          className="review-quote"
          onClick={() => setReflection(pickReflection())}
          style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 0 }}
          title="Tap for another"
        >
          "{reflection}"
        </button>
      </div>
    </>
  );
}

function ProfileScreen({
  me,
  habits,
  friends,
  signedIn,
  session,
  myCode,
  onSaveProfile,
  onSignOut,
  onOpenSignIn,
  theme,
  setTheme,
  tweaks,
  setTweak
}) {
  const { colorOf, COLORS } = window.HabitUtils;
  
  // Local drafts so the user doesn't trigger saves on every keystroke, but saves on blur or submit.
  const [nameDraft, setNameDraft] = React.useState(me.name || '');
  const [bioDraft, setBioDraft] = React.useState(me.bio || '');
  const [copied, setCopied] = React.useState(false);

  // Sync drafts when 'me' object changes
  React.useEffect(() => {
    setNameDraft(me.name || '');
    setBioDraft(me.bio || '');
  }, [me]);

  const saveName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== me.name) {
      onSaveProfile({ ...me, name: trimmed });
    } else {
      setNameDraft(me.name || '');
    }
  };

  const saveBio = () => {
    const trimmed = bioDraft.trim();
    if (trimmed !== me.bio) {
      onSaveProfile({ ...me, bio: trimmed });
    }
  };

  const selectColor = (colorKey) => {
    onSaveProfile({ ...me, avatarColor: colorKey });
  };

  const selectEmoji = (emoji) => {
    onSaveProfile({ ...me, avatarEmoji: emoji });
  };

  const clearEmoji = () => {
    onSaveProfile({ ...me, avatarEmoji: '' });
  };

  const handleWeeklyTargetChange = (e) => {
    const target = parseInt(e.target.value, 10);
    onSaveProfile({ ...me, weeklyTarget: target });
  };

  const copyCode = () => {
    if (!myCode) return;
    try {
      navigator.clipboard.writeText(myCode).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (_) {}
  };

  // Predefined Emojis for avatar selector
  const EMOJIS = ['🎯', '🧘', '🏃', '📝', '🥑', '💧', '📚', '☕️', '🎨', '🕯️', '🪴', '🌙'];

  // Stats computation
  const activeHabitsCount = habits.length;
  const lifetimeCheckins = React.useMemo(() => {
    return habits.reduce((sum, h) => sum + Object.keys(h.completions || {}).length, 0);
  }, [habits]);
  const bestStreak = React.useMemo(() => {
    return habits.reduce((m, h) => Math.max(m, window.HabitUtils.computeStreak(h, new Date())), 0);
  }, [habits]);

  // Completions this week
  const completionsThisWeek = React.useMemo(() => {
    const today = new Date();
    const start = window.HabitUtils.startOfWeek(today);
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = window.HabitUtils.addDays(start, i);
      const dk = window.HabitUtils.dayKey(d);
      habits.forEach(h => {
        if (h.completions && h.completions[dk]) count++;
      });
    }
    return count;
  }, [habits]);

  const targetGoal = me.weeklyTarget !== undefined ? me.weeklyTarget : 5;
  const goalProgressPct = Math.min(100, Math.round((completionsThisWeek / targetGoal) * 100));

  const memberSinceStr = React.useMemo(() => {
    if (me.createdAt) {
      try {
        const d = new Date(me.createdAt);
        return d.toLocaleDateString('en', { month: 'long', year: 'numeric' }).toLowerCase();
      } catch (_) {}
    }
    return 'local visitor';
  }, [me.createdAt]);

  const initial = me.avatarEmoji || (me.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="profile-screen">
      {/* Profile Header */}
      <div className="profile-card profile-main-card">
        <div className="profile-header-top">
          <div className="profile-avatar-wrap">
            <span className="avatar avatar-large" style={{ background: colorOf(me.avatarColor || 'pop') }}>
              {initial}
            </span>
          </div>
          <div className="profile-header-info">
            <div className="profile-input-field">
              <input
                className="profile-name-input"
                value={nameDraft}
                placeholder="your name"
                maxLength={24}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') { setNameDraft(me.name || ''); e.target.blur(); }
                }}
              />
            </div>
            <div className="profile-input-field">
              <input
                className="profile-bio-input"
                value={bioDraft}
                placeholder="write a bio or motto..."
                maxLength={60}
                onChange={(e) => setBioDraft(e.target.value)}
                onBlur={saveBio}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveBio();
                  if (e.key === 'Escape') { setBioDraft(me.bio || ''); e.target.blur(); }
                }}
              />
            </div>
          </div>
        </div>

        {/* Avatar Customizer */}
        <div className="profile-customizer">
          <div className="customizer-section">
            <div className="customizer-label">avatar color</div>
            <div className="swatch-row" role="radiogroup" aria-label="Avatar color">
              {COLORS.map(c => (
                <button
                  key={c.key}
                  role="radio"
                  aria-checked={me.avatarColor === c.key}
                  aria-label={c.key}
                  className="swatch-btn"
                  style={{ '--swatch': c.value, position: 'relative' }}
                  onClick={() => selectColor(c.key)}
                >
                  {me.avatarColor === c.key && <span className="swatch-selected-dot" />}
                </button>
              ))}
            </div>
          </div>

          <div className="customizer-section">
            <div className="customizer-label">avatar emoji</div>
            <div className="emoji-row">
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  className={`emoji-btn ${me.avatarEmoji === emoji ? 'active' : ''}`}
                  onClick={() => selectEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
              {me.avatarEmoji && (
                <button className="emoji-clear-btn" onClick={clearEmoji} title="Clear emoji">
                  clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Goal Card */}
      <div className="profile-card">
        <div className="card-title">weekly goal</div>
        <div className="weekly-goal-editor">
          <div className="goal-slider-row">
            <span className="goal-label">target: {targetGoal} completions / week</span>
            <input
              type="range"
              min="1"
              max="35"
              value={targetGoal}
              className="goal-slider"
              onChange={handleWeeklyTargetChange}
            />
          </div>
          <div className="goal-progress-row">
            <div className="goal-progress-bar-wrap">
              <div className="goal-progress-bar-fill" style={{ width: goalProgressPct + '%' }} />
            </div>
            <span className="goal-progress-label">
              {completionsThisWeek} completions logged this week ({goalProgressPct}%)
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="profile-card stat-card">
          <div className="stat-num">{lifetimeCheckins}</div>
          <div className="stat-label">lifetime completions</div>
        </div>
        <div className="profile-card stat-card">
          <div className="stat-num">{activeHabitsCount}</div>
          <div className="stat-label">active habits</div>
        </div>
        <div className="profile-card stat-card">
          <div className="stat-num">{bestStreak}d</div>
          <div className="stat-label">best streak</div>
        </div>
        <div className="profile-card stat-card">
          <div className="stat-num" style={{ fontSize: '18px', padding: '6px 0' }}>{memberSinceStr}</div>
          <div className="stat-label">member since</div>
        </div>
      </div>

      {/* Preferences Section */}
      <div className="profile-card">
        <div className="card-title">preferences</div>
        <div className="preferences-list">
          <div className="preference-item">
            <div className="pref-info">
              <div className="pref-title">dark theme</div>
              <div className="pref-desc">switch to a soothing dark aesthetic</div>
            </div>
            <button
              className={`pref-toggle ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle dark theme"
            >
              <span className="toggle-handle" />
            </button>
          </div>
          <div className="preference-item">
            <div className="pref-info">
              <div className="pref-title">progress hairline</div>
              <div className="pref-desc">display a thin daily progress bar at the top</div>
            </div>
            <button
              className={`pref-toggle ${tweaks.showProgressBar ? 'active' : ''}`}
              onClick={() => setTweak('showProgressBar', !tweaks.showProgressBar)}
              aria-label="Toggle progress hairline"
            >
              <span className="toggle-handle" />
            </button>
          </div>
          <div className="preference-item">
            <div className="pref-info">
              <div className="pref-title">minimum viable day (mvd) button</div>
              <div className="pref-desc">show the "i did one thing" button on hard days</div>
            </div>
            <button
              className={`pref-toggle ${tweaks.showMVD ? 'active' : ''}`}
              onClick={() => setTweak('showMVD', !tweaks.showMVD)}
              aria-label="Toggle MVD button"
            >
              <span className="toggle-handle" />
            </button>
          </div>
          <div className="preference-item">
            <div className="pref-info">
              <div className="pref-title">body-doubling counter</div>
              <div className="pref-desc">display simulated checking in counters</div>
            </div>
            <button
              className={`pref-toggle ${tweaks.showBodyDouble ? 'active' : ''}`}
              onClick={() => setTweak('showBodyDouble', !tweaks.showBodyDouble)}
              aria-label="Toggle body-doubling counter"
            >
              <span className="toggle-handle" />
            </button>
          </div>
        </div>
      </div>

      {/* Sync/Account Section */}
      <div className="profile-card">
        {signedIn ? (
          <div className="sync-section">
            <div className="card-title">account</div>
            <div className="sync-info-row">
              <div className="sync-label">status</div>
              <div className="sync-value">synced with supabase</div>
            </div>
            <div className="sync-info-row">
              <div className="sync-label">email</div>
              <div className="sync-value">{session?.user?.email || 'synced'}</div>
            </div>
            {myCode && (
              <div className="sync-info-row">
                <div className="sync-label">invite code</div>
                <button className="invite-code profile-invite-code" onClick={copyCode} title="copy">
                  {myCode}<span className="invite-copy">{copied ? 'copied' : 'copy'}</span>
                </button>
              </div>
            )}
            <button className="btn btn-secondary profile-sign-btn" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        ) : (
          <div className="sync-section">
            <div className="card-title">sync & backup</div>
            <div className="sync-blurb">
              your habits are currently saved locally to this browser. sign in to back up your habits and sync them live across all your devices.
            </div>
            {window.Sync.enabled() ? (
              <button className="btn btn-primary profile-sign-btn" onClick={onOpenSignIn}>
                Sign in to sync
              </button>
            ) : (
              <div className="sync-err">Backend not configured. Local storage only.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

window.Screens = {
  MVDButton, BodyDoubleCounter, RecoveryScreen, WeeklyReview, ProfileScreen,
  pickToastLine, pickAllDoneLine, MVD_TOAST,
};
