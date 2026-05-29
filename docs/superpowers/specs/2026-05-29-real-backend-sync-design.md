# tally · real backend + cross-device sync — design

**Date:** 2026-05-29
**Status:** approved, ready for implementation plan (Phase 1)
**Builds on:** the simulated friends feature (`2026-05-29-multi-user-friends-design.md`), whose
data model (`tally-me`, `tally-friends`, per-habit `shared` flag) was shaped to swap onto a backend.

## Goal

Give tally a real backend so habits sync across a person's devices and friends are actual other
people, while **keeping the app fully usable with no account** (local-first). Signing in is an
opt-in upgrade that turns on cross-device sync and (in Phase 2) real friends.

## Decisions (locked during brainstorming)

1. **Audience:** a real product with open signups — proper auth, RLS, room to grow. But MVP stays
   lean (no paid tiers / heavy abuse-hardening yet).
2. **Build setup:** keep **zero-build**. Supabase client via CDN UMD bundle; public anon key in
   source (RLS is the real protection). No bundler.
3. **Platform:** **Supabase** (Postgres + Auth + Realtime + Row-Level Security).
4. **Auth methods:** **Google OAuth** + **phone/SMS OTP**. (SMS needs a paid provider e.g. Twilio
   + rate-limiting — a setup/cost item, not free.)
5. **Sync/privacy:** **everything syncs**, RLS-protected. Friends can read only `shared` rows;
   private habits are the owner's alone (encrypted at rest by Supabase).
6. **Friends:** **invite link / code**, mutual (both consent). Username search deferred.
7. **Auth gating:** **local-first, optional sign-in.** The app works as a guest on local data;
   signing in migrates local data up and enables sync. **Both modes are first-class and stay so.**

## Phasing (each independently shippable)

- **Phase 1 (this spec):** accounts + sync of *your own* habits across *your* devices. Auth,
  schema + RLS for own data, sign-in UI, local↔cloud sync engine, migration, deploy. Friends
  remain simulated/unchanged.
- **Phase 2 (separate spec):** real friends — invite links, mutual friendships, friend-read RLS,
  Friends tab reads real shared progress live; retire mock friends.
- **Deferred (YAGNI):** syncing pause/MVD state, nudges/reactions, username search, custom SMTP,
  captcha/abuse hardening.

## Modes (both supported, always)

- **Guest (local-only):** no account. Behaves exactly as tally does today — `localStorage` is the
  source of truth, no network. This path must never be blocked by a sign-in wall.
- **Synced (signed in):** Supabase is the source of truth; `localStorage` is an offline cache.
  Sign-out returns to guest mode keeping the local cache.

---

## Phase 1 design

### 1. Client setup (zero-build)

`index.html` gains, before the Babel scripts:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="config.js"></script>
```
`config.js` (committed; values are public):
```js
window.SUPABASE_URL = 'https://<project>.supabase.co';
window.SUPABASE_ANON_KEY = '<anon-public-key>';
window.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
```
The anon key is designed to be public; RLS is what protects data.

### 2. Database schema

```sql
-- profiles: one per auth user
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default 'you',
  avatar_color text not null default 'pop',
  created_at timestamptz not null default now()
);

-- habits: mirrors the client habit shape
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
  deleted_at timestamptz            -- soft delete so deletions propagate across devices
);
create index habits_user_idx on habits (user_id) where deleted_at is null;

-- completions: one row per habit per done-day (checkmark = insert, uncheck = delete)
create table habit_completions (
  habit_id uuid not null references habits on delete cascade,
  day date not null,
  primary key (habit_id, day)
);
```
Realtime: add `habits` and `habit_completions` to the `supabase_realtime` publication.

### 3. Row-Level Security (Phase 1 — own data only)

```sql
alter table profiles enable row level security;
alter table habits enable row level security;
alter table habit_completions enable row level security;

-- profiles
create policy "own profile read"   on profiles for select using (id = auth.uid());
create policy "own profile write"  on profiles for insert with check (id = auth.uid());
create policy "own profile update" on profiles for update using (id = auth.uid());

-- habits
create policy "own habits"         on habits for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- completions (gated through habit ownership)
create policy "own completions"    on habit_completions for all
  using (exists (select 1 from habits h where h.id = habit_id and h.user_id = auth.uid()))
  with check (exists (select 1 from habits h where h.id = habit_id and h.user_id = auth.uid()));
```
Phase 2 adds friend-read `select` policies; Phase 1 ships with strict own-data isolation.

### 4. Auth

- **Google OAuth:** `sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })`.
- **Phone OTP:** `sb.auth.signInWithOtp({ phone })` → user enters code → `sb.auth.verifyOtp({ phone, token, type: 'sms' })`.
- **Session:** `sb.auth.getSession()` on load; subscribe with `sb.auth.onAuthStateChange`. Supabase
  persists/refreshes the session token itself.
- **UI:** a sign-in modal reached from a "Sign in to sync" affordance (e.g. in the topbar and on
  the Friends tab). Guests are never forced through it. After sign-in, a profile row is upserted.

### 5. Sync engine (`window.Sync`)

Local-first reconciliation:
- **Signed out:** no-op — `app.jsx` uses `localStorage` exactly as today.
- **On sign-in / load:** hydrate UI from `localStorage` cache immediately, then `select` fresh
  rows from Supabase and replace state; mirror back to cache.
- **Writes:** apply optimistically to local state + cache, then `upsert` to Supabase
  (habits set `updated_at = now()`; completions insert/delete rows; deletes set `deleted_at`).
- **Realtime:** subscribe to `habits` + `habit_completions` filtered to `user_id = me`; apply
  remote changes to keep a user's other devices live.
- **Conflicts:** habits = last-write-wins by `updated_at`; completions = set union (insert/delete
  are commutative). Offline edits replay on reconnect.

### 6. Migration (first sign-in)

On the first sign-in for a session:
- If the account has **no** habits → upload the guest's local habits + completions (local string
  id → new uuid; build `habit_completions` rows from each `completions` map). Toast: "synced your
  habits to your account".
- If the account **already has** habits (signing in on a second device / returning user) → account
  wins; local cache is replaced. No destructive merge of divergent local edits in Phase 1 (account
  is authoritative); a toast explains it.

### 7. Code structure

- **Create `config.js`** — Supabase URL/key + client (`window.sb`).
- **Create `sync.jsx`** — `window.Sync`: `getSession`, `onChange`, `loadHabits`, `saveHabit`,
  `toggleCompletion`, `deleteHabit`, `migrateLocal`, realtime wiring. Pure data layer, no UI.
- **Auth UI** — a `SignInModal` (added to `social.jsx`, or a small `auth.jsx` if it grows) +
  a "Sign in to sync" / account affordance in the topbar.
- **`app.jsx`** — when signed in, source habits/profile through `Sync`; when guest, use
  `localStorage` as today. The existing `LS`/`lsGet`/`lsSet` cache layer is reused.
- Load order: `… → social.jsx → sync.jsx → app.jsx` (after the CDN supabase + config scripts).

### 8. Deploy & external setup

- **Hosting:** GitHub Pages (static). The app already runs from static files.
- **Supabase project:** run the schema + RLS SQL; enable realtime on the two tables; add redirect
  URLs (`http://localhost:8000` + the Pages URL); configure the **Google OAuth** credential; wire
  an **SMS provider (Twilio)** for phone OTP and set sensible OTP rate limits.
- These are one-time manual setup steps documented in the plan; the app reads only the public
  URL + anon key from `config.js`.

### 9. Edge cases & proving it

- Offline while signed in → writes queue in cache, replay on reconnect.
- Token expiry → Supabase auto-refresh; on hard failure, prompt re-sign-in without losing local cache.
- Sign-out → drop session, keep local cache (return to guest mode).
- **Proven by** (browser-driven): (a) two browser profiles signed into the same account — a
  checkmark in one appears in the other live; (b) a fresh profile signs in and pulls existing
  habits; (c) a guest with local habits signs in and migration uploads them; (d) guest mode still
  works with the network blocked / signed out; (e) RLS verified — a second account cannot read the
  first's rows.

### Forward to Phase 2

Add `friendships` + `invites` tables, friend-read RLS `select` policies on `habits`/
`habit_completions` (where `shared` and a friendship exists), invite-link redeem flow, and point
the Friends tab at real data. No Phase 1 interface changes required — `Sync` gains friend reads.
