# Real Backend + Sync — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`). **The user intends to execute the code tasks via a Workflow** (implementer → review → verify). **Task 0 is manual (the user)** and must be done before live verification.

**Goal:** Add a real Supabase backend so a signed-in user's habits sync live across their devices, while guest (local-only) mode stays fully functional.

**Architecture:** Zero-build preserved — Supabase loaded as a CDN UMD bundle (`window.sb`), config in `config.js`. New `sync.jsx` (`window.Sync`) is the data layer; new `auth.jsx` (`window.Auth`) is the sign-in UI. `app.jsx` keeps its in-memory `habits`/`me` state and `localStorage` cache exactly as today for guests; when signed in, it loads from Supabase, mirrors mutations to Supabase, and applies realtime updates. RLS enforces own-data isolation.

**Tech Stack:** Supabase (Postgres + Auth + Realtime + RLS), `@supabase/supabase-js@2` UMD, React 18 + in-browser Babel. No bundler, no test framework.

**Reference spec:** `docs/superpowers/specs/2026-05-29-real-backend-sync-design.md` · **Decisions:** `docs/DECISIONS.md` (ADR-009…015)

---

## File structure

| File | Change | Responsibility |
|------|--------|----------------|
| `config.js` | **create** | Public Supabase URL + anon key; creates `window.sb` |
| `sync.jsx` | **create** | `window.Sync` — auth, profile/habit/completion CRUD, migration, realtime. No UI. |
| `auth.jsx` | **create** | `window.Auth` — `SignInModal`, `AccountControl`. UI only. |
| `app.jsx` | modify | Session state; route mutations through `Sync` when signed in; load + realtime + migration; mount `AccountControl` |
| `index.html` | modify | Load supabase UMD + `config.js` (regular), then `sync.jsx`/`auth.jsx` (babel) in order; auth modal CSS |
| `.gitignore` | (no change) | `config.js` IS committed — anon key is public by design |

**New load order** (in `index.html`):
```
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="config.js"></script>
… tweaks-panel → icons → components → screens → social → sync.jsx → auth.jsx → app.jsx
```

### Transpile gate (run after editing any `.jsx`)
```bash
cd /Users/mohammed.umair/my-projects/tally
for f in tweaks-panel.jsx icons.jsx components.jsx screens.jsx social.jsx sync.jsx auth.jsx app.jsx; do
  [ -f "$f" ] && (npx --yes esbuild "$f" "--loader:.jsx=jsx" --outfile=/dev/null 2>/tmp/esb.txt && echo "OK $f" || { echo "FAIL $f"; cat /tmp/esb.txt; })
done
```

---

## Task 0: Supabase project & external setup (MANUAL — user)

**Not code.** Produces the values `config.js` needs and the live project the app talks to.

- [ ] **Step 1: Create the project** at supabase.com → new project. Note the **Project URL** and **anon public key** (Settings → API).

- [ ] **Step 2: Run the schema + RLS SQL** (SQL Editor → run):

```sql
-- profiles
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default 'you',
  avatar_color text not null default 'pop',
  created_at timestamptz not null default now()
);
-- habits
create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  color text not null default 'pop',
  schedule jsonb not null default '{"type":"daily"}',
  time_of_day text not null default 'whenever',
  reminder_time text,
  end_date date,
  shared boolean not null default false,
  created_at date not null default current_date,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index habits_user_idx on habits (user_id) where deleted_at is null;
-- completions
create table habit_completions (
  habit_id uuid not null references habits on delete cascade,
  day date not null,
  primary key (habit_id, day)
);

-- RLS
alter table profiles enable row level security;
alter table habits enable row level security;
alter table habit_completions enable row level security;

create policy "own profile read"   on profiles for select using (id = auth.uid());
create policy "own profile insert" on profiles for insert with check (id = auth.uid());
create policy "own profile update" on profiles for update using (id = auth.uid());

create policy "own habits" on habits for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own completions" on habit_completions for all
  using (exists (select 1 from habits h where h.id = habit_id and h.user_id = auth.uid()))
  with check (exists (select 1 from habits h where h.id = habit_id and h.user_id = auth.uid()));

-- realtime
alter publication supabase_realtime add table habits;
alter publication supabase_realtime add table habit_completions;
```

- [ ] **Step 3: Auth providers.**
  - **Google:** create an OAuth Client ID in Google Cloud Console (Authorized redirect URI = the Supabase callback shown in Auth → Providers → Google), paste client id/secret into Supabase, enable Google.
  - **Phone:** Auth → Providers → Phone → enable; configure an SMS provider (Twilio account SID/auth token/sender). Set OTP rate limits (Auth → Rate Limits).
- [ ] **Step 4: Redirect URLs.** Auth → URL Configuration → add `http://localhost:8000` and the future GitHub Pages URL (e.g. `https://umairmohd8.github.io/tally`) to allowed redirect URLs.
- [ ] **Step 5: Hand off** the Project URL + anon key for `config.js` (Task 1). Until this task is done, the app runs in guest mode only and live-sync verification can't run.

---

## Task 1: `config.js` + load the client

**Files:** Create `config.js`; Modify `index.html`

- [ ] **Step 1: Create `config.js`** (fill the two values from Task 0; placeholders are fine to commit until then):

```js
// Public Supabase config. Safe to commit — the anon key is designed to be public;
// Row-Level Security is what protects data. (See docs/DECISIONS.md ADR-010.)
window.SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
window.SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
window.sb = (window.supabase && window.SUPABASE_URL.startsWith('https://YOUR-'))
  ? null  // not configured yet → app stays in guest mode
  : (window.supabase ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null);
```

- [ ] **Step 2: Load supabase + config in `index.html`**, immediately before the `tweaks-panel.jsx` script tag:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="config.js"></script>
```

- [ ] **Step 3: Verify** — open the app; in the console `window.sb` is `null` (placeholder) or a client (configured); `window.supabase` is defined. Guest app unaffected.

- [ ] **Step 4: Commit**
```bash
git add config.js index.html
git commit -m "feat: load supabase client (config.js)"
```

---

## Task 2: `sync.jsx` — auth layer

**Files:** Create `sync.jsx`; Modify `index.html`

- [ ] **Step 1: Create `sync.jsx`** with the auth surface and row mappers (data methods added in Task 3):

```jsx
// ============================================
// SYNC — Supabase data layer (window.Sync). No UI. Null-safe when not configured.
// ============================================
(function () {
  const sb = () => window.sb; // may be null (guest / not configured)
  const enabled = () => !!window.sb;

  // ---- row <-> client habit mapping ----
  function rowToHabit(r, completions) {
    return {
      id: r.id, name: r.name, color: r.color, schedule: r.schedule,
      timeOfDay: r.time_of_day, reminderTime: r.reminder_time,
      endDate: r.end_date, shared: r.shared, createdAt: r.created_at,
      completions: completions || {},
    };
  }
  function habitToRow(h, userId) {
    return {
      id: h.id, user_id: userId, name: h.name, color: h.color,
      schedule: h.schedule, time_of_day: h.timeOfDay || 'whenever',
      reminder_time: h.reminderTime || null, end_date: h.endDate || null,
      shared: !!h.shared, created_at: h.createdAt, updated_at: new Date().toISOString(),
    };
  }
  async function uid() {
    const { data } = await sb().auth.getUser();
    return data.user ? data.user.id : null;
  }

  // ---- auth ----
  function init(onAuth) {
    if (!enabled()) { onAuth(null); return { unsubscribe() {} }; }
    sb().auth.getSession().then(({ data }) => onAuth(data.session));
    const { data } = sb().auth.onAuthStateChange((_event, session) => onAuth(session));
    return data.subscription;
  }
  function signInGoogle() {
    return sb().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  }
  function signInPhone(phone) { return sb().auth.signInWithOtp({ phone }); }
  function verifyPhone(phone, token) { return sb().auth.verifyOtp({ phone, token, type: 'sms' }); }
  function signOut() { return sb().auth.signOut(); }

  window.Sync = {
    enabled, init, signInGoogle, signInPhone, verifyPhone, signOut,
    _rowToHabit: rowToHabit, _habitToRow: habitToRow, _uid: uid,
  };
})();
```

- [ ] **Step 2: Add the script tag** in `index.html` after `screens.jsx`, before `app.jsx`:
```html
<script type="text/babel" src="sync.jsx"></script>
```

- [ ] **Step 3: Transpile gate** → `OK sync.jsx`.

- [ ] **Step 4: Commit**
```bash
git add sync.jsx index.html
git commit -m "feat: sync.jsx auth layer + row mappers"
```

---

## Task 3: `sync.jsx` — profile, habits, completions, migration

**Files:** Modify `sync.jsx`

- [ ] **Step 1: Add data methods.** Inside the IIFE, before the `window.Sync = {...}` assignment, add:

```jsx
  // ---- profile ----
  async function loadProfile() {
    const id = await uid(); if (!id) return null;
    let { data } = await sb().from('profiles').select('*').eq('id', id).maybeSingle();
    if (!data) {
      data = { id, name: 'you', avatar_color: 'pop' };
      await sb().from('profiles').upsert(data);
    }
    return { id: 'me', name: data.name, avatarColor: data.avatar_color };
  }
  async function saveProfile(me) {
    const id = await uid(); if (!id) return;
    await sb().from('profiles').update({ name: me.name, avatar_color: me.avatarColor }).eq('id', id);
  }

  // ---- habits ----
  async function loadHabits() {
    const { data: rows, error } = await sb().from('habits').select('*').is('deleted_at', null);
    if (error) throw error;
    const ids = rows.map((r) => r.id);
    let comps = [];
    if (ids.length) {
      const { data, error: e2 } = await sb().from('habit_completions').select('*').in('habit_id', ids);
      if (e2) throw e2; comps = data;
    }
    const byHabit = {};
    comps.forEach((c) => { (byHabit[c.habit_id] = byHabit[c.habit_id] || {})[c.day] = true; });
    return rows.map((r) => rowToHabit(r, byHabit[r.id] || {}));
  }
  async function insertHabit(h) {
    const id = await uid(); if (!id) return;
    const { error } = await sb().from('habits').insert(habitToRow(h, id));
    if (error) throw error;
  }
  async function updateHabit(h) {
    const id = await uid(); if (!id) return;
    const row = habitToRow(h, id); delete row.user_id; delete row.created_at;
    const { error } = await sb().from('habits').update(row).eq('id', h.id);
    if (error) throw error;
  }
  async function softDeleteHabit(habitId) {
    const { error } = await sb().from('habits').update({ deleted_at: new Date().toISOString() }).eq('id', habitId);
    if (error) throw error;
  }
  async function setCompletion(habitId, day, done) {
    if (done) {
      const { error } = await sb().from('habit_completions').upsert({ habit_id: habitId, day });
      if (error) throw error;
    } else {
      const { error } = await sb().from('habit_completions').delete().eq('habit_id', habitId).eq('day', day);
      if (error) throw error;
    }
  }

  // ---- migration (first sign-in) ----
  // Uploads local habits ONLY if the account has none. Returns count uploaded, or null if account already had data.
  async function migrateLocalHabits(localHabits) {
    const id = await uid(); if (!id) return null;
    const { data: existing } = await sb().from('habits').select('id').is('deleted_at', null).limit(1);
    if (existing && existing.length) return null; // account authoritative
    const rows = [], comps = [];
    (localHabits || []).forEach((h) => {
      const newId = crypto.randomUUID();
      rows.push(habitToRow({ ...h, id: newId, createdAt: h.createdAt || new Date().toISOString().slice(0, 10) }, id));
      Object.keys(h.completions || {}).forEach((day) => comps.push({ habit_id: newId, day }));
    });
    if (rows.length) { const { error } = await sb().from('habits').insert(rows); if (error) throw error; }
    if (comps.length) { const { error } = await sb().from('habit_completions').insert(comps); if (error) throw error; }
    return rows.length;
  }
```

- [ ] **Step 2: Export the new methods.** Update the `window.Sync = {...}` object to include them:

```jsx
  window.Sync = {
    enabled, init, signInGoogle, signInPhone, verifyPhone, signOut,
    loadProfile, saveProfile,
    loadHabits, insertHabit, updateHabit, softDeleteHabit, setCompletion,
    migrateLocalHabits,
    _rowToHabit: rowToHabit, _habitToRow: habitToRow, _uid: uid,
  };
```

- [ ] **Step 3: Transpile gate** → `OK sync.jsx`.

- [ ] **Step 4: Commit**
```bash
git add sync.jsx
git commit -m "feat: sync data layer (profile, habits, completions, migration)"
```

---

## Task 4: `sync.jsx` — realtime

**Files:** Modify `sync.jsx`

- [ ] **Step 1: Add `subscribe`.** Before the `window.Sync = {...}` assignment add:

```jsx
  // ---- realtime: fire onChange on any of the user's habit/completion changes ----
  function subscribe(userId, onChange) {
    if (!enabled()) return () => {};
    const ch = sb().channel('tally-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habits', filter: 'user_id=eq.' + userId }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_completions' }, onChange)
      .subscribe();
    return () => { sb().removeChannel(ch); };
  }
```

- [ ] **Step 2: Export it** — add `subscribe,` to the `window.Sync = {...}` object.

- [ ] **Step 3: Transpile gate** → `OK sync.jsx`.

- [ ] **Step 4: Commit**
```bash
git add sync.jsx
git commit -m "feat: realtime subscription in sync layer"
```

---

## Task 5: `auth.jsx` — sign-in UI

**Files:** Create `auth.jsx`; Modify `index.html` (script tag + CSS)

- [ ] **Step 1: Create `auth.jsx`:**

```jsx
// ============================================
// AUTH UI — window.Auth: SignInModal + AccountControl. Talks to window.Sync.
// ============================================
const { useState: useStateA } = React;

function SignInModal({ onClose }) {
  const [mode, setMode] = useStateA('choose'); // 'choose' | 'phone' | 'code'
  const [phone, setPhone] = useStateA('');
  const [code, setCode] = useStateA('');
  const [busy, setBusy] = useStateA(false);
  const [err, setErr] = useStateA('');

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const google = async () => {
    setErr(''); setBusy(true);
    try { await window.Sync.signInGoogle(); } catch (e) { setErr(e.message || 'Sign-in failed'); setBusy(false); }
  };
  const sendCode = async () => {
    if (!phone.trim()) return;
    setErr(''); setBusy(true);
    try { await window.Sync.signInPhone(phone.trim()); setMode('code'); }
    catch (e) { setErr(e.message || 'Could not send code'); }
    setBusy(false);
  };
  const verify = async () => {
    if (!code.trim()) return;
    setErr(''); setBusy(true);
    try { await window.Sync.verifyPhone(phone.trim(), code.trim()); /* onAuthStateChange closes */ }
    catch (e) { setErr(e.message || 'Wrong code'); setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-eyebrow">Sync</div>
            <div className="modal-title">Carry your habits everywhere</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><window.Icons.X /></button>
        </div>
        <div className="modal-body">
          <p className="sync-blurb">Sign in to sync across your devices. Your habits stay private — friends only ever see what you mark shared.</p>
          {mode === 'choose' && (
            <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-primary" disabled={busy} onClick={google}>Continue with Google</button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setMode('phone')}>Use phone number</button>
            </div>
          )}
          {mode === 'phone' && (
            <div className="field">
              <input className="text-input" placeholder="+1 555 123 4567" value={phone} autoFocus
                onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendCode(); }} />
            </div>
          )}
          {mode === 'code' && (
            <div className="field">
              <div className="field-label">Code sent to {phone}</div>
              <input className="text-input" placeholder="123456" value={code} autoFocus inputMode="numeric"
                onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') verify(); }} />
            </div>
          )}
          {err && <div className="sync-err">{err}</div>}
        </div>
        <div className="modal-foot">
          <div className="modal-foot-end">
            <button className="btn btn-ghost" onClick={onClose}>Not now</button>
            {mode === 'phone' && <button className="btn btn-primary" disabled={busy || !phone.trim()} onClick={sendCode}>Send code</button>}
            {mode === 'code' && <button className="btn btn-primary" disabled={busy || !code.trim()} onClick={verify}>Verify</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Topbar control: "sync" when signed out, initial + sign-out when signed in.
function AccountControl({ session, me, onOpenSignIn, onSignOut }) {
  const [menu, setMenu] = useStateA(false);
  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    setTimeout(() => window.addEventListener('click', close, { once: true }), 0);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  if (!window.Sync.enabled()) return null; // backend not configured → no control
  if (!session) {
    return <button className="icon-btn" onClick={onOpenSignIn} aria-label="Sign in to sync" title="Sign in to sync"><window.Icons.Cloud /></button>;
  }
  const initial = ((me && me.name) || '?').trim().charAt(0).toUpperCase();
  return (
    <div style={{ position: 'relative' }}>
      <button className="avatar avatar-sm" aria-label="Account" onClick={(e) => { e.stopPropagation(); setMenu((v) => !v); }}
        style={{ background: window.HabitUtils.colorOf((me && me.avatarColor) || 'pop') }}>{initial}</button>
      {menu && (
        <div className="account-menu" onClick={(e) => e.stopPropagation()}>
          <div className="account-menu-name">synced as {me ? me.name : 'you'}</div>
          <button onClick={() => { onSignOut(); setMenu(false); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

window.Auth = { SignInModal, AccountControl };
```

- [ ] **Step 2: Add a `Cloud` icon** to `icons.jsx` `Icons` map (cloud outline):
```jsx
  Cloud:   (p) => <Icon {...p} d={["M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.3A3.5 3.5 0 0 1 18 18z"]} />,
```

- [ ] **Step 3: Add the script tag** in `index.html` after `sync.jsx`, before `app.jsx`:
```html
<script type="text/babel" src="auth.jsx"></script>
```

- [ ] **Step 4: Add CSS** to `index.html`'s `<style>` block:
```css
  .sync-blurb { font-size: 13px; color: var(--ink-50); line-height: 1.5; margin-bottom: 12px; }
  .sync-err { font-size: 12px; color: var(--pop); margin-top: 8px; }
  .avatar-sm { width: 30px; height: 30px; font-size: 14px; cursor: pointer; }
  .account-menu { position: absolute; top: 38px; right: 0; z-index: 10; background: var(--card);
    border: 1px solid var(--smoke); border-radius: 10px; box-shadow: var(--shadow-lg); min-width: 150px; padding: 6px; }
  .account-menu-name { font-size: 11px; color: var(--ink-30); font-family: var(--mono); padding: 4px 8px; }
  .account-menu button { width: 100%; text-align: left; padding: 8px 8px; border-radius: 6px; font-size: 13px; color: var(--ink); }
  .account-menu button:hover { background: var(--card-2); }
```

- [ ] **Step 5: Transpile gate** → `OK auth.jsx`, `OK icons.jsx`.

- [ ] **Step 6: Commit**
```bash
git add auth.jsx icons.jsx index.html
git commit -m "feat: sign-in modal + account control"
```

---

## Task 6: Wire sync into `app.jsx`

**Files:** Modify `app.jsx`

- [ ] **Step 1: Add session state + a signed-in ref.** After the `friends` state declaration add:
```jsx
  const [session, setSession] = useState(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const signedInRef = useRef(false);
  useEffect(() => { signedInRef.current = !!session; }, [session]);
```

- [ ] **Step 2: Init auth + load/migrate/subscribe on sign-in.** Add this effect after the persistence effects:
```jsx
  useEffect(() => {
    if (!window.Sync.enabled()) return;
    let unsubRealtime = () => {};
    const sub = window.Sync.init(async (s) => {
      setSession(s);
      unsubRealtime(); unsubRealtime = () => {};
      if (!s) return;
      try {
        const uploaded = await window.Sync.migrateLocalHabits(lsGet(LS.HABITS, []));
        const [cloudHabits, cloudMe] = await Promise.all([window.Sync.loadHabits(), window.Sync.loadProfile()]);
        setHabits(cloudHabits);
        if (cloudMe) setMe(cloudMe);
        showToast(uploaded ? `Synced ${uploaded} habit${uploaded === 1 ? '' : 's'} to your account` : 'Synced. Welcome back.');
        unsubRealtime = window.Sync.subscribe(s.user.id, async () => {
          try { setHabits(await window.Sync.loadHabits()); } catch (_) {}
        });
      } catch (e) { showToast('Sync error — working offline'); }
    });
    return () => { sub.unsubscribe(); unsubRealtime(); };
  }, [showToast]);
```

- [ ] **Step 3: Mirror mutations to Supabase when signed in.** Edit the four mutation callbacks so each pushes to `Sync` after updating local state:

`toggle` — after the `setHabits(...)` call returns the new completions, push the single day. Replace the `toggle` body's return-mapping so it captures the new done-state, then fire sync. Simplest: after `setHabits(...)`, add a post-update sync using the computed value. Change `toggle` to:
```jsx
  const toggle = useCallback((id, dKeyOverride) => {
    const dKey = dKeyOverride || dayKey(today);
    let becameDone = null;
    setHabits(prev => prev.map(h => {
      if (h.id !== id) return h;
      const cmp = { ...h.completions };
      const wasDone = !!cmp[dKey];
      if (wasDone) delete cmp[dKey]; else cmp[dKey] = true;
      becameDone = !wasDone;
      if (!wasDone) {
        setTimeout(() => {
          const streakNow = computeStreak({ ...h, completions: cmp }, today, pause);
          showToast(pickToastLine(streakNow));
        }, 350);
      }
      return { ...h, completions: cmp };
    }));
    if (signedInRef.current && becameDone !== null) {
      window.Sync.setCompletion(id, dKey, becameDone).catch(() => {});
    }
  }, [today, showToast, pause]);
```

`addHabit` — give new habits a uuid and insert:
```jsx
  const addHabit = useCallback((data) => {
    const habit = {
      id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'h' + Date.now(),
      ...data, completions: {}, createdAt: dayKey(new Date()),
    };
    setHabits(prev => [...prev, habit]);
    setModalOpen(false); setModalDefaultTOD(null);
    if (signedInRef.current) window.Sync.insertHabit(habit).catch(() => {});
    setTimeout(() => showToast(`Added · ${data.name}`), 100);
  }, [showToast]);
```

`editHabit` — push the merged habit:
```jsx
  const editHabit = useCallback((id, data) => {
    let merged = null;
    setHabits(prev => prev.map(h => { if (h.id !== id) return h; merged = { ...h, ...data }; return merged; }));
    setEditingHabit(null);
    if (signedInRef.current && merged) window.Sync.updateHabit(merged).catch(() => {});
    setTimeout(() => showToast(`Updated · ${data.name}`), 100);
  }, [showToast]);
```

`deleteHabit` — soft-delete on the server:
```jsx
  const deleteHabit = useCallback((id) => {
    setHabits(prev => prev.filter(h => h.id !== id));
    if (signedInRef.current) window.Sync.softDeleteHabit(id).catch(() => {});
  }, []);
```

- [ ] **Step 4: Sync profile renames.** Change `renameMe` to also persist when signed in:
```jsx
  const renameMe = useCallback((name) => {
    setMe(prev => {
      const next = { ...prev, name: (name || '').trim() || prev.name };
      if (signedInRef.current) window.Sync.saveProfile(next).catch(() => {});
      return next;
    });
  }, []);
```

- [ ] **Step 5: Sign-out handler + mount the account control.** Add the handler near the other callbacks:
```jsx
  const signOut = useCallback(async () => { try { await window.Sync.signOut(); } catch (_) {} setSession(null); showToast('Signed out · still on this device'); }, [showToast]);
```
In the topbar `.topbar-actions`, before the theme toggle button, add:
```jsx
          <window.Auth.AccountControl session={session} me={me} onOpenSignIn={() => setSignInOpen(true)} onSignOut={signOut} />
```
And near the other modals (by the `pauseModalOpen` render) add:
```jsx
      {signInOpen && <window.Auth.SignInModal onClose={() => setSignInOpen(false)} />}
```

- [ ] **Step 6: Transpile gate** → `OK app.jsx`.

- [ ] **Step 7: Commit**
```bash
git add app.jsx
git commit -m "feat: wire supabase sync into app (auth, load, mutations, realtime)"
```

---

## Task 7: Deploy to GitHub Pages

**Files:** none (repo settings) — MANUAL/CLI

- [ ] **Step 1: Enable Pages** from the `main` branch root:
```bash
gh api -X POST repos/umairmohd8/tally/pages -f source.branch=main -f source.path=/ 2>/dev/null || \
  echo "Enable via GitHub UI: Settings → Pages → Deploy from branch → main / root"
```
- [ ] **Step 2:** Add the resulting `https://umairmohd8.github.io/tally` URL to Supabase Auth redirect URLs (Task 0 Step 4) if not already.
- [ ] **Step 3: Verify** the live URL loads in guest mode and (once configured) sign-in works.

---

## Task 8: Verification

### A. Static + guest (any time, no Supabase needed)
- [ ] Transpile gate: all files `OK`.
- [ ] Serve (`python3 -m http.server 8000`) and browser-drive: no console errors; **guest mode behaves exactly as before** (add/edit/delete/deadline/friends all work with `window.sb === null`); the sync/account control is hidden when `window.sb` is null.

### B. Live sync (after Task 0 done + real `config.js`)
Kill the locked devtools profile first if needed (`pkill -f "chrome-devtools-mcp/chrome-profile"`).
- [ ] **Sign-in renders** — account control shows; SignInModal opens; Google + phone paths reachable.
- [ ] **Migration** — as a guest with seeded habits, sign in to a fresh account → toast "Synced N habits"; rows appear in Supabase (`habits` + `habit_completions`).
- [ ] **Live cross-device** — two browser profiles signed into the same account; toggle a habit in one → it appears in the other within ~seconds (realtime).
- [ ] **Fresh device pull** — a profile signing in on a clean cache loads the account's habits.
- [ ] **RLS isolation** — a second account cannot read the first's rows (query returns empty); friends/private data not leaked.
- [ ] **Sign-out** — returns to guest mode with local cache intact.

---

## Self-Review

**1. Spec coverage:**
- Zero-build CDN client + `config.js` → Task 1. ✓
- Schema (profiles/habits/habit_completions, soft-delete, realtime) → Task 0. ✓
- RLS own-data → Task 0. ✓
- Auth (Google + phone OTP), session, onAuthStateChange → Tasks 2, 5, 6. ✓
- Sync engine (load, optimistic writes, realtime, conflicts via set-union/LWW) → Tasks 3, 4, 6. ✓
- Migration (account-empty uploads, else account wins) → Task 3 + Task 6 Step 2. ✓
- Two modes / local-first, guest never walled → Task 6 (all `Sync` calls guarded by `signedInRef`/`enabled()`); Task 8A. ✓
- Code structure (`config.js`, `sync.jsx`, `auth.jsx`, app wiring, load order) → File structure + Tasks 1,2,5,6. ✓
- Deploy → Task 7. ✓
- Edge cases (offline `.catch(()=>{})`, sign-out keeps cache, token refresh by Supabase) → Task 6; Task 8. ✓

**2. Placeholder scan:** `YOUR-PROJECT`/`YOUR-ANON-PUBLIC-KEY` in `config.js` are real values the user fills in Task 0 (not plan gaps); all code steps contain complete code. No "TBD"/"handle errors" hand-waves.

**3. Type/name consistency:** `window.Sync` methods (`enabled, init, signInGoogle, signInPhone, verifyPhone, signOut, loadProfile, saveProfile, loadHabits, insertHabit, updateHabit, softDeleteHabit, setCompletion, migrateLocalHabits, subscribe`) are defined in Tasks 2–4 and called with matching signatures in Task 6. `updateHabit(merged)` / `insertHabit(habit)` take a full client habit; `setCompletion(id, day, bool)`, `softDeleteHabit(id)` match call sites. `window.Auth.{SignInModal, AccountControl}` props match Task 6 usage. Habit row mapping is symmetric (`rowToHabit`/`habitToRow`). Friend code is untouched (Phase 2). ✓
