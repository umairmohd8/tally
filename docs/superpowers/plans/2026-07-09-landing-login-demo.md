# Landing + Login Page with Live Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Show unauthenticated visitors a marketing landing page with a live, non-persisting demo instead of the seeded tracker; sign-in (Google) leads to the real synced tracker.

**Architecture:** New `landing.jsx` (`window.Landing.LandingPage`) with an ephemeral demo built from the existing `window.Components.HabitRow`. `app.jsx` gains an early landing return (`Sync.enabled() && !session`) and its seed initializers no longer seed when the backend is configured — killing the incognito "stale data" leak. Signed-in and no-backend (local-dev guest) paths are preserved.

**Tech Stack:** React 18 + in-browser Babel (zero build), Supabase (already wired). No test framework — verification is the transpile gate + browser-drive (same as the Phase 1 plan).

**Reference spec:** `docs/superpowers/specs/2026-07-09-landing-login-demo-design.md`

### Transpile gate (run after editing any `.jsx`)
```bash
cd /Users/mohammed.umair/my-projects/tally
for f in tweaks-panel.jsx icons.jsx components.jsx screens.jsx social.jsx sync.jsx auth.jsx landing.jsx app.jsx; do
  [ -f "$f" ] && (npx --yes esbuild "$f" "--loader:.jsx=jsx" --outfile=/dev/null 2>/tmp/esb.txt && echo "OK $f" || { echo "FAIL $f"; cat /tmp/esb.txt; })
done
```

---

## Task 1: Create `landing.jsx`

**Files:**
- Create: `landing.jsx`

- [ ] **Step 1: Create `landing.jsx`** with the ephemeral demo board and the landing page:

```jsx
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
```

- [ ] **Step 2: Transpile gate** — run the gate command above. Expected: `OK landing.jsx` (and all others OK). `landing.jsx` won't run yet (not loaded in index.html until Task 2), but it must parse.

- [ ] **Step 3: Commit**
```bash
git add landing.jsx
git commit -m "feat: landing.jsx — landing page + ephemeral demo board"
```

---

## Task 2: Load `landing.jsx` + add landing CSS in `index.html`

**Files:**
- Modify: `index.html` (script tag + `<style>` block)

- [ ] **Step 1: Add the script tag.** In `index.html`, after the `auth.jsx` script tag and before the `app.jsx` script tag (currently lines ~773–774), insert:

```html
<script type="text/babel" src="landing.jsx"></script>
```

Resulting order: `… sync.jsx → auth.jsx → landing.jsx → app.jsx`.

- [ ] **Step 2: Add landing CSS.** In `index.html`'s `<style>` block, just before `</style>`, add (uses existing Inkwell palette variables):

```css
  /* LANDING */
  .landing { max-width: 760px; margin: 0 auto; padding: 24px 20px 64px; }
  .landing-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 48px; }
  .landing-word { display: flex; align-items: center; gap: 8px; font-family: var(--serif); font-size: 22px; font-style: italic; color: var(--ink); }
  .landing-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pop); display: inline-block; }
  .landing-top-actions { display: flex; align-items: center; gap: 10px; }
  .landing-hero { text-align: center; padding: 32px 0 40px; }
  .landing-h1 { font-family: var(--serif); font-size: clamp(30px, 6vw, 46px); line-height: 1.1; color: var(--ink); margin: 0 0 16px; }
  .landing-sub { font-size: 16px; line-height: 1.55; color: var(--ink-50); max-width: 520px; margin: 0 auto 24px; }
  .btn-lg { font-size: 15px; padding: 12px 22px; }
  .landing-demo-wrap { margin: 8px 0 48px; }
  .landing-demo { border: 1px solid var(--smoke); border-radius: 16px; padding: 16px; background: var(--card); }
  .landing-demo-label { font-family: var(--mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-30); margin-bottom: 12px; padding-left: 4px; }
  .landing-demo-rows { display: flex; flex-direction: column; gap: 10px; }
  .landing-feats { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 40px; }
  .landing-feat { border: 1px solid var(--smoke); border-radius: 14px; padding: 18px; background: var(--card); }
  .landing-feat-t { font-family: var(--serif); font-size: 17px; color: var(--ink); margin-bottom: 6px; }
  .landing-feat-d { font-size: 13.5px; line-height: 1.5; color: var(--ink-50); }
  .landing-foot { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--ink-30); border-top: 1px solid var(--smoke); padding-top: 16px; }
  .landing-foot a { color: var(--ink-50); }
  @media (max-width: 560px) { .landing-feats { grid-template-columns: 1fr; } }
```

- [ ] **Step 3: Verify var names exist.** Confirm the palette variables used above are defined in the same `<style>` block:
```bash
cd /Users/mohammed.umair/my-projects/tally
grep -oE "\-\-(serif|mono|ink|ink-50|ink-30|pop|smoke|card):" index.html | sort -u
```
Expected: each of `--serif`, `--mono`, `--ink`, `--ink-50`, `--ink-30`, `--pop`, `--smoke`, `--card` appears. If any is missing, substitute the closest existing variable (list them with `grep -oE "\-\-[a-z0-9-]+:" index.html | sort -u`).

- [ ] **Step 4: Commit**
```bash
git add index.html
git commit -m "feat: load landing.jsx + landing styles"
```

---

## Task 3: Gate the app on auth + stop seeding when backend is configured (`app.jsx`)

**Files:**
- Modify: `app.jsx` (habits initializer ~line 98, friends initializer ~line 107, landing guard before the recovery return ~line 336)

- [ ] **Step 1: Change the habits initializer.** Replace:
```jsx
  const [habits, setHabits] = useState(() => {
    const stored = lsGet(LS.HABITS, null);
    return stored && Array.isArray(stored) && stored.length > 0 ? stored : seedHabits(new Date());
  });
```
with:
```jsx
  const [habits, setHabits] = useState(() => {
    const stored = lsGet(LS.HABITS, null);
    if (stored && Array.isArray(stored) && stored.length > 0) return stored;
    // Backend configured → don't seed (signed-out users see the landing/demo, signed-in load
    // from cloud). Only seed for the no-backend local-dev guest fallback.
    return window.Sync.enabled() ? [] : seedHabits(new Date());
  });
```

- [ ] **Step 2: Change the friends initializer.** Replace:
```jsx
  const [friends, setFriends] = useState(() => {
    const stored = lsGet(LS.FRIENDS, null);
    return stored && Array.isArray(stored) && stored.length > 0 ? stored : window.Social.seedFriends(new Date());
  });
```
with:
```jsx
  const [friends, setFriends] = useState(() => {
    const stored = lsGet(LS.FRIENDS, null);
    if (stored && Array.isArray(stored) && stored.length > 0) return stored;
    return window.Sync.enabled() ? [] : window.Social.seedFriends(new Date());
  });
```

- [ ] **Step 3: Add the landing guard.** Find the recovery early return (`if (view === 'recovery') {`, ~line 336). Immediately **before** it, add:
```jsx
  // Signed-out visitors on a configured backend get the landing page (with live demo),
  // never the tracker. All hooks above run unconditionally, so this early return is safe.
  if (window.Sync.enabled() && !session) {
    return (
      <window.Landing.LandingPage
        onSignIn={() => window.Sync.signInGoogle()}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />
    );
  }

```

- [ ] **Step 4: Transpile gate** — run the gate command. Expected: all `OK`, especially `OK app.jsx`.

- [ ] **Step 5: Commit**
```bash
git add app.jsx
git commit -m "feat: gate tracker behind auth (landing when signed out); stop seeding when backend configured"
```

---

## Task 4: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the landing + gating.** In `CLAUDE.md`, add `landing.jsx` to the file-layout/load-order list (it loads after `auth.jsx`, before `app.jsx`) and add a short "Landing & gating" note under Key concepts:

```markdown
- **Landing & gating** — `landing.jsx` (`window.Landing.LandingPage`) is the signed-out front
  door: hero + feature cards + a live **ephemeral** demo (reuses `HabitRow`, local state only,
  no persistence). `app.jsx` renders it when `Sync.enabled() && !session`. Signed-in users get
  the tracker; with no backend config (`!Sync.enabled()`), the tracker runs in seeded guest mode
  (local dev). Because of this, `habits`/`friends` seed **only** when `!Sync.enabled()` — a
  configured, signed-out visit never writes a seed to `localStorage`.
```

- [ ] **Step 2: Commit**
```bash
git add CLAUDE.md
git commit -m "docs: document landing page + auth gating in CLAUDE.md"
```

---

## Task 5: Verification (transpile + browser)

**Files:** none

- [ ] **Step 1: Transpile gate** — all files `OK`.

- [ ] **Step 2: Serve** (kill any locked devtools profile first if needed: `pkill -f "chrome-devtools-mcp/chrome-profile"`):
```bash
cd /Users/mohammed.umair/my-projects/tally
(python3 -m http.server 8000 >/tmp/tally-http.log 2>&1 &) ; sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/
```

- [ ] **Step 3: Signed-out landing (cleared storage).** Browser-drive `http://localhost:8000/`, clear `tally-*` localStorage, reload. Assert:
  - `window.Sync.enabled()` is `true`, no `session` → the **landing** renders (hero, "Continue with Google", demo board, feature cards). The tracker/tabs are NOT shown.
  - `localStorage.getItem('tally-habits')` is `null` (no seed written just by visiting).
  - No console errors (favicon 404 is fine).

- [ ] **Step 4: Demo is ephemeral.** In the landing demo, toggle a habit complete (its checkmark fills). Reload the page. Assert the toggle is **reset** (demo seed back to initial) and `localStorage.getItem('tally-habits')` is still `null`.

- [ ] **Step 5: Sign-in CTA reaches Google.** Evaluate `window.Sync.signInGoogle({ /* or */ })` path is wired: click "Continue with Google" (or call `window.sb.auth.signInWithOAuth({provider:'google',options:{skipBrowserRedirect:true}})`) and confirm the returned authorize URL is a Supabase/Google URL (do NOT enter credentials). This mirrors the Phase 1 Google check.

- [ ] **Step 6: Guest fallback (no backend).** Temporarily confirm the `!Sync.enabled()` branch: in the browser console set nothing (can't easily null `window.sb` post-load) — instead reason-check by code review that with `window.sb === null`, `Sync.enabled()` is false → habits initializer seeds → tracker renders (guest). Optionally verify by loading with a placeholder `config.js` locally. Document the result.

- [ ] **Step 7: Signed-in still works (manual/user).** With a real Google session, the landing disappears and the tracker renders, starting clean (no demo habits, no seeded friends). Note: requires a live sign-in (user-driven, as in Phase 1).

- [ ] **Step 8: Visual polish pass.** Screenshot the landing (light + dark, narrow + wide). If it looks bland/generic, apply the `improving-ui-visuals` skill before finalizing. Re-screenshot to confirm.

- [ ] **Step 9: Stop the server**
```bash
pkill -f "http.server 8000"
```

---

## Self-Review

**1. Spec coverage:**
- Landing page (hero, demo, features, footer) → Task 1. ✓
- Ephemeral interactive demo (no persistence, resets on reload) → Task 1 (`DemoBoard` local state) + Task 5 Step 4. ✓
- Gating (signed-in tracker / configured-signed-out landing / no-backend guest) → Task 3 Step 3 + initializer changes. ✓
- Seed leak fix at initializer (habits + friends), incl. friends bonus → Task 3 Steps 1–2. ✓
- Google-only sign-in on landing → Task 1 (`onSignIn` → `signInGoogle`). ✓
- Load order / CSS → Task 2. ✓
- Docs → Task 4. ✓
- Verification incl. no-seed-leak + ephemeral + Google reachability → Task 5. ✓

**2. Placeholder scan:** All code steps contain complete code; CSS is concrete; no "TBD"/"handle X". Task 5 Step 6 is a reasoned check (documented limitation of not being able to null `window.sb` at runtime) rather than a hand-wave. ✓

**3. Type/name consistency:** `window.Landing.LandingPage` created in Task 1, referenced in Task 3. `HabitRow` props (`habit, today, pause, onToggle, onDelete, onEdit, onPausedTap`) match `components.jsx:191`. `onToggle(id, dKey)` matches `HabitRow`'s call site (`components.jsx:256`). `window.Sync.enabled()` / `signInGoogle()` exist in `sync.jsx`. `window.Icons.Sun`/`Moon` exist. Theme toggle mirrors `app.jsx:379`. ✓
