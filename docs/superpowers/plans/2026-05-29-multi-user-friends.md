# Simulated Multi-User & Friends — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Note:** the user intends to execute this via a Workflow (one implementer applies the whole change, then multi-lens review → adversarial verify → live browser verification). Either way, the code below is the source of truth.

**Goal:** Add a locally-simulated friends experience to tally — a Friends tab where you see friends' shared-habit progress, plus a per-habit private/shared toggle — with no backend.

**Architecture:** New `social.jsx` module (`window.Social`) holds all friends UI + seed/persistence helpers, loaded after `screens.jsx`. A single `shared` boolean is added to the habit model. Friend data lives in `localStorage` (`tally-me`, `tally-friends`) seeded with mock friends whose habits reuse the exact owner-habit shape, so `HabitUtils.computeStreak` and the 7-day-dot logic work unchanged. Designed so a future real-sync layer swaps only the data source.

**Tech Stack:** Plain JSX transpiled in-browser by `@babel/standalone`, React 18 via CDN, `localStorage`. No bundler, no test framework. **Verification = `esbuild` transpile (syntax gate) + chrome-devtools browser-driving (behavioral gate).** Do NOT add a unit-test framework — it violates the project's zero-build constraint.

**Reference spec:** `docs/superpowers/specs/2026-05-29-multi-user-friends-design.md`

---

## File structure

| File | Change | Responsibility |
|------|--------|----------------|
| `social.jsx` | **create** | `window.Social`: `FriendsScreen`, `FriendCard`, `FriendHabitRow`, `AddFriendModal`, `seedMe`, `seedFriends`, `makeFriend` |
| `components.jsx` | modify | `HabitModal` gains a Sharing toggle; `HabitRow` renders a `shared` pill |
| `app.jsx` | modify | `tally-me`/`tally-friends` state + persistence; `friends` tab + render; `addFriend`/`removeFriend`/`renameMe` |
| `index.html` | modify | load `social.jsx` (between `screens.jsx` and `app.jsx`); friends CSS + `shared` pill CSS |

**No new icons required** — reuse `window.Icons.Plus` and `window.Icons.X`. Avatars are text initials.

---

### Verification helper (used by every task)

Transpile gate — run after editing any `.jsx`:

```bash
cd /Users/mohammed.umair/my-projects/tally
for f in tweaks-panel.jsx icons.jsx components.jsx screens.jsx social.jsx app.jsx; do
  [ -f "$f" ] && (npx --yes esbuild "$f" "--loader:.jsx=jsx" --outfile=/dev/null 2>/tmp/esb.txt \
    && echo "OK   $f" || { echo "FAIL $f"; cat /tmp/esb.txt; })
done
```
Expected: `OK` for every existing file.

---

## Task 1: Add the `shared` field (toggle + pill + seed)

**Files:**
- Modify: `components.jsx` (HabitModal sharing toggle; HabitRow pill)
- Modify: `app.jsx` (seed two demo habits as shared)
- Modify: `index.html` (`.meta-pill.shared` CSS)

- [ ] **Step 1: Add `shared` state to `HabitModal`**

In `components.jsx`, inside `HabitModal`, alongside the other `useState` declarations (next to `const [endDate, setEndDate] = ...`), add:

```jsx
  const [shared, setShared] = React.useState(habit ? !!habit.shared : false);
```

- [ ] **Step 2: Render the Sharing field**

In `HabitModal`, immediately AFTER the Deadline `<div className="field"> … </div>` block and BEFORE the Reminder-time field, insert:

```jsx
          <div className="field">
            <div className="field-label">Sharing <span className="opt">· friends can see this one</span></div>
            <div className="chip-row" role="radiogroup" aria-label="Sharing">
              <button className="chip" role="radio" aria-checked={!shared} onClick={() => setShared(false)}>Private</button>
              <button className="chip" role="radio" aria-checked={shared} onClick={() => setShared(true)}>Shared with friends</button>
            </div>
          </div>
```

- [ ] **Step 3: Emit `shared` in the submit payload**

In `HabitModal`'s `submit()`, add `shared` to the object passed to `onSubmit`:

```jsx
    onSubmit({
      name: name.trim(),
      color,
      timeOfDay,
      schedule: buildSchedule(),
      reminderTime: reminderTime || null,
      endDate: endDate || null,
      shared,
    });
```

- [ ] **Step 4: Render the `shared` pill on `HabitRow`**

In `components.jsx`, inside `HabitRow`'s `.habit-name` div, AFTER the `finished` pill block and BEFORE the `rest day` pill block, add:

```jsx
          {habit.shared && (
            <span className="meta-pill shared" title="Friends can see this habit">shared</span>
          )}
```

- [ ] **Step 5: Seed two demo habits as shared**

In `app.jsx`, inside `seedHabits`, just before `return [water, pages, run, stretch, read, lang];`, add:

```jsx
  read.shared = true;
  run.shared = true;
```

- [ ] **Step 6: Add `.meta-pill.shared` CSS**

In `index.html`'s `<style>` block, next to the other `.meta-pill.*` rules, add:

```css
  .meta-pill.shared { background: var(--cloud-soft, color-mix(in srgb, var(--cloud) 18%, transparent)); color: var(--cloud); border: 1px solid color-mix(in srgb, var(--cloud) 35%, transparent); }
```

- [ ] **Step 7: Transpile gate**

Run the Verification helper. Expected: `OK components.jsx`, `OK app.jsx`.

- [ ] **Step 8: Commit**

```bash
git add components.jsx app.jsx index.html
git commit -m "feat: add per-habit shared toggle and pill"
```

---

## Task 2: Create `social.jsx`

**Files:**
- Create: `social.jsx`
- Modify: `index.html` (load order)

- [ ] **Step 1: Write `social.jsx`**

Create `social.jsx` with EXACTLY this content:

```jsx
// ============================================
// SOCIAL — friends & sharing (simulated, localStorage) · Inkwell skin
// Mirrors the owner-habit shape so HabitUtils.computeStreak + dots work unchanged.
// ============================================
const { useState: useStateS } = React;

// ---- seed helpers ----
function seedMe() {
  return { id: 'me', name: 'you', avatarColor: 'pop' };
}

// Build a friend habit using the SAME shape as owner habits, with ~70 days of plausible data.
function mkFriendHabit(id, name, color, schedule, today, prob) {
  const { dayKey, addDays, isScheduled } = window.HabitUtils;
  const completions = {};
  for (let i = 0; i < 70; i++) {
    const d = addDays(today, -i);
    if (!isScheduled({ schedule }, d)) continue;
    if (i === 0) { if (Math.random() < prob * 0.6) completions[dayKey(d)] = true; continue; }
    if (Math.random() < prob) completions[dayKey(d)] = true;
  }
  return { id, name, color, schedule, timeOfDay: 'whenever', completions, createdAt: dayKey(addDays(today, -70)) };
}

function makeFriend(name, avatarColor, today) {
  const id = 'f' + Date.now() + Math.floor(Math.random() * 1000);
  const habits = [
    mkFriendHabit(id + '-a', 'Morning walk', 'cloud', { type: 'daily' }, today, 0.8),
    mkFriendHabit(id + '-b', 'Read', 'plum', { type: 'weekly_count', count: 4 }, today, 0.6),
  ];
  return { id, name, avatarColor, habits };
}

function seedFriends(today) {
  const maya = { id: 'fm', name: 'maya', avatarColor: 'plum', habits: [
    mkFriendHabit('fm-run', 'Run', 'cloud', { type: 'specific_days', days: [1, 3, 5] }, today, 0.85),
    mkFriendHabit('fm-read', 'Read 20 pages', 'cobalt', { type: 'daily' }, today, 0.7),
  ] };
  const jess = { id: 'fj', name: 'jess', avatarColor: 'pop', habits: [
    mkFriendHabit('fj-med', 'Meditate', 'butter', { type: 'daily' }, today, 0.9),
  ] };
  const sam = { id: 'fs', name: 'sam', avatarColor: 'cobalt', habits: [
    mkFriendHabit('fs-water', 'Drink water', 'cobalt', { type: 'daily' }, today, 0.75),
    mkFriendHabit('fs-stretch', 'Stretch', 'cloud', { type: 'weekly_count', count: 3 }, today, 0.5),
  ] };
  return [maya, jess, sam];
}

// ---- read-only friend habit row (no check, no menu) ----
function FriendHabitRow({ habit, today }) {
  const { colorOf, dayKey, addDays, computeStreak } = window.HabitUtils;
  const swatch = colorOf(habit.color);
  const streak = computeStreak(habit, today, null);
  const todayKey = dayKey(today);
  const doneToday = !!habit.completions[todayKey];
  const dots = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const k = dayKey(d);
    dots.push({ k, filled: !!habit.completions[k], isToday: i === 0 });
  }
  return (
    <div className="friend-habit">
      <span className="swatch" style={{ background: swatch }} />
      <span className="friend-habit-name">{habit.name}</span>
      {doneToday && <span className="friend-today-dot" style={{ background: swatch }} title="done today" />}
      {streak > 0 && <span className="friend-streak">{streak}d</span>}
      <span className="streak-dots" aria-label="Last 7 days">
        {dots.map((dot) => (
          <span
            key={dot.k}
            className={`streak-dot ${dot.filled ? 'filled' : ''} ${dot.isToday ? 'today' : ''}`}
            style={dot.filled ? { background: swatch } : undefined}
            title={dot.k}
          />
        ))}
      </span>
    </div>
  );
}

// ---- one friend ----
function FriendCard({ friend, today, onRemove }) {
  const { colorOf } = window.HabitUtils;
  const initial = (friend.name || '?').trim().charAt(0).toUpperCase();
  const shared = friend.habits || [];
  return (
    <div className="friend-card">
      <div className="friend-card-head">
        <span className="avatar" style={{ background: colorOf(friend.avatarColor) }}>{initial}</span>
        <div className="friend-card-id">
          <div className="friend-card-name">{friend.name}</div>
          <div className="friend-card-meta">
            {shared.length === 0 ? 'nothing shared yet' : `${shared.length} shared habit${shared.length === 1 ? '' : 's'}`}
          </div>
        </div>
        <button className="icon-btn" aria-label={`Remove ${friend.name}`} onClick={() => onRemove(friend.id)}>
          <window.Icons.X size={15} />
        </button>
      </div>
      {shared.length > 0 && (
        <div className="friend-habits">
          {shared.map((h) => <FriendHabitRow key={h.id} habit={h} today={today} />)}
        </div>
      )}
    </div>
  );
}

// ---- add a (simulated) friend ----
function AddFriendModal({ onClose, onAdd }) {
  const { COLORS } = window.HabitUtils;
  const [name, setName] = useStateS('');
  const [avatarColor, setAvatarColor] = useStateS(COLORS[0].key);
  const inputRef = React.useRef(null);
  React.useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const submit = () => { if (!name.trim()) return; onAdd(name.trim(), avatarColor); };
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Add friend">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-eyebrow">New friend</div>
            <div className="modal-title">Who's keeping you honest?</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><window.Icons.X /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <input ref={inputRef} className="text-input" placeholder="e.g. maya" value={name} maxLength={24}
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          </div>
          <div className="field">
            <div className="field-label">Color</div>
            <div className="swatch-row" role="radiogroup" aria-label="Avatar color">
              {COLORS.map((c) => (
                <button key={c.key} role="radio" aria-checked={avatarColor === c.key} aria-label={c.key}
                  className="swatch-btn" style={{ '--swatch': c.value }} onClick={() => setAvatarColor(c.key)} />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <div className="modal-foot-end">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!name.trim()} onClick={submit}>Add friend</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- the Friends tab body ----
function FriendsScreen({ me, friends, today, onAddFriend, onRemoveFriend, onRenameMe }) {
  const { colorOf } = window.HabitUtils;
  const [adding, setAdding] = useStateS(false);
  const [editingName, setEditingName] = useStateS(false);
  const [nameDraft, setNameDraft] = useStateS(me.name);
  React.useEffect(() => { setNameDraft(me.name); }, [me.name]);
  const saveName = () => { onRenameMe(nameDraft); setEditingName(false); };
  return (
    <div className="friends-screen">
      <div className="friends-me">
        <span className="avatar" style={{ background: colorOf(me.avatarColor) }}>
          {(me.name || '?').trim().charAt(0).toUpperCase()}
        </span>
        {editingName ? (
          <input className="text-input friends-me-input" value={nameDraft} autoFocus maxLength={24}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
            onBlur={saveName} />
        ) : (
          <button className="friends-me-name" onClick={() => setEditingName(true)}>you · {me.name}</button>
        )}
      </div>

      {friends.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Better together.</div>
          <div className="empty-sub">Add a friend, share a habit or two, keep each other honest.</div>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>Add a friend</button>
        </div>
      ) : (
        <>
          {friends.map((f) => <FriendCard key={f.id} friend={f} today={today} onRemove={onRemoveFriend} />)}
          <div className="add-row">
            <button className="add-btn" onClick={() => setAdding(true)}>
              <window.Icons.Plus size={13} /> add friend
            </button>
          </div>
        </>
      )}

      {adding && <AddFriendModal onClose={() => setAdding(false)} onAdd={(name, color) => { onAddFriend(name, color); setAdding(false); }} />}
    </div>
  );
}

window.Social = { FriendsScreen, FriendCard, FriendHabitRow, AddFriendModal, seedMe, seedFriends, makeFriend };
```

- [ ] **Step 2: Wire `social.jsx` into `index.html` load order**

In `index.html`, between the `screens.jsx` and `app.jsx` script tags (currently lines 736–737), insert:

```html
<script type="text/babel" src="social.jsx"></script>
```

Resulting order: `tweaks-panel.jsx → icons.jsx → components.jsx → screens.jsx → social.jsx → app.jsx`.

- [ ] **Step 3: Transpile gate**

Run the Verification helper. Expected: `OK social.jsx` (and all others).

- [ ] **Step 4: Commit**

```bash
git add social.jsx index.html
git commit -m "feat: add social.jsx friends module"
```

---

## Task 3: Wire friends into `app.jsx`

**Files:**
- Modify: `app.jsx`

- [ ] **Step 1: Add `localStorage` keys**

In `app.jsx`'s `LS` object, after `SEEN_WB: 'tally-seen-welcome-back',` add:

```jsx
  ME:        'tally-me',
  FRIENDS:   'tally-friends',
```

- [ ] **Step 2: Add `me` and `friends` state**

In `App()`, after the `habits` state declaration, add:

```jsx
  const [me, setMe] = useState(() => lsGet(LS.ME, null) || window.Social.seedMe());
  const [friends, setFriends] = useState(() => {
    const stored = lsGet(LS.FRIENDS, null);
    return stored && Array.isArray(stored) && stored.length > 0 ? stored : window.Social.seedFriends(new Date());
  });
```

- [ ] **Step 3: Persist `me` and `friends`**

Next to the other persistence effects (`useEffect(() => { lsSet(LS.HABITS, habits); }, [habits]);`), add:

```jsx
  useEffect(() => { lsSet(LS.ME, me); }, [me]);
  useEffect(() => { lsSet(LS.FRIENDS, friends); }, [friends]);
```

- [ ] **Step 4: Add friend/profile callbacks**

Near `deleteHabit`, add:

```jsx
  const addFriend = useCallback((name, color) => {
    setFriends(prev => [...prev, window.Social.makeFriend(name, color, new Date())]);
    setTimeout(() => showToast(`Added · ${name}`), 100);
  }, [showToast]);
  const removeFriend = useCallback((id) => {
    setFriends(prev => prev.filter(f => f.id !== id));
  }, []);
  const renameMe = useCallback((name) => {
    setMe(prev => ({ ...prev, name: (name || '').trim() || prev.name }));
  }, []);
```

- [ ] **Step 5: Add the Friends tab button**

In `app.jsx`, after the Review tab button (line 284), add:

```jsx
            <button role="tab" aria-selected={tab === 'friends'} className="tab" onClick={() => setTab('friends')}>Friends</button>
```

- [ ] **Step 6: Render the Friends screen**

After the closing of the `{tab === 'review' && ( … )}` block and BEFORE the `{/* Modal */}` comment, add:

```jsx
      {tab === 'friends' && (
        <window.Social.FriendsScreen
          me={me}
          friends={friends}
          today={today}
          onAddFriend={addFriend}
          onRemoveFriend={removeFriend}
          onRenameMe={renameMe}
        />
      )}
```

- [ ] **Step 7: Transpile gate**

Run the Verification helper. Expected: `OK app.jsx`.

- [ ] **Step 8: Commit**

```bash
git add app.jsx
git commit -m "feat: wire friends tab, state, and persistence into app"
```

---

## Task 4: Friends CSS

**Files:**
- Modify: `index.html` (`<style>` block)

- [ ] **Step 1: Add friends styles**

In `index.html`'s `<style>` block (near the other component styles), add:

```css
  /* ---- Friends ---- */
  .friends-screen { display: flex; flex-direction: column; gap: 10px; }
  .friends-me { display: flex; align-items: center; gap: 10px; padding: 4px 2px 10px; }
  .friends-me-name { font-family: var(--mono); font-size: 12px; color: var(--ink-50); padding: 4px 0; }
  .friends-me-name:hover { color: var(--ink); }
  .friends-me-input { max-width: 200px; padding: 6px 10px; }
  .avatar { width: 30px; height: 30px; border-radius: 999px; flex: none; display: grid; place-items: center;
            color: #fff; font-weight: 600; font-size: 14px; }
  .friend-card { background: var(--card); border: 1px solid var(--smoke); border-radius: 14px; padding: 12px 13px; }
  .friend-card-head { display: flex; align-items: center; gap: 10px; }
  .friend-card-id { flex: 1; min-width: 0; }
  .friend-card-name { font-size: 14px; font-weight: 700; color: var(--ink); }
  .friend-card-meta { font-size: 11px; color: var(--ink-30); font-family: var(--mono); margin-top: 1px; }
  .friend-habits { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; }
  .friend-habit { display: flex; align-items: center; gap: 8px; padding: 6px 4px; }
  .friend-habit .swatch { width: 8px; height: 8px; border-radius: 999px; flex: none; }
  .friend-habit-name { font-size: 13px; color: var(--ink); flex: 1; min-width: 0; }
  .friend-streak { font-size: 11px; color: var(--ink-50); font-family: var(--mono); }
  .friend-today-dot { width: 7px; height: 7px; border-radius: 999px; flex: none; }
```

- [ ] **Step 2: Transpile gate + commit**

Run the Verification helper (CSS isn't transpiled, but confirm nothing else broke), then:

```bash
git add index.html
git commit -m "style: friends screen styling"
```

---

## Task 5: Live browser verification (the real gate)

**Files:** none (verification only).

- [ ] **Step 1: Serve the app**

```bash
cd /Users/mohammed.umair/my-projects/tally && python3 -m http.server 8765 >/tmp/tally.log 2>&1 &
sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8765/index.html
```
Expected: `200`.

- [ ] **Step 2: Drive it with chrome-devtools** (kill the locked devtools profile first if needed: `pkill -f "chrome-devtools-mcp/chrome-profile"`). Confirm each:
  1. No console errors on load.
  2. A **Friends** tab appears; clicking it shows seeded friends (maya, jess, sam) with read-only habit rows showing streak numbers and 7-day dots.
  3. The **"you · {name}"** line is editable — rename, reload, name persists.
  4. **Add friend** → enter a name + color → friend appears with seeded progress; reload persists; remove (X) works.
  5. Open a habit's editor → **Sharing** toggle → set "Shared with friends" → Save → a **`shared`** pill appears on that habit's row in Today; reload persists. Seeded `read`/`run` habits already show the pill.
  6. Today / Review and the existing edit/delete/deadline features are unchanged.

- [ ] **Step 3: Stop the server**

```bash
pkill -f "http.server 8765"
```

- [ ] **Step 4: Final commit (if any verification fixes were needed)**

```bash
git add -p   # stage only the fix hunks
git commit -m "fix: address friends verification findings"
```

---

## Self-Review

**1. Spec coverage:**
- New module `social.jsx` / `window.Social` → Task 2. ✓
- `tally-me`, `tally-friends`, seeded friends → Tasks 2 (seed) + 3 (state/persist). ✓
- Habit `shared` field + editor toggle + pill + seed-as-shared → Task 1. ✓
- Friends tab, read-only rows, add-friend, empty state, rename-me → Tasks 2 + 3. ✓
- Friend-with-nothing-shared copy ("nothing shared yet") → `FriendCard`, Task 2. ✓
- Edge: corrupt storage falls back to seed (uses existing `lsGet` try/catch + array guard) → Task 3 Step 2. ✓
- Prove-it browser checks → Task 5. ✓
- Out-of-scope items (real sync, nudges, co-owned, per-friend audiences) → not implemented, by design. ✓

**2. Placeholder scan:** No TBD/TODO; every code step contains complete code. ✓

**3. Type/name consistency:** `window.Social` exports (`FriendsScreen`, `FriendCard`, `FriendHabitRow`, `AddFriendModal`, `seedMe`, `seedFriends`, `makeFriend`) are referenced consistently in app.jsx (`seedMe`, `seedFriends`, `makeFriend`, `FriendsScreen`). Friend habit shape matches owner habit shape (`{id,name,color,schedule,timeOfDay,completions,createdAt}`) so `computeStreak`/`isScheduled` apply. `shared` field name consistent across HabitModal payload, HabitRow pill, and seed. ✓

**Note on `useStateS`:** `social.jsx` aliases `const { useState: useStateS } = React;` to avoid any top-level `useState` collision across in-browser-transpiled script scopes (app.jsx also destructures `useState`). Components reference `React.useEffect`/`React.useRef` directly.
