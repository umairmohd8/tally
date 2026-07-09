# Real (Multi-User) Friends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tally's simulated friends with a genuine multi-user feature — connect via an instant invite code and see each other's shared habit progress, with per-habit / per-friend visibility control, enforced by Supabase RLS.

**Architecture:** New versioned `supabase/migrations/` (Supabase CLI) adds a `friendships` table, a `habit_shares` allow-list, `profiles.invite_code`, and a `habits.share_mode` column replacing the old `shared` boolean. RLS lets friends read only the habits/completions a user shares with them; a single `SECURITY DEFINER` RPC (`add_friend_by_code`) is the only privileged write. The client (`sync.jsx`, `social.jsx`, `components.jsx`, `app.jsx`) swaps seeded friend data for RLS-filtered reads; the read-only Friends-tab UI is reused unchanged.

**Tech Stack:** Plain JSX transpiled in-browser by `@babel/standalone`, React 18 via CDN, Supabase (Postgres + Auth + Realtime + RLS), Supabase CLI for migrations. **No unit-test framework** — it would violate the zero-build constraint. **Verification = `esbuild` transpile (syntax gate) + SQL/DB checks + chrome-devtools two-account browser-driving (behavioral gate).**

**Reference spec:** `docs/superpowers/specs/2026-07-09-real-friends-design.md`

**Supabase project ref:** `rnrygrfuhsnlnmqbynui`

---

## File structure

| File | Change | Responsibility |
|------|--------|----------------|
| `supabase/` | **create** | CLI project (`config.toml`, `migrations/`), baseline + friends migrations |
| `sync.jsx` | modify | `share_mode` mapping; `myInviteCode`, `addFriendByCode`, `loadFriends`, `removeFriend`, `loadHabitShares`, `setHabitShares` |
| `components.jsx` | modify | `HabitModal` three-way sharing + friend picker; `HabitRow` pill uses `shareMode` |
| `social.jsx` | modify | code panel + enter-code add flow (signed-in); keep name+color seed path (guest) |
| `app.jsx` | modify | load friends + invite code on sign-in; wire `addFriendByCode`/`removeFriend`; persist share-mode + allow-list; pass `friends`/`getShares` to `HabitModal` |
| `index.html` | modify | CSS for invite-code panel, code input, friend picker |

---

### Verification helper (transpile gate — run after editing any `.jsx`)

```bash
cd /Users/mohammed.umair/my-projects/tally
for f in tweaks-panel.jsx icons.jsx components.jsx screens.jsx social.jsx sync.jsx auth.jsx landing.jsx app.jsx; do
  [ -f "$f" ] && (npx --yes esbuild "$f" "--loader:.jsx=jsx" --outfile=/dev/null 2>/tmp/esb.txt \
    && echo "OK   $f" || { echo "FAIL $f"; cat /tmp/esb.txt; })
done
```
Expected: `OK` for every file.

---

## Task 0: Supabase CLI + baseline migration

**Files:** Create `supabase/` (via CLI).

> Do this task inside the isolated worktree. It requires two secrets — a Supabase **access token** and the project **DB password** — which the user must supply. Store both in the macOS keychain; never print them.

- [ ] **Step 1: Install the Supabase CLI**

```bash
brew install supabase/tap/supabase
supabase --version   # expect e.g. 1.x / 2.x
```

- [ ] **Step 2: Obtain and store credentials (user-provided)**

Ask the user to run, in a separate terminal, `secret supabase-access-token` and `secret supabase-db-password` (or paste values). For each, read `/tmp/.secret-pass`, store, and delete:

```bash
security add-generic-password -a "mohammed.umair" -s "supabase-access-token" -w "<value>" -U
security add-generic-password -a "mohammed.umair" -s "supabase-db-password" -w "<value>" -U
rm -f /tmp/.secret-pass
```

The access token comes from https://supabase.com/dashboard/account/tokens ; the DB password is the project's Postgres password (Dashboard → Project Settings → Database).

- [ ] **Step 3: Init the CLI project**

```bash
cd /Users/mohammed.umair/my-projects/tally
supabase init      # creates supabase/config.toml and supabase/migrations/ ; updates .gitignore
```
Expected: `Finished supabase init`. Confirm `supabase/.gitignore` ignores `.branches`, `.temp`.

- [ ] **Step 4: Link the project**

```bash
export SUPABASE_ACCESS_TOKEN=$(security find-generic-password -a "mohammed.umair" -s "supabase-access-token" -w)
supabase link --project-ref rnrygrfuhsnlnmqbynui \
  -p "$(security find-generic-password -a "mohammed.umair" -s "supabase-db-password" -w)"
```
Expected: `Finished supabase link`.

- [ ] **Step 5: Pull the existing schema as the baseline migration**

```bash
supabase db pull
```
Expected: a new file `supabase/migrations/<timestamp>_remote_schema.sql` capturing the current `profiles`, `habits`, `habit_completions`, their RLS, and `checkins_today`. This is the reproducible source-of-truth baseline. Skim it to confirm those objects are present.

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "chore: add supabase CLI project + baseline schema migration"
```

---

## Task 1: Friends schema migration

**Files:** Create `supabase/migrations/<timestamp>_real_friends_schema.sql`.

- [ ] **Step 1: Create the migration file**

```bash
cd /Users/mohammed.umair/my-projects/tally
supabase migration new real_friends_schema
```

- [ ] **Step 2: Write the schema SQL**

Put EXACTLY this in the new `..._real_friends_schema.sql`:

```sql
-- invite code generator: 8 chars from an ambiguity-free alphabet
create or replace function public.gen_invite_code() returns text
language sql volatile as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (floor(random()*31)::int)+1, 1), ''
  ) from generate_series(1, 8);
$$;

-- profiles.invite_code (backfill existing rows, then default + not null)
alter table public.profiles add column if not exists invite_code text unique;
update public.profiles set invite_code = public.gen_invite_code() where invite_code is null;
alter table public.profiles alter column invite_code set default public.gen_invite_code();
alter table public.profiles alter column invite_code set not null;

-- friendships: one canonical row per mutual pair (user_a < user_b)
create table if not exists public.friendships (
  user_a     uuid not null references public.profiles(id) on delete cascade,
  user_b     uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
alter table public.friendships enable row level security;

-- habit_shares: per-friend allow-list, used only when share_mode='selected'
create table if not exists public.habit_shares (
  habit_id  uuid not null references public.habits(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  primary key (habit_id, friend_id)
);
alter table public.habit_shares enable row level security;

-- habits.share_mode replaces the shared boolean
alter table public.habits add column if not exists share_mode text not null default 'private'
  check (share_mode in ('private','all','selected'));
update public.habits set share_mode = case when shared then 'all' else 'private' end
  where share_mode = 'private';
alter table public.habits drop column if exists shared;
```

- [ ] **Step 3: Apply**

```bash
export SUPABASE_ACCESS_TOKEN=$(security find-generic-password -a "mohammed.umair" -s "supabase-access-token" -w)
supabase db push
```
Expected: `Applying migration ..._real_friends_schema.sql...` then success.

- [ ] **Step 4: Verify the schema landed**

```bash
supabase db push --dry-run   # expect "Remote database is up to date."
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): friendships, habit_shares, invite_code, habits.share_mode"
```

---

## Task 2: RLS policies + friend RPC

**Files:** Create `supabase/migrations/<timestamp>_real_friends_rls.sql`.

- [ ] **Step 1: Create the migration file**

```bash
supabase migration new real_friends_rls
```

- [ ] **Step 2: Write the RLS + RPC SQL**

Put EXACTLY this in the new `..._real_friends_rls.sql`:

```sql
-- friendship check (definer-safe; avoids recursive policy references)
create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.friendships
    where user_a = least(a, b) and user_b = greatest(a, b)
  );
$$;

-- profiles: friends may read name + avatar (owner policy stays as-is)
drop policy if exists profiles_friend_read on public.profiles;
create policy profiles_friend_read on public.profiles for select
  using (public.are_friends(id, auth.uid()));

-- habits: friends may read shared habits (owner policies stay as-is)
drop policy if exists habits_friend_read on public.habits;
create policy habits_friend_read on public.habits for select
  using (
    (share_mode = 'all' and public.are_friends(user_id, auth.uid()))
    or (share_mode = 'selected' and public.are_friends(user_id, auth.uid())
        and exists (select 1 from public.habit_shares hs
                    where hs.habit_id = habits.id and hs.friend_id = auth.uid()))
  );

-- habit_completions: visible iff the parent habit is visible to the caller
drop policy if exists hc_friend_read on public.habit_completions;
create policy hc_friend_read on public.habit_completions for select
  using (exists (
    select 1 from public.habits h
    where h.id = habit_completions.habit_id
      and ((h.share_mode = 'all' and public.are_friends(h.user_id, auth.uid()))
        or (h.share_mode = 'selected' and public.are_friends(h.user_id, auth.uid())
            and exists (select 1 from public.habit_shares hs
                        where hs.habit_id = h.id and hs.friend_id = auth.uid())))
  ));

-- friendships: participants may read/delete; inserts only via the RPC (no insert policy)
drop policy if exists friendships_read on public.friendships;
create policy friendships_read on public.friendships for select
  using (auth.uid() in (user_a, user_b));
drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships for delete
  using (auth.uid() in (user_a, user_b));

-- habit_shares: owner-only (must own the referenced habit)
drop policy if exists habit_shares_owner_all on public.habit_shares;
create policy habit_shares_owner_all on public.habit_shares for all
  using (exists (select 1 from public.habits h
                 where h.id = habit_shares.habit_id and h.user_id = auth.uid()))
  with check (exists (select 1 from public.habits h
                      where h.id = habit_shares.habit_id and h.user_id = auth.uid()));

-- add a friend by code (only privileged write path)
create or replace function public.add_friend_by_code(code text)
returns table (id uuid, name text, avatar_color text)
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  target uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  select p.id into target from public.profiles p where p.invite_code = upper(btrim(code));
  if target is null then raise exception 'not_found'; end if;
  if target = me then raise exception 'self'; end if;
  if exists (select 1 from public.friendships
             where user_a = least(me, target) and user_b = greatest(me, target)) then
    raise exception 'already_friends';
  end if;
  insert into public.friendships(user_a, user_b) values (least(me, target), greatest(me, target));
  return query select p.id, p.name, p.avatar_color from public.profiles p where p.id = target;
end;
$$;
```

- [ ] **Step 3: Apply + verify**

```bash
export SUPABASE_ACCESS_TOKEN=$(security find-generic-password -a "mohammed.umair" -s "supabase-access-token" -w)
supabase db push
supabase db push --dry-run   # expect "Remote database is up to date."
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): friend-visibility RLS + add_friend_by_code RPC"
```

Full behavioral RLS verification (anon blocked, friend-only visibility, private hidden) is done end-to-end with two real accounts in Task 8.

---

## Task 3: `sync.jsx` — share_mode mapping + friend data layer

**Files:** Modify `sync.jsx`.

- [ ] **Step 1: Map `share_mode` in `rowToHabit`**

Replace `shared: r.shared,` (in `rowToHabit`, ~line 26) with:

```jsx
      shareMode: r.share_mode || 'private',
```

- [ ] **Step 2: Map `share_mode` in `habitToRow`**

Replace `shared: !!h.shared,` (in `habitToRow`, ~line 35) with:

```jsx
      share_mode: h.shareMode || 'private',
```

- [ ] **Step 3: Add the friend data-layer functions**

In `sync.jsx`, immediately AFTER the `checkinsToday` function (before the `subscribe` function, ~line 152), insert:

```jsx
  // ---- friends ----
  async function myInviteCode() {
    const id = await uid(); if (!id) return null;
    const { data } = await sb().from('profiles').select('invite_code').eq('id', id).maybeSingle();
    return data ? data.invite_code : null;
  }
  // Returns friend { id, name, avatarColor } or throws; error.message ∈
  // {not_found, self, already_friends, not_authenticated}.
  async function addFriendByCode(code) {
    const { data, error } = await sb().rpc('add_friend_by_code', { code });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { id: row.id, name: row.name, avatarColor: row.avatar_color } : null;
  }
  async function removeFriend(friendId) {
    const me = await uid(); if (!me) return;
    const a = me < friendId ? me : friendId;
    const b = me < friendId ? friendId : me;
    const { error } = await sb().from('friendships').delete().eq('user_a', a).eq('user_b', b);
    if (error) throw error;
  }
  // Assembles friends into the exact shape the Friends UI renders:
  // { id, name, avatarColor, habits: Habit[] } — RLS filters habits/completions to the visible set.
  async function loadFriends() {
    const me = await uid(); if (!me) return [];
    const { data: fr, error } = await sb().from('friendships').select('user_a,user_b');
    if (error) throw error;
    const ids = (fr || []).map((r) => (r.user_a === me ? r.user_b : r.user_a));
    if (!ids.length) return [];
    const { data: profs } = await sb().from('profiles').select('id,name,avatar_color').in('id', ids);
    const { data: habitRows } = await sb().from('habits').select('*').in('user_id', ids).is('deleted_at', null);
    const hids = (habitRows || []).map((h) => h.id);
    let comps = [];
    if (hids.length) {
      const { data } = await sb().from('habit_completions').select('*').in('habit_id', hids);
      comps = data || [];
    }
    const byHabit = {};
    comps.forEach((c) => { (byHabit[c.habit_id] = byHabit[c.habit_id] || {})[c.day] = true; });
    const habitsByUser = {};
    (habitRows || []).forEach((r) => {
      (habitsByUser[r.user_id] = habitsByUser[r.user_id] || []).push(rowToHabit(r, byHabit[r.id] || {}));
    });
    return (profs || []).map((p) => ({
      id: p.id, name: p.name, avatarColor: p.avatar_color, habits: habitsByUser[p.id] || [],
    }));
  }
  async function loadHabitShares(habitId) {
    const { data } = await sb().from('habit_shares').select('friend_id').eq('habit_id', habitId);
    return (data || []).map((r) => r.friend_id);
  }
  async function setHabitShares(habitId, friendIds) {
    const me = await uid(); if (!me) return;
    await sb().from('habit_shares').delete().eq('habit_id', habitId);
    const rows = (friendIds || []).map((fid) => ({ habit_id: habitId, friend_id: fid }));
    if (rows.length) { const { error } = await sb().from('habit_shares').insert(rows); if (error) throw error; }
  }
```

> **Canonical ordering note:** Supabase user ids are lowercase UUIDs, so JS `<` (lexicographic) and Postgres `least/greatest` produce the same pair order — the client and RPC agree on which id is `user_a`.

- [ ] **Step 4: Export the new functions**

In the `window.Sync = { ... }` object (~line 164), add these to the export list (e.g. after `migrateLocalHabits,`):

```jsx
    myInviteCode, addFriendByCode, removeFriend, loadFriends, loadHabitShares, setHabitShares,
```

- [ ] **Step 5: Transpile gate**

Run the Verification helper. Expected: `OK sync.jsx` (and all others).

- [ ] **Step 6: Commit**

```bash
git add sync.jsx
git commit -m "feat: sync friend data layer + share_mode mapping"
```

---

## Task 4: `components.jsx` — three-way sharing + friend picker

**Files:** Modify `components.jsx`.

- [ ] **Step 1: Add `friends` + `getShares` to `HabitModal` props**

Replace the `HabitModal` signature (line 373):

```jsx
function HabitModal({ habit, onClose, onSubmit, onArchive, defaultTimeOfDay }) {
```
with:
```jsx
function HabitModal({ habit, onClose, onSubmit, onArchive, defaultTimeOfDay, friends = [], getShares }) {
```

- [ ] **Step 2: Replace the `shared` state with `shareMode` + `sharedWith`**

Replace line 386:

```jsx
  const [shared, setShared] = React.useState(habit ? !!habit.shared : false);
```
with:
```jsx
  const [shareMode, setShareMode] = React.useState(habit ? (habit.shareMode || 'private') : 'private');
  const [sharedWith, setSharedWith] = React.useState([]);
  React.useEffect(() => {
    if (habit && (habit.shareMode || 'private') === 'selected' && getShares) {
      getShares(habit.id).then((ids) => setSharedWith(ids || [])).catch(() => {});
    }
  }, []);
```

- [ ] **Step 3: Emit `shareMode` + `sharedWith` in `submit()`**

Replace `shared,` (line 441) with:

```jsx
      shareMode,
      sharedWith,
```

- [ ] **Step 4: Replace the Sharing field UI**

Replace the whole Sharing `<div className="field">` block (lines 587-593) with:

```jsx
          <div className="field">
            <div className="field-label">Sharing <span className="opt">· who can see this one</span></div>
            <div className="chip-row" role="radiogroup" aria-label="Sharing">
              <button className="chip" role="radio" aria-checked={shareMode === 'private'} onClick={() => setShareMode('private')}>Private</button>
              <button className="chip" role="radio" aria-checked={shareMode === 'all'} onClick={() => setShareMode('all')}>All friends</button>
              <button className="chip" role="radio" aria-checked={shareMode === 'selected'} onClick={() => setShareMode('selected')}>Choose friends</button>
            </div>
            {shareMode === 'selected' && (
              <div className="share-picker">
                {friends.length === 0 ? (
                  <div className="share-empty">add a friend first · nobody to pick yet</div>
                ) : friends.map((f) => (
                  <label key={f.id} className="share-friend">
                    <input type="checkbox" checked={sharedWith.includes(f.id)}
                      onChange={(e) => setSharedWith((prev) => e.target.checked ? [...prev, f.id] : prev.filter((x) => x !== f.id))} />
                    <span>{f.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
```

- [ ] **Step 5: Update the `HabitRow` pill to use `shareMode`**

Replace the pill block (lines 286-288):

```jsx
          {habit.shared && (
            <span className="meta-pill shared" title="Friends can see this habit">shared</span>
          )}
```
with:
```jsx
          {habit.shareMode && habit.shareMode !== 'private' && (
            <span className="meta-pill shared" title="Friends can see this habit">shared</span>
          )}
```

- [ ] **Step 6: Transpile gate + commit**

Run the Verification helper (expect `OK components.jsx`), then:

```bash
git add components.jsx
git commit -m "feat: per-friend habit sharing in the habit editor"
```

---

## Task 5: `social.jsx` — invite-code add flow (signed-in) + guest seed path

**Files:** Modify `social.jsx`.

- [ ] **Step 1: Replace `FriendsScreen` and add a code-entry component**

Replace the `FriendsScreen` function (lines 160-204) with EXACTLY this (keeps `AddFriendModal` above it for the guest path; adds a signed-in code panel + `AddByCode`):

```jsx
// ---- add a friend by invite code (signed-in) ----
function AddByCode({ onAddByCode }) {
  const [code, setCode] = useStateS('');
  const [err, setErr] = useStateS('');
  const [busy, setBusy] = useStateS(false);
  const ERRORS = {
    not_found: "no one has that code",
    self: "that's your own code",
    already_friends: "you're already friends",
  };
  const submit = async () => {
    const c = code.trim().toUpperCase();
    if (!c || busy) return;
    setBusy(true); setErr('');
    try {
      await onAddByCode(c);
      setCode('');
    } catch (e) {
      const key = (e && e.message ? e.message : '').trim();
      setErr(ERRORS[key] || 'could not add · check the code');
    } finally { setBusy(false); }
  };
  return (
    <div className="add-by-code">
      <input className="text-input" placeholder="enter a friend's code" value={code} maxLength={8}
        onChange={(e) => { setErr(''); setCode(e.target.value.toUpperCase()); }}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
      <button className="btn btn-primary" disabled={!code.trim() || busy} onClick={submit}>add</button>
      {err && <div className="add-by-code-err">{err}</div>}
    </div>
  );
}

// ---- the Friends tab body ----
function FriendsScreen({ me, friends, today, signedIn, myCode, onAddByCode, onAddFriend, onRemoveFriend, onRenameMe }) {
  const { colorOf } = window.HabitUtils;
  const [adding, setAdding] = useStateS(false);
  const [editingName, setEditingName] = useStateS(false);
  const [nameDraft, setNameDraft] = useStateS(me.name);
  const [copied, setCopied] = useStateS(false);
  React.useEffect(() => { setNameDraft(me.name); }, [me.name]);
  const saveName = () => { onRenameMe(nameDraft); setEditingName(false); };
  const copyCode = () => {
    if (!myCode) return;
    try { navigator.clipboard.writeText(myCode); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch (_) {}
  };
  return (
    <div className="friends-screen">
      <div className="friends-me">
        <span className="avatar" style={{ background: colorOf(me.avatarColor) }}>
          {(me.name || '?').trim().charAt(0).toUpperCase()}
        </span>
        {editingName ? (
          <input className="text-input friends-me-input" value={nameDraft} autoFocus maxLength={24}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setNameDraft(me.name); setEditingName(false); } }}
            onBlur={saveName} />
        ) : (
          <button className="friends-me-name" onClick={() => setEditingName(true)}>you · {me.name}</button>
        )}
      </div>

      {signedIn && myCode && (
        <div className="invite-panel">
          <div className="invite-label">your code · share it to connect</div>
          <button className="invite-code" onClick={copyCode} title="copy">
            {myCode}<span className="invite-copy">{copied ? 'copied' : 'copy'}</span>
          </button>
          <AddByCode onAddByCode={onAddByCode} />
        </div>
      )}

      {friends.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Better together.</div>
          <div className="empty-sub">
            {signedIn ? 'share your code, add a friend, keep each other honest.'
                      : 'Add a friend, share a habit or two, keep each other honest.'}
          </div>
          {!signedIn && <button className="btn btn-primary" onClick={() => setAdding(true)}>Add a friend</button>}
        </div>
      ) : (
        <>
          {friends.map((f) => <FriendCard key={f.id} friend={f} today={today} onRemove={onRemoveFriend} />)}
          {!signedIn && (
            <div className="add-row">
              <button className="add-btn" onClick={() => setAdding(true)}>
                <window.Icons.Plus size={13} /> add friend
              </button>
            </div>
          )}
        </>
      )}

      {adding && <AddFriendModal onClose={() => setAdding(false)} onAdd={(name, color) => { onAddFriend(name, color); setAdding(false); }} />}
    </div>
  );
}
```

- [ ] **Step 2: Export `AddByCode`**

Replace the export line (line 206):

```jsx
window.Social = { FriendsScreen, FriendCard, FriendHabitRow, AddFriendModal, seedMe, seedFriends, makeFriend };
```
with:
```jsx
window.Social = { FriendsScreen, FriendCard, FriendHabitRow, AddFriendModal, AddByCode, seedMe, seedFriends, makeFriend };
```

- [ ] **Step 3: Transpile gate + commit**

Run the Verification helper (expect `OK social.jsx`), then:

```bash
git add social.jsx
git commit -m "feat: invite-code friend flow in Friends tab"
```

---

## Task 6: `app.jsx` — wire real friends + share persistence

**Files:** Modify `app.jsx`.

- [ ] **Step 1: Seed a demo habit with `shareMode` (guest path)**

Replace lines 65-66:

```jsx
  read.shared = true;
  run.shared = true;
```
with:
```jsx
  read.shareMode = 'all';
  run.shareMode = 'all';
```

- [ ] **Step 2: Add `myCode` state**

After the `friends` state declaration (line 113, the closing `});`), add:

```jsx
  const [myCode, setMyCode] = useState(null);
```

- [ ] **Step 3: Load friends + invite code on sign-in; clear on user change**

In the auth effect, replace this block (lines 175-178):

```jsx
        const [cloudHabits, cloudMe] = await Promise.all([window.Sync.loadHabits(), window.Sync.loadProfile()]);
        setHabits(cloudHabits);
        if (cloudMe) setMe(cloudMe);
        showToast(uploaded ? `Synced ${uploaded} habit${uploaded === 1 ? '' : 's'} to your account` : 'Synced. Welcome back.');
```
with:
```jsx
        const [cloudHabits, cloudMe, cloudFriends, code] = await Promise.all([
          window.Sync.loadHabits(), window.Sync.loadProfile(), window.Sync.loadFriends(), window.Sync.myInviteCode(),
        ]);
        setHabits(cloudHabits);
        if (cloudMe) setMe(cloudMe);
        setFriends(cloudFriends);
        setMyCode(code);
        showToast(uploaded ? `Synced ${uploaded} habit${uploaded === 1 ? '' : 's'} to your account` : 'Synced. Welcome back.');
```

Then, in the same effect, replace the signed-out early return `if (!s) return;` (line 168) with:

```jsx
      if (!s) { setFriends([]); setMyCode(null); return; }
```

- [ ] **Step 4: Persist share allow-list from add/edit habit**

Replace `addHabit` (lines 233-243) with:

```jsx
  const addHabit = useCallback((data) => {
    const { sharedWith, ...habitData } = data;
    const habit = {
      id: window.Sync.uuid(),
      ...habitData, completions: {}, createdAt: dayKey(new Date()),
    };
    setHabits(prev => [...prev, habit]);
    lsSet(LS.TOUCHED, true);
    setModalOpen(false); setModalDefaultTOD(null);
    if (signedInRef.current) {
      window.Sync.insertHabit(habit)
        .then(() => habit.shareMode === 'selected' ? window.Sync.setHabitShares(habit.id, sharedWith) : null)
        .catch(() => {});
    }
    setTimeout(() => showToast(`Added · ${data.name}`), 100);
  }, [showToast]);
```

Replace `editHabit` (lines 245-252) with:

```jsx
  const editHabit = useCallback((id, data) => {
    const { sharedWith, ...habitData } = data;
    let merged = null;
    setHabits(prev => prev.map(h => { if (h.id !== id) return h; merged = { ...h, ...habitData }; return merged; }));
    lsSet(LS.TOUCHED, true);
    setEditingHabit(null);
    if (signedInRef.current && merged) {
      window.Sync.updateHabit(merged)
        .then(() => window.Sync.setHabitShares(id, merged.shareMode === 'selected' ? sharedWith : []))
        .catch(() => {});
    }
    setTimeout(() => showToast(`Updated · ${data.name}`), 100);
  }, [showToast]);
```

- [ ] **Step 5: Add `addFriendByCode`; make `removeFriend` cloud-aware**

Replace `removeFriend` (lines 264-266) with:

```jsx
  const addFriendByCode = useCallback(async (code) => {
    const friend = await window.Sync.addFriendByCode(code);   // throws → AddByCode shows the message
    setFriends(await window.Sync.loadFriends());
    if (friend) showToast(`Added · ${friend.name}`);
  }, [showToast]);
  const removeFriend = useCallback((id) => {
    setFriends(prev => prev.filter(f => f.id !== id));
    if (signedInRef.current) window.Sync.removeFriend(id).catch(() => {});
  }, []);
```

- [ ] **Step 6: Pass new props to `FriendsScreen`**

Replace the `FriendsScreen` render (lines 510-519) with:

```jsx
      {tab === 'friends' && (
        <window.Social.FriendsScreen
          me={me}
          friends={friends}
          today={today}
          signedIn={!!session}
          myCode={myCode}
          onAddByCode={addFriendByCode}
          onAddFriend={addFriend}
          onRemoveFriend={removeFriend}
          onRenameMe={renameMe}
        />
      )}
```

- [ ] **Step 7: Pass `friends` + `getShares` to `HabitModal`**

Replace the `HabitModal` render (lines 522-530) with:

```jsx
      {(modalOpen || editingHabit) && (
        <HabitModal
          habit={editingHabit}
          friends={friends}
          getShares={window.Sync.enabled() ? window.Sync.loadHabitShares : null}
          onClose={() => { setModalOpen(false); setModalDefaultTOD(null); setEditingHabit(null); }}
          onSubmit={(data) => editingHabit ? editHabit(editingHabit.id, data) : addHabit(data)}
          onArchive={editingHabit ? (id) => { deleteHabit(id); setEditingHabit(null); } : null}
          defaultTimeOfDay={modalDefaultTOD}
        />
      )}
```

- [ ] **Step 8: Transpile gate + commit**

Run the Verification helper (expect `OK app.jsx`), then:

```bash
git add app.jsx
git commit -m "feat: wire real friends, invite code, and share allow-list into app"
```

---

## Task 7: `index.html` — styles for the new UI

**Files:** Modify `index.html` (`<style>` block).

- [ ] **Step 1: Add styles**

In `index.html`'s `<style>` block, immediately AFTER the `.friends-me-input` rule (line 239), add:

```css
  .invite-panel { background: var(--card); border: 1px solid var(--smoke); border-radius: 14px; padding: 12px 13px; display: flex; flex-direction: column; gap: 8px; }
  .invite-label { font-family: var(--mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-30); }
  .invite-code { align-self: flex-start; display: inline-flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 18px; letter-spacing: 0.14em; color: var(--ink); }
  .invite-copy { font-size: 10px; letter-spacing: 0.04em; color: var(--ink-30); border: 1px solid var(--smoke); border-radius: 6px; padding: 2px 6px; }
  .invite-code:hover .invite-copy { color: var(--ink); border-color: var(--ink-30); }
  .add-by-code { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .add-by-code .text-input { flex: 1; min-width: 140px; font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.1em; }
  .add-by-code-err { flex-basis: 100%; font-size: 11px; color: var(--pop); font-family: var(--mono); }
  .share-picker { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; padding-left: 2px; }
  .share-friend { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink); cursor: pointer; }
  .share-empty { font-family: var(--mono); font-size: 11px; color: var(--ink-30); margin-top: 8px; }
```

> If any variable (`--pop`, `--smoke`, `--card`, `--ink-30`) is not defined in the palette, substitute the nearest existing one — grep the `:root` block first.

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "style: invite-code panel + friend share picker"
```

---

## Task 8: Two-account live verification (the real gate)

**Files:** none (verification only). Needs two Google accounts (or one Google + one email code sign-in).

- [ ] **Step 1: Serve the app**

```bash
cd /Users/mohammed.umair/my-projects/tally && python3 -m http.server 8765 >/tmp/tally.log 2>&1 &
sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8765/index.html
```
Expected: `200`. (Requires a real `config.js` with the live Supabase URL/anon key.)

- [ ] **Step 2: Drive it with chrome-devtools** (kill the locked profile first if needed: `pkill -f "chrome-devtools-mcp/chrome-profile"`). Verify:
  1. No console errors on load for either account.
  2. **Account A:** Friends tab shows an 8-char **code** (copy works). A has habit **X** = "All friends", habit **Y** = "Choose friends" (nobody yet), habit **Z** = Private. Each shows/hides the `shared` pill correctly.
  3. **Account B:** enter A's code → A appears; B sees **X** with correct streak/dots; does **not** see **Y** (not selected) or **Z** (private).
  4. **Account A:** edit **Y** → Choose friends → tick B → save. **Account B:** reload Friends → now sees **Y** too.
  5. **Bad codes:** entering a random code → "no one has that code"; A entering A's own code → "that's your own code"; adding B again → "you're already friends".
  6. **Remove:** A (or B) removes the other → on the other's reload, the friend and their shared habits disappear.
  7. Today / Review / edit / delete / deadline / sign-out flows unaffected.
  8. **Guest (no backend):** with a placeholder `config.js` (`window.sb === null`), Friends tab still seeds maya/jess/sam, name+color add works, no invite panel shown, no console errors.

- [ ] **Step 3: Stop the server**

```bash
pkill -f "http.server 8765"
```

- [ ] **Step 4: Final commit (if verification fixes were needed)**

```bash
git add -p
git commit -m "fix: address real-friends verification findings"
```

---

## Self-Review

**1. Spec coverage:**
- Invite code (auto-generated, backfilled) → Task 1. ✓
- Instant connect via code, no accept step → `add_friend_by_code` (Task 2) + `AddByCode` (Task 5). ✓
- `share_mode` private/all/selected replacing `shared` → Task 1 (DB) + Tasks 3/4/6 (client). ✓
- `habit_shares` allow-list + owner-only RLS → Tasks 1, 2; managed via `setHabitShares` (Task 3) from add/edit (Task 6). ✓
- RLS: friend reads of profiles/habits/completions; friendships participant-only; no direct friendship insert → Task 2. ✓
- `are_friends` helper + `add_friend_by_code` RPC → Task 2. ✓
- Client: `myInviteCode`, `addFriendByCode`, `loadFriends`, `removeFriend`, `loadHabitShares`, `setHabitShares` → Task 3. ✓
- Friends UI: code panel + enter-code (signed-in), seed path (guest), unchanged `FriendCard`/`FriendHabitRow` → Task 5. ✓
- app wiring: load on sign-in, clear on sign-out, three-way picker, pass friends/getShares → Task 6. ✓
- Versioned `supabase/migrations/` + baseline → Task 0. ✓
- Edge cases (unknown/self/dup code, remove friend, empty allow-list, guest fallback) → Tasks 2, 5, 8. ✓
- Prove-it (DB + two-account browser) → Task 8 (+ dry-run checks in 1/2). ✓
- Out-of-scope (accept step, handle search, feeds, per-friend whole-account) → not implemented. ✓
- Deferred (friend realtime) → not implemented; friends refresh on sign-in + after add. ✓

**2. Placeholder scan:** No TBD/TODO; every code step is complete. The only conditional instruction (Task 7 palette-var substitution) tells the engineer exactly how to resolve it. ✓

**3. Type/name consistency:** Client habit field is `shareMode` everywhere (`rowToHabit`/`habitToRow`/`HabitModal`/`HabitRow`/seed); DB column is `share_mode`. `sharedWith` is stripped from the habit object in `addHabit`/`editHabit` and only ever passed to `Sync.setHabitShares` — never persisted on the habit or in localStorage. `Sync` exports (`myInviteCode`, `addFriendByCode`, `loadFriends`, `removeFriend`, `loadHabitShares`, `setHabitShares`) match their call sites in `app.jsx`/`components.jsx`. Friend shape `{ id, name, avatarColor, habits }` from `loadFriends` matches what `FriendCard` consumes. RPC error strings (`not_found`/`self`/`already_friends`) match the `ERRORS` map in `AddByCode`. Canonical pair ordering (`least/greatest` in SQL ≡ JS `<` on lowercase UUIDs) is consistent between `add_friend_by_code`/`are_friends` and `Sync.removeFriend`. ✓
