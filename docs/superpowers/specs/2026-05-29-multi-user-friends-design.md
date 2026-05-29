# tally · multi-user & friends (simulated) — design

**Date:** 2026-05-29
**Status:** approved, ready for implementation plan
**Codename:** *Inkwell* (existing palette)

## Goal

Let a person see their friends' habit progress to stay accountable, while keeping
private habits private. One-line: *"see each other's progress — friends can view the
habits you choose to share, the rest stay yours."*

This pass builds the **full friends + sharing experience locally simulated** (no backend,
no accounts, no network). It is deliberately designed so a real cross-device sync layer can
be added later by swapping only the data source — the UI and data shapes do not change.

## Decisions (locked during brainstorming)

1. **Core experience:** "see each other's progress." Each person tracks their own habits;
   friends can view the streak/checks of the habits you share. Not a feed, not co-owned
   habits, not nudges.
2. **Architecture:** simulate locally first. Stays zero-build, `localStorage`-only, "open
   `index.html` and it runs." Real sync is a future, separate pass.
3. **Share scope:** one toggle per habit — private (default) or shared-with-all-my-friends.
   No per-friend audiences in this pass.
4. **Surface:** a dedicated **Friends** tab (next to Today / Review). Friend habits render
   read-only, reusing the existing habit-row look (streak + 7-day dots).

## Non-goals (explicitly out of scope this pass)

- Real cross-device sync, accounts, auth, or any network/backend.
- Nudges, reactions, comments, or any social feed.
- Co-owned / joint habits both people check off.
- Per-friend sharing audiences (share-with-specific-friends).

These are "layer later" items; the data model below is shaped to accommodate them.

## Architecture & file layout

Unchanged constraints: plain JSX, no TypeScript, no bundler; modules attach to `window.*`
globals and are wired into `index.html` in dependency order; all CSS lives in `index.html`'s
`<style>` block using the Inkwell palette variables; warm/lowercase/playful copy voice.

**New module: `social.jsx`** — exposes `window.Social`. Holds the friends UI and social
helpers, keeping the already-large `components.jsx` (~740 lines) from growing further.

Load order in `index.html` (insert `social.jsx` after `screens.jsx`, before `app.jsx`):

```
tweaks-panel.jsx → icons.jsx → components.jsx → screens.jsx → social.jsx → app.jsx
```

`window.Social` exports (names indicative):
- `FriendsScreen` — the Friends tab body.
- `FriendCard` — one friend: avatar + name + their shared-habit rows.
- `FriendHabitRow` — read-only habit row (swatch, name, streak, 7-day dots; no check, no menu).
- `AddFriendModal` — add a (simulated) friend.
- `ProfileEditor` — rename "me" (lightweight; may be inline rather than a modal).
- helpers: `seedMe()`, `seedFriends(today)`, plus any friend-list mutation helpers.

Reused from `window.HabitUtils`: `computeStreak`, `isScheduled`, `addDays`, `dayKey`,
`colorOf`, and the 7-day-dot derivation — friend habits use the identical habit shape, so
these work unchanged.

## Data model

### New `localStorage` keys (existing `tally-` prefix)

- **`tally-me`** — current user profile:
  ```
  { id: 'me', name: string, avatarColor: <COLORS key> }
  ```
  Seeded as `{ id:'me', name:'you', avatarColor:'pop' }` if absent. Name is editable.

- **`tally-friends`** — array of friends:
  ```
  { id, name, avatarColor: <COLORS key>, habits: Habit[] }
  ```
  Each `habits[]` entry uses the **same Habit shape** as the owner's habits
  (`{ id, name, color, schedule, timeOfDay, completions, createdAt }`; `reminderTime`
  irrelevant for friends). In simulation, a friend's `habits` array *is* what they've shared.
  Seeded with 2–3 friends, each with 1–2 shared habits carrying ~70 days of plausible
  completions (mirrors the existing `seedHabits` approach), so the tab is populated on first run.

### Changed: Habit shape

Add one optional field:
- **`shared: boolean`** — default `false`/absent. `true` = visible to all friends.

Preserved through edits via the existing `{ ...h, ...data }` merge in `editHabit`.
On first run, seed a couple of the existing demo habits with `shared: true` so the
`shared` pill is visible immediately.

## Flows

### Sharing a habit (your side)
1. Open the habit editor (`HabitModal`, already built for add/edit).
2. A **"Share with friends"** toggle sets `habit.shared`.
3. Shared habits render a subtle **`shared`** meta-pill on their row in Today; private habits
   render nothing. (Simulation: toggling does not transmit anywhere — it only sets the flag and
   the pill. The flag is what a future sync layer would act on.)

### Viewing friends
1. **Friends** tab (third tab). Header shows **"you · {name}"** — tap to rename.
2. Body lists `tally-friends` as `FriendCard`s: avatar (initial on `avatarColor`), name, a short
   meta line, then each shared habit as a read-only `FriendHabitRow` (swatch, name,
   `computeStreak` value, 7-day dots).
3. **Add friend** button → `AddFriendModal` (name + avatar color). In simulation it creates a
   mock friend seeded with a couple of demo habits, appended to `tally-friends`.
4. Empty state (no friends): warm copy + add button.

## State & wiring (app.jsx)

- New state: `me` (from `tally-me`), `friends` (from `tally-friends`), persisted via the
  existing `lsSet` effects pattern.
- `tab` gains a `'friends'` value; render `Social.FriendsScreen` when active.
- Callbacks: `addFriend(data)`, `removeFriend(id)`, `renameMe(name)`.
- The share toggle flows through the existing `addHabit`/`editHabit` payload (`shared` field).

## Edge cases & error handling

- Friend with no shared habits → "nothing shared yet."
- Removing a friend; renaming yourself to empty → keep previous name.
- `shared` toggle is orthogonal to schedule type / deadline (weekly, specific-days, ended
  habits can all be shared); an ended shared habit shows its finished state read-only to friends.
- Corrupt/missing `tally-me` or `tally-friends` → fall back to seed (same try/catch `lsGet` pattern).

## Proving it works (web/UI — never skip)

Browser-drive (localhost static server + chrome-devtools), confirming:
1. No console errors; all files transpile.
2. Friends tab appears and lists seeded friends with correct streaks/dots.
3. Toggling a habit "shared" in the editor → `shared` pill appears on its row; persists on reload.
4. Add a friend → appears with seeded progress; remove works.
5. Rename "you" persists.
6. Existing Today/Review behavior and the edit/delete/deadline features are unaffected.

## Forward-compatibility note

The pieces map cleanly onto a future real backend: `tally-me` → an account; `tally-friends`
→ other accounts' shared subsets; `habit.shared` → the visibility flag the sync layer reads.
When sync lands, only the data source changes (seeded localStorage → fetched data); the
Friends tab, share toggle, and read-only rows stay as designed.
