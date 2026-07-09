# tally · real friends (multi-user, backend) — design

**Date:** 2026-07-09
**Status:** approved, ready for implementation plan
**Codename:** *Inkwell* (existing palette)
**Supersedes (for the sync path):** the simulation in `2026-05-29-multi-user-friends-design.md`. The
Friends-tab UI from that pass is reused unchanged; only the data source and sharing model change.

## Goal

Turn the locally-simulated friends feature into a genuine multi-user one: connect with a real
person via an invite code, then see each other's **shared** habit progress (streak + 7-day dots),
read-only. Each user controls, per habit, exactly which friends can see it. Private habits never
leave the owner's account.

One-line: *"share your code, become friends instantly, and choose per habit who gets to watch you
show up."*

## Decisions (locked during brainstorming)

1. **Connect flow:** invite code, **instant**. Entering someone's code makes you friends
   immediately — no accept/decline step. You only ever connect if someone deliberately shares
   their code, so a request step adds friction without real safety.
2. **Sharing granularity:** per-habit, per-friend allow-list. Each habit has a `share_mode`:
   `private` (nobody), `all` (every accepted friend), or `selected` (only friends on an
   allow-list). Flipping sharing on defaults to `all`.
3. **Migration tooling:** introduce the Supabase CLI + versioned `supabase/migrations/` in the
   repo (schema currently lives only in the dashboard — this closes that gap). Changes applied via
   `supabase db push`, credentials in the macOS keychain.
4. **Isolation:** implemented in a git worktree; it modifies live production RLS on `habits` and
   `habit_completions`, so it must not be done casually in the main checkout.

## Non-goals (explicitly out of scope this pass)

- Accept/decline friend requests (connection is instant via code).
- Username/handle search or a public directory.
- Nudges, reactions, comments, activity feed.
- Co-owned / joint habits.

## Deferred (accepted, non-blocking)

- **Live realtime for friends' updates.** v1 refreshes the friends list on Friends-tab open and
  after adding a friend; it does not stream a friend's check-ins in real time. Consistent with the
  already-accepted "unfiltered completions subscription" tradeoff. Realtime-per-friend can layer on
  later without a data-model change (Supabase `postgres_changes` respects RLS).

## Architecture & constraints

Unchanged app constraints: plain JSX, no TypeScript, no bundler; modules attach to `window.*`
globals wired into `index.html` in dependency order; all CSS in `index.html`'s `<style>` block
using the Inkwell palette; warm/lowercase/playful copy voice.

New backend tooling: a `supabase/` directory (`config.toml` + `migrations/*.sql`) checked into
git. This is the first time schema is version-controlled; the initial migration also captures the
**existing** schema (profiles/habits/habit_completions + current RLS + `checkins_today`) so the
repo is a faithful, reproducible source of truth — followed by the friends migration.

## Data model

### New column

- **`profiles.invite_code text unique`** — a short, shareable code (8 chars, base32-ish,
  ambiguity-free alphabet). Auto-generated when a profile is first created. This is what a friend
  types to connect.

### Changed column

- **`habits.share_mode text`** — check constraint `in ('private','all','selected')`, default
  `'private'`. **Replaces** the existing `habits.shared boolean`. Migration maps
  `shared = true → 'all'`, `shared = false/null → 'private'`, then drops `shared`.

### New tables

- **`friendships`** — one row per mutual friendship, stored as a canonical unordered pair:
  ```
  friendships(
    user_a      uuid not null references profiles(id) on delete cascade,
    user_b      uuid not null references profiles(id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (user_a, user_b),
    check (user_a < user_b)          -- canonical ordering: exactly one row per pair
  )
  ```
  The `user_a < user_b` check + PK guarantees no duplicate A–B / B–A rows. Callers never insert
  directly (see the RPC); the ordering is computed server-side.

- **`habit_shares`** — the per-friend allow-list, used only when `share_mode = 'selected'`:
  ```
  habit_shares(
    habit_id   uuid not null references habits(id) on delete cascade,
    friend_id  uuid not null references profiles(id) on delete cascade,
    primary key (habit_id, friend_id)
  )
  ```

### Client-side shapes (unchanged)

Friends and their habits are assembled into the **exact shape the existing Friends UI renders**:
```
friend  = { id, name, avatarColor, habits: Habit[] }
Habit   = { id, name, color, schedule, timeOfDay, completions, createdAt }  // reminderTime N/A
```
So `HabitUtils.computeStreak` / `isScheduled` and the 7-day-dot logic work unchanged, and
`FriendCard` / `FriendHabitRow` need no edits.

## RLS design (the crux)

A `SECURITY DEFINER` helper avoids recursive policy references:
```
are_friends(a uuid, b uuid) returns boolean   -- true iff a canonical friendships row exists for the pair
```

Policies (in addition to the existing owner-only rules, which stay):

- **profiles** SELECT: own row `OR are_friends(id, auth.uid())` — friends can read name + avatar
  only.
- **habits** SELECT: owner
  `OR (share_mode = 'all' AND are_friends(user_id, auth.uid()))`
  `OR (share_mode = 'selected' AND are_friends(user_id, auth.uid()) AND EXISTS (select 1 from habit_shares hs where hs.habit_id = habits.id AND hs.friend_id = auth.uid()))`.
  INSERT/UPDATE/DELETE remain owner-only.
- **habit_completions** SELECT: visible iff the parent habit is visible to the caller — an EXISTS
  against `habits` reusing the same rule. Write remains owner-only.
- **friendships** SELECT/DELETE: `auth.uid() in (user_a, user_b)`. No direct INSERT policy — all
  inserts go through the RPC.
- **habit_shares** ALL: owner-only (`auth.uid()` must own the referenced habit).

## RPCs (SECURITY DEFINER — mirrors the existing `checkins_today` pattern)

- **`add_friend_by_code(code text)`** — resolve `code` → target profile; validate (not self, not
  already friends, code exists); insert the canonical `friendships` row; return the friend's
  `{ id, name, avatar_color }`. Distinct, friendly errors for `not_found`, `self`, `already_friends`.
  This is the only privileged write path; it exists so a friend can be found by code without
  exposing the whole `profiles` table to search.

Everything else is plain RLS-filtered SELECTs — no mega-RPC needed:
`loadFriends()` runs (1) friendships for me → friend ids, (2) profiles for those ids, (3) habits
for those ids (RLS auto-filters to only visible habits), (4) habit_completions for those habit ids.

## Client changes

### `sync.jsx` (`window.Sync`)
- `rowToHabit` / `habitToRow`: `shared` → `share_mode`.
- `myInviteCode()` — read caller's `invite_code` from their profile (created on first profile
  upsert if missing).
- `addFriendByCode(code)` → `rpc('add_friend_by_code', { code })`; returns friend or throws a
  typed error.
- `loadFriends()` → assembles the `friend[]` shape above via the four RLS-filtered selects.
- `removeFriend(friendId)` → delete the canonical friendships row.
- `loadHabitShares(habitId)` / `setHabitShares(habitId, friendIds)` — manage the allow-list for a
  `selected` habit.

### `social.jsx` (`window.Social`)
- `FriendCard`, `FriendHabitRow` — **unchanged**.
- Friends-tab header gains a compact **"your code: XXXXXXXX"** (copyable) + an **enter-a-code**
  input to add a friend. The old name+color `AddFriendModal` is replaced by this code entry.
- `seedFriends` / `makeFriend` remain **only** for the no-backend guest/local-dev path
  (`!Sync.enabled()`); when signed in, data comes from `Sync.loadFriends()`.

### `components.jsx` (`HabitModal`, `HabitRow`)
- Sharing field: two-way Private/Shared radio → three-way **Private / All friends / Selected**.
- When **Selected**, render a friend checklist (friends list passed in as a prop from `app.jsx`).
- `HabitRow` pill: show `shared` when `share_mode !== 'private'` (unchanged look).

### `app.jsx`
- When signed in: load friends from `Sync.loadFriends()`; refresh on Friends-tab open and after
  `addFriendByCode`. Guest/no-backend path keeps seeded friends.
- Wire `addFriendByCode`, `removeFriend`; pass the friends list into `HabitModal` for the
  `selected` picker; persist share-mode + allow-list through the existing add/edit habit payload.

## Flows

### Adding a friend
1. Friends tab shows **your code** (copy button) and an **enter-a-code** field.
2. Enter a friend's code → `addFriendByCode` → on success the friend appears in the list with their
   currently-visible shared habits; friendly inline error otherwise (unknown code / already friends
   / that's you).

### Sharing a habit
1. Open the habit editor → Sharing = Private / All friends / Selected.
2. `All friends` → every friend sees it. `Selected` → tick specific friends (allow-list).
3. Row shows the `shared` pill whenever not private. Changes persist to Supabase via the existing
   add/edit path + `setHabitShares`.

### Viewing friends
Unchanged from the simulation: `FriendCard` per friend (avatar + name + meta), each visible shared
habit as a read-only `FriendHabitRow` (swatch, name, streak, 7-day dots). "nothing shared yet" when
a friend shares nothing with you.

## Edge cases & error handling

- Unknown / malformed code, own code, already-friends → typed errors surfaced as warm inline copy.
- Removing a friend: deletes the friendship; their rows immediately fail the RLS friend check, so
  their habits/completions vanish on next load. Any `habit_shares` rows naming them are harmless
  (ignored once the friendship is gone; cleaned opportunistically).
- Friend shares nothing with you → "nothing shared yet."
- A `selected` habit with an empty allow-list behaves like private (no friend matches).
- Guest / no-backend (`!Sync.enabled()`) → seeded simulation, exactly as today.
- Corrupt/missing local state → existing `lsGet` try/catch + seed fallback (guest path only).

## Proving it works (web/UI + DB — never skip)

DB (via CLI / SQL): after `supabase db push`, confirm as an **anon** and as **user A**:
1. RLS blocks anon reads of friendships/habit_shares.
2. User B, **not** a friend of A, cannot read A's habits (even `share_mode='all'`).
3. After `add_friend_by_code`, B can read A's `all` habits + their completions, but **not** A's
   `private` habits, and **not** A's `selected` habits unless B is on the allow-list.
4. `add_friend_by_code` rejects self / duplicate / unknown code.

Browser-drive (two accounts, localhost or live):
5. No console errors; all files transpile.
6. Account A: code visible + copyable; A shares habit X as `all`, habit Y as `selected`→B, keeps Z
   `private`.
7. Account B: enters A's code → A appears; B sees X and Y with correct streaks/dots, never Z.
8. A removes B (or B removes A) → the other's shared habits disappear on reload.
9. Existing Today / Review / edit / delete / deadline / auth flows unaffected; guest mode still
   seeds and runs offline.

## Forward-compatibility

`friendships` + `habit_shares` + `share_mode` are the durable primitives. Realtime-per-friend,
an optional accept step, or reactions can all layer on later without reshaping this model.
