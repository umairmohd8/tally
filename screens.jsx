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
function BodyDoubleCounter() {
  // start with a believable rolling number; drift gently
  const [n, setN] = React.useState(() => 120 + Math.floor(Math.random() * 80));
  React.useEffect(() => {
    const t = setInterval(() => {
      setN(prev => {
        const delta = Math.floor(Math.random() * 9) - 4;
        return Math.max(80, prev + delta);
      });
    }, 8000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="bd-counter" aria-live="off">
      <span className="pulse" />
      <span>{n} people checking in right now</span>
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

window.Screens = {
  MVDButton, BodyDoubleCounter, RecoveryScreen, WeeklyReview,
  pickToastLine, pickAllDoneLine, MVD_TOAST,
};
