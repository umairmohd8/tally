# tally

A warm, paper-textured **habit tracker** web app (codename/palette: *Inkwell*). Single-page,
zero build step — React + Babel are loaded from a CDN and `.jsx` files are transpiled in the
browser. Open `index.html` and it runs.

## Running it

No build, no install. Either:
- Open `index.html` directly in a browser, **or**
- Serve the folder (avoids any file:// quirks): `python3 -m http.server 8000` then open
  http://localhost:8000

Requires internet on first load (React 18.3.1, ReactDOM, `@babel/standalone` come from unpkg).

## File layout & load order

`index.html` loads the scripts in this order (order matters — later files read globals set by
earlier ones):

1. **`tweaks-panel.jsx`** — floating, draggable dev "Tweaks" panel + the `useTweaks` hook.
   Exposes `window.TweaksPanel`, `window.useTweaks`, and the `Tweak*` controls
   (`TweakSection`, `TweakToggle`, `TweakRadio`, `TweakSlider`, `TweakSelect`, `TweakText`,
   `TweakButton`). Talks to a host editor via `postMessage` (`__edit_mode_*`); harmless when
   run standalone.
2. **`icons.jsx`** — inline SVG icon set. Exposes `window.Icons` (Pause, Sun, Moon, X, Plus,
   Check, More, Trash, Bell, …).
3. **`components.jsx`** — habit date/streak utilities + core UI pieces. Exposes
   `window.HabitUtils` (`dayKey`, `addDays`, `startOfWeek`, `isScheduled`, `scheduleLabel`,
   `isPausedOn`, `computeStreak`, `slippedYesterday`, `weekCompletions`, `formatReminderTime`,
   `TOD_BUCKETS`, `colorOf`), `window.PauseMeta`, and `window.Components` (`HabitRow`,
   `AddHabitModal`, `PauseModal`, `CheckMark`).
4. **`screens.jsx`** — larger screens & copy. Exposes `window.Screens` (`RecoveryScreen`,
   `WeeklyReview`, `MVDButton`, `BodyDoubleCounter`, `pickToastLine`, `pickAllDoneLine`,
   `MVD_TOAST`, and the toast/streak/verdict copy banks).
5. **`app.jsx`** — the `App` root component; wires everything together and mounts to the DOM.

All styling lives in the `<style>` block in `index.html` (the *Inkwell* CSS custom-property
palette + light/dark themes).

## Key concepts

- **Persistence** — everything is `localStorage`, keys prefixed `tally-`:
  `tally-habits`, `tally-pause`, `tally-pause-history`, `tally-mvd-logged`, `tally-theme`,
  `tally-seen-welcome-back`. (See `LS` in `app.jsx`.) On first run with no stored habits,
  `seedHabits()` generates ~70 days of demo data.
- **Habit model** — `{ id, name, color, schedule, timeOfDay, reminderTime, completions, createdAt }`.
  `completions` is a map of `dayKey` → `true`. Time-of-day buckets in `TOD_BUCKETS`.
- **Pause ("Life happens")** — habits can be paused for a date range with a reason; expired
  pauses auto-resume on mount and trigger the *Recovery* / welcome-back flow.
- **MVD** — "minimum viable day": a lighter-weight check-in that still counts toward streaks.
- **Streaks** — `computeStreak` accounts for schedule + paused days, so a pause doesn't break
  a streak.
- **Tweaks panel** — runtime feature flags via `TWEAK_DEFAULTS` in `app.jsx`
  (`showProgressBar`, `showBodyDouble`, `showMVD`). The `/*EDITMODE-BEGIN*/ … /*EDITMODE-END*/`
  markers are anchors for an external edit-mode host; leave them intact.

## Conventions

- Plain JSX, no TypeScript, no bundler. Add new modules as `window.*` globals and wire them
  into `index.html` in dependency order.
- Match the existing voice in user-facing copy: warm, lowercase, lightly playful (see the
  copy banks in `screens.jsx`).
- Keep all CSS in `index.html`'s `<style>` block and use the existing palette variables.

## Task tracking

See `tasks/todo.md` for the live plan and `tasks/lessons.md` for accumulated corrections.
