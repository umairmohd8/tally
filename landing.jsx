// ============================================
// LANDING — window.Landing.LandingPage: marketing landing + ephemeral interactive demo.
// The demo reuses window.Components.HabitRow with seed data held in local state only —
// nothing is persisted (no localStorage, no Sync), so it resets on every reload.
// ============================================
const { useState: useStateL } = React;

// Build ~4 demo habits with recent completions. Shape matches the tracker's habit model.
function demoSeed() {
  const { dayKey, addDays } = window.HabitUtils;
  const today = new Date();
  const mk = (id, name, color, schedule, timeOfDay, reminderTime, doneOffsets) => {
    const completions = {};
    doneOffsets.forEach((off) => { completions[dayKey(addDays(today, -off))] = true; });
    return { id, name, color, schedule, timeOfDay, reminderTime: reminderTime || null,
      completions, createdAt: dayKey(addDays(today, -60)) };
  };
  return [
    mk('d1', 'Drink water', 'cobalt', { type: 'daily' }, 'morning', '07:00', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    mk('d2', 'Read 20 pages', 'plum', { type: 'daily' }, 'evening', '21:00', [1, 2, 3, 5, 6]),
    mk('d3', 'Run', 'cloud', { type: 'specific_days', days: [1, 3, 5] }, 'afternoon', null, [2, 4, 7]),
    mk('d4', 'Stretch', 'butter', { type: 'weekly_count', count: 3 }, 'afternoon', null, [1, 3]),
  ];
}

function DemoBoard() {
  const [today] = useStateL(() => new Date());
  const [habits, setHabits] = useStateL(demoSeed);
  const { HabitRow } = window.Components;
  const toggle = (id, dKey) => setHabits((prev) => prev.map((h) => {
    if (h.id !== id) return h;
    const c = { ...h.completions };
    if (c[dKey]) delete c[dKey]; else c[dKey] = true;
    return { ...h, completions: c };
  }));
  const noop = () => {};
  return (
    <div className="landing-demo">
      <div className="landing-demo-label">demo · nothing's saved</div>
      <div className="landing-demo-rows">
        {habits.map((h) => (
          <HabitRow key={h.id} habit={h} today={today} pause={null}
            onToggle={toggle} onDelete={noop} onEdit={noop} onPausedTap={noop} />
        ))}
      </div>
    </div>
  );
}

function LandingPage({ onSignIn, theme, onToggleTheme }) {
  const [err, setErr] = useStateL('');
  const signIn = async () => {
    setErr('');
    try { await onSignIn(); } catch (e) { setErr((e && e.message) || 'Sign-in failed'); }
  };
  const feats = [
    { t: 'streaks that survive', d: "miss a day? the streak logic knows your schedule and paused days — it won't punish a rest day." },
    { t: 'life happens', d: 'pause a habit for a stretch when things get hard. we hold the door; your streak waits.' },
    { t: 'minimum viable day', d: 'no energy? log the smallest version. showing up still counts.' },
    { t: 'friends', d: 'share the habits you choose. see who else is showing up today.' },
  ];
  return (
    <div className="landing">
      <header className="landing-top">
        <div className="landing-word"><span className="landing-dot" /> tally</div>
        <div className="landing-top-actions">
          <button className="icon-btn" onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
            {theme === 'dark' ? <window.Icons.Sun /> : <window.Icons.Moon />}
          </button>
          <button className="btn btn-primary" onClick={signIn}>Continue with Google</button>
        </div>
      </header>

      <section className="landing-hero">
        <h1 className="landing-h1">the habit tracker that's kind on the hard days.</h1>
        <p className="landing-sub">streaks, gentle recovery, and a minimum-viable-day so showing up always counts. free, and yours across devices.</p>
        <button className="btn btn-primary btn-lg" onClick={signIn}>Continue with Google</button>
        {err && <div className="sync-err">{err}</div>}
      </section>

      <section className="landing-demo-wrap">
        <DemoBoard />
      </section>

      <section className="landing-feats">
        {feats.map((f, i) => (
          <div className="landing-feat" key={i}>
            <div className="landing-feat-t">{f.t}</div>
            <div className="landing-feat-d">{f.d}</div>
          </div>
        ))}
      </section>

      <footer className="landing-foot">
        <span>tally · a warm little habit tracker</span>
        <a href="https://github.com/umairmohd8/tally" target="_blank" rel="noreferrer">source</a>
      </footer>
    </div>
  );
}

window.Landing = { LandingPage };
