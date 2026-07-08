# Landing + Login Page with Live Demo — Design

**Date:** 2026-07-09
**Status:** Approved (design), pending spec review

## Problem

The deployed app (`https://umairmohd8.github.io/tally/`) boots every visitor straight into
the tracker pre-filled with `seedHabits()` demo data persisted to `localStorage`. A brand-new
visitor (e.g. incognito) therefore sees fake habits/streaks and, over repeat visits, accumulates
stale local state. There is no front door: no explanation of what tally is, and no clear sign-in
path. We want a **landing page** that markets the app and shows a **live, non-persisting demo**,
with sign-in to get a real, synced tracker.

## Goals

- Unauthenticated visitors see a **marketing landing page**, not the seeded tracker.
- The landing includes a **live, interactive demo** that **never persists** (resets every reload)
  — killing the "stale data in incognito" problem.
- A clear **"Continue with Google"** sign-in path (the only working auth today).
- Signed-in users get the existing tracker, unchanged, starting clean (already the case).
- No regression to guest/local-dev when the backend isn't configured.

## Non-goals (YAGNI)

- URL routing / a separate `/login` route — stay a single-page, auth-state switch.
- Email/phone auth on the landing — hidden until custom SMTP / Twilio exist (they currently
  fail: link-scanner eats email magic links; phone needs paid Twilio).
- Analytics, marketing instrumentation, A/B testing.
- Refactoring the tracker into a shared "view" component (Approach B, rejected as risky).

## Approach

**Approach A (chosen): a dedicated ephemeral demo panel** that reuses the existing habit
components (`window.Components.HabitRow`, `window.HabitUtils`) with seeded data held in local
React state only. The demo is a **Today-view slice**, not the full tabbed app — enough to convey
the product without touching the large `app.jsx` tracker.

Rejected — **Approach B**: extract a reusable `TrackerView` from `app.jsx` and render it in a
"demo mode." DRYer but a risky refactor of a large file for little visible gain.

## Architecture

### Gating (in `app.jsx` root)

The App root decides what to render based on backend config + session:

| Condition | Renders |
|-----------|---------|
| Signed in (`session` truthy) | The existing tracker, **unchanged** |
| Backend configured (`Sync.enabled()`) **and** not signed in | **`<LandingPage>`** (with live demo) |
| Backend **not** configured (`!Sync.enabled()`, e.g. fresh clone w/o `config.js`) | Tracker in guest mode (preserves local dev) |

The auth `useEffect` already sets `session` from Supabase; the landing shows/hides purely on that
state. Signing in via the landing triggers `onAuthStateChange`, `session` flips, and the root
swaps to the real tracker with no reload.

Implementation note: App's hooks (state/effects/callbacks) run unconditionally as today; only the
**returned JSX** branches — an early `return <window.Landing.LandingPage .../>` when
`Sync.enabled() && !session`. No hook-order risk. The tracker body is otherwise unchanged.

### New file: `landing.jsx` → `window.Landing`

Loaded in `index.html` after `screens.jsx`/`social.jsx` and before `app.jsx` (same babel-script
pattern as the other modules). Exposes `window.Landing.LandingPage`.

`LandingPage` props: `{ onSignIn }` (calls `window.Sync.signInGoogle()`), plus theme controls
matching the app's existing pattern.

Sections:
1. **Top bar** — `tally` wordmark, theme toggle, secondary "Continue with Google" button.
2. **Hero** — headline + subhead (Inkwell voice, warm/lowercase/lightly playful) + primary
   "Continue with Google" CTA.
3. **Live demo** — a card labeled *"demo · nothing's saved"* rendering a Today-style list of ~4
   seeded habits via `HabitRow`. Toggling updates **local component state only**; a reload resets
   it. No `localStorage`, no `Sync` calls.
4. **Feature highlights** — 4 short cards: streaks · "life happens" pause · minimum viable day ·
   friends. Copy in the existing voice.
5. **Footer** — small print (e.g. link to the GitHub repo).

### Demo data & interactivity

- A small seed builder (trimmed version of the tracker's seed) produces ~4 habits with recent
  completions, held in `useState`.
- Toggling a habit's today-completion flips it in local state and recomputes the streak via
  `window.HabitUtils.computeStreak` — visually identical to the real app.
- **No persistence layer touched** — the demo never reads or writes `localStorage` and never
  calls `window.Sync`.

### Seed data relocation

Today `app.jsx` seeds `seedHabits()` in the habits `useState` initializer, and a persistence
`useEffect` writes `habits` to `localStorage`. **Because state + effects run regardless of what
App renders, simply showing the landing would still initialize and persist the seed** — the leak
would survive. So the fix is at the **initializer**, not the render branch.

New initializer logic (habits, and likewise friends):
- `stored` (length > 0) → use it.
- else if `window.Sync.enabled()` (backend configured — deployed site, and local dev with a real
  `config.js`) → **empty array** (no seed). Signed-out visitors see the landing; signed-in users
  load from cloud (clean start, already handled by the migration gate).
- else (`!Sync.enabled()`, fresh clone / no config) → `seedHabits()` / `seedFriends()` for local
  dev convenience.

`window.Sync.enabled()` is safe to read at init because `config.js` loads before `app.jsx`.
The demo's seed is entirely separate (ephemeral state inside `landing.jsx`).

**Bonus:** gating `friends` the same way also resolves the parked "new signed-in account shows
demo friends" item — signed-in/configured users no longer inherit the local friends seed.

### Auth on the landing

- Landing CTAs call `window.Sync.signInGoogle()` directly (Google is the only working provider).
- The existing in-app `SignInModal` (Google/email/phone) is **untouched** — it's reached from the
  in-app account control, not the landing.

## Styling

All CSS lives in `index.html`'s `<style>` block using the existing Inkwell palette custom
properties (as per project convention). New classes are namespaced (e.g. `.landing-*`). Landing is
responsive and respects light/dark theme like the rest of the app. Final visual polish handled at
implementation time (frontend-design skill may assist).

## Data flow

```
visitor → app.jsx root
  ├─ Sync.enabled() && !session → LandingPage
  │     ├─ demo: local useState (ephemeral) → HabitRow
  │     └─ "Continue with Google" → Sync.signInGoogle() → OAuth redirect
  │            → returns → onAuthStateChange → session set → root swaps to tracker
  ├─ session → existing tracker (synced, clean start)
  └─ !Sync.enabled() → guest tracker (seeded, local-only) [local dev only]
```

## Error handling

- Google sign-in failure: surface a small inline error on the landing CTA (reuse the app's toast
  or a simple message); the demo remains usable.
- `!Sync.enabled()` on the deployed site should never happen (config injected at build), but the
  guest-tracker fallback keeps the app functional if it did.

## Testing / proof

- **Static:** transpile gate passes for all `.jsx` incl. `landing.jsx`.
- **Browser (local + deployed):**
  - Signed-out (incognito-equivalent, cleared storage) → landing renders; no tracker/seed shown;
    demo is interactive; toggling then reloading **resets** the demo (nothing persisted).
  - "Continue with Google" initiates the Google OAuth flow (reaches Google, correct client/redirect).
  - Signed-in → real tracker renders (landing gone), starts clean.
  - `localStorage` has **no** `tally-habits` seed from merely visiting the landing.
  - Light/dark theme both look right; responsive at narrow widths.

## Files

| File | Change |
|------|--------|
| `landing.jsx` | **create** — `window.Landing.LandingPage` + ephemeral demo |
| `app.jsx` | modify — root gating (landing vs tracker vs guest); stop seeding on the configured-signed-out path |
| `index.html` | modify — load `landing.jsx`; add `.landing-*` CSS |
| `CLAUDE.md` | modify — document landing/demo + gating in file layout/key concepts |
