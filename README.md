# tally

A warm, paper-textured habit tracker for the web. No build step, no install — open it and go.

![status](https://img.shields.io/badge/status-WIP-E66B3D) ![stack](https://img.shields.io/badge/stack-React%2018%20%2B%20Babel-1B1A17)

## What it does

- **Track daily habits** with per-habit schedules, colors, and time-of-day buckets.
- **Edit, delete, and set deadlines** — tap a habit's name to edit it; give it an end date
  (a quick duration or a specific date) after which it finishes and bows out of your day.
- **Friends & sharing** — a Friends tab where you see friends' progress on the habits they share.
  Each habit has a private/shared toggle; private habits stay yours. (Friends are locally
  simulated for now — the data model is ready for real cross-device sync later.)
- **Streaks** that survive paused days, so a planned break doesn't reset your progress.
- **"Life happens" pause** — pause some or all habits for a date range with a reason; when it
  expires you're welcomed back with a gentle recovery screen instead of a wall of broken streaks.
- **Minimum viable day (MVD)** — a lighter check-in that still counts, for low-energy days.
- **Weekly review** with reflective copy.
- **Light / dark themes** in a hand-tuned *Inkwell* palette.
- Everything is stored locally in your browser — no account, no server.

## Run it

No dependencies to install. Either:

```bash
# Serve the folder (recommended)
python3 -m http.server 8000
# then open http://localhost:8000
```

…or just open `index.html` directly in a browser. React, ReactDOM, and Babel load from a CDN,
so an internet connection is needed on first load.

## How it's built

Zero-build by design: `.jsx` files are transpiled in the browser by `@babel/standalone`.
`index.html` loads them in dependency order and each module attaches to `window.*`.

| File | Role |
|------|------|
| `index.html` | Shell + all CSS (the *Inkwell* palette and themes) |
| `tweaks-panel.jsx` | Draggable dev "Tweaks" panel and the `useTweaks` hook |
| `icons.jsx` | Inline SVG icon set (`window.Icons`) |
| `components.jsx` | Habit/date/streak utilities + core UI (`HabitRow`, add/edit modal) |
| `screens.jsx` | Larger screens & copy (recovery, weekly review, MVD) |
| `social.jsx` | Friends & sharing UI (`window.Social`) — Friends tab, friend cards, add-friend |
| `app.jsx` | `App` root — wires it together and mounts |

State persists to `localStorage` under `tally-*` keys (habits, pause, `tally-me`, `tally-friends`, …).
On first run, ~70 days of demo habits and a few mock friends are seeded so the UI isn't empty.

See [`CLAUDE.md`](./CLAUDE.md) for a deeper map of the codebase.

## Status

Work in progress — a personal project.
