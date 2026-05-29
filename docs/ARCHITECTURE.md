# tally — Architecture

How tally is built today and where the backend is taking it. For per-feature designs see
[`docs/superpowers/specs/`](./superpowers/specs); for *why* each choice was made see
[`DECISIONS.md`](./DECISIONS.md). For a quick agent orientation see [`../CLAUDE.md`](../CLAUDE.md).

> **Status legend:** ✅ implemented · 🟡 specced, not yet built.

---

## 1. Principles

- **Zero-build** ✅ — `.jsx` is transpiled in the browser by `@babel/standalone`; open `index.html`
  and it runs. No bundler, no install. This holds even with the backend (CDN client). → [ADR-001](./DECISIONS.md#adr-001), [ADR-010](./DECISIONS.md#adr-010)
- **Local-first** ✅/🟡 — the app is fully usable offline with no account; a cloud account is an
  opt-in upgrade, never a wall. → [ADR-002](./DECISIONS.md#adr-002), [ADR-014](./DECISIONS.md#adr-014)
- **Modules as `window.*` globals** ✅ — each file attaches its exports to `window`; `index.html`
  loads them in dependency order. → [ADR-003](./DECISIONS.md#adr-003)
- **Warm, lowercase, playful** ✅ — user-facing copy voice (copy banks live in `screens.jsx`).

---

## 2. Current system (✅ built)

### Module map & load order
`index.html` loads scripts in this order — later files read globals set by earlier ones:

| # | File | Global | Responsibility |
|---|------|--------|----------------|
| 1 | `tweaks-panel.jsx` | `window.TweaksPanel`, `useTweaks`, `Tweak*` | Draggable dev "Tweaks" panel + feature-flag hook |
| 2 | `icons.jsx` | `window.Icons` | Inline SVG icon set |
| 3 | `components.jsx` | `window.HabitUtils`, `window.Components`, `window.PauseMeta` | Date/streak utilities + core UI (`HabitRow`, `HabitModal`, `PauseModal`, `CheckMark`) |
| 4 | `screens.jsx` | `window.Screens` | Larger screens & copy (recovery, weekly review, MVD, copy banks) |
| 5 | `social.jsx` | `window.Social` | Friends & sharing UI (Friends tab, friend cards, add-friend) — **simulated** |
| 6 | `app.jsx` | mounts `<App/>` | Root component; wires everything, owns state, persistence |

All CSS lives in `index.html`'s `<style>` block using the *Inkwell* palette CSS variables
(`--ink`, `--pop`, `--cloud`, `--cloud-ink`, `--smoke`, `--card`, `--mono`, …) with light/dark themes.

### Data model
- **Habit** — `{ id, name, color, schedule, timeOfDay, reminderTime, completions, createdAt, endDate?, shared? }`
  - `schedule`: `{ type: 'daily' | 'weekly_count' | 'specific_days', count?, days? }`
  - `completions`: map of `dayKey` (`"YYYY-MM-DD"`) → `true`
  - `endDate`: inclusive last active day (deadline); absent = runs forever → [ADR-007](./DECISIONS.md#adr-007)
  - `shared`: visible to friends when `true`; default private → [ADR-008](./DECISIONS.md#adr-008)
- **Me** — `{ id:'me', name, avatarColor }`
- **Friend** (simulated) — `{ id, name, avatarColor, habits: Habit[] }` (their `habits` use the
  identical habit shape, so `computeStreak`/`isScheduled`/dots work unchanged)

### Persistence & state
- `localStorage`, `tally-` prefix: `tally-habits`, `tally-pause`, `tally-pause-history`,
  `tally-mvd-logged`, `tally-theme`, `tally-seen-welcome-back`, `tally-me`, `tally-friends`.
  Centralized in `LS`/`lsGet`/`lsSet` in `app.jsx`. → [ADR-002](./DECISIONS.md#adr-002)
- State lives in `App()` (React `useState`), persisted via `useEffect` per key. On first run with
  no stored habits, `seedHabits()` generates ~70 days of demo data; `window.Social.seedFriends`
  seeds mock friends.

### Core flows
- **Toggle (hero interaction)** — tap the check circle to complete; tapping the habit *body* opens
  the editor → [ADR-006](./DECISIONS.md#adr-006).
- **Streaks** — "don't miss twice": one slipped scheduled day is forgiven; pause days bridge.
  `weekly_count` streaks count weeks. → [ADR-004](./DECISIONS.md#adr-004)
- **Pause ("life happens")** — pause a date range with a reason; expired pauses auto-resume on
  mount → recovery/welcome-back screen. → [ADR-005](./DECISIONS.md#adr-005)
- **Edit / delete / deadline** — `HabitModal` (add+edit), archive via menu or editor, deadlines
  that stop scheduling + show a "finished" pill. → [ADR-006](./DECISIONS.md#adr-006), [ADR-007](./DECISIONS.md#adr-007)
- **Friends (simulated)** — Friends tab shows mock friends' shared habits read-only; per-habit
  share toggle. No network. → [ADR-008](./DECISIONS.md#adr-008)

---

## 3. Backend & sync (🟡 specced — `2026-05-29-real-backend-sync-design.md`)

### Two modes, both first-class
- **Guest (local-only)** — exactly today's behavior; `localStorage` is source of truth, no network.
- **Synced (signed in)** — Supabase is source of truth; `localStorage` is an offline cache.
- Sign-out returns to guest mode keeping the cache. → [ADR-014](./DECISIONS.md#adr-014)

### Platform & client
**Supabase** (Postgres + Auth + Realtime + RLS), loaded as a CDN UMD bundle → `window.sb`;
`config.js` holds the public URL + anon key. → [ADR-009](./DECISIONS.md#adr-009), [ADR-010](./DECISIONS.md#adr-010)

### Planned modules
- `config.js` — Supabase client.
- `sync.jsx` (`window.Sync`) — data layer: session, load/save, realtime, migration. No UI.
- Auth UI (`SignInModal`) — in `social.jsx` or a small `auth.jsx`.
- `app.jsx` sources data through `Sync` when signed in, else `localStorage`.
- New load order: `… → social.jsx → sync.jsx → app.jsx` (after CDN supabase + `config.js`).

### Schema (Phase 1)
`profiles` · `habits` (with `updated_at`, soft-delete `deleted_at`) · `habit_completions`
(`(habit_id, day)` PK — a checkmark is an insert, conflict-free). Realtime publication on the
latter two. Full SQL in the spec.

### Security — Row-Level Security
Every policy keys off `auth.uid()`: users read/write only their own rows. Friends-read policies
arrive in Phase 2. The public anon key is safe *because* RLS is the gate. → [ADR-010](./DECISIONS.md#adr-010), [ADR-012](./DECISIONS.md#adr-012)

### Auth
Google OAuth + phone/SMS OTP (SMS needs a paid provider e.g. Twilio + rate limits).
Session persisted by Supabase; `onAuthStateChange` drives UI. → [ADR-011](./DECISIONS.md#adr-011)

### Sync engine
Local-first: hydrate from cache → fetch fresh → optimistic writes upsert to Supabase → realtime
keeps your devices live. Conflicts: habits last-write-wins by `updated_at`; completions set-union.
→ [ADR-012](./DECISIONS.md#adr-012)

### Migration
First sign-in with an empty account uploads the guest's local habits (local id → uuid);
otherwise the account is authoritative and local becomes a cache.

### Phasing
- **Phase 1** — accounts + your-own-device sync.
- **Phase 2** — real friends: `friendships` + `invites` tables, invite-link redeem, friend-read
  RLS, Friends tab reads real data. → [ADR-013](./DECISIONS.md#adr-013), [ADR-015](./DECISIONS.md#adr-015)

### Deploy
Static app on GitHub Pages; Supabase project holds schema/RLS/auth config + redirect URLs.

---

## 4. Verification approach
No unit-test framework (would break zero-build). Quality gates are **esbuild transpile**
(syntax) + **chrome-devtools browser-driving** (behavior), plus multi-agent review/verify
Workflows for larger changes. → [ADR-001](./DECISIONS.md#adr-001)
