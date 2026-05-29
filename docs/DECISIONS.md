# tally — Decision Log

Architecture Decision Records (ADRs): the choices that shaped tally and *why*. Newest decisions
build on older ones. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for how they fit together.

**Status:** ✅ implemented · 🟡 accepted, not yet built.

---

## ADR-001 — Zero-build (React + Babel via CDN) ✅
**Context:** A small personal habit-tracker; fast iteration valued over tooling.
**Decision:** Ship `.jsx` transpiled in-browser by `@babel/standalone`, React/ReactDOM from a CDN.
Open `index.html` and it runs; no bundler, no `node_modules`.
**Consequences:** Near-zero setup friction. No unit-test framework — verification is esbuild
transpile (syntax) + browser-driving (behavior). In-browser Babel is dev-grade (a console warning);
acceptable for this project's scale.

## ADR-002 — `localStorage` persistence, `tally-` prefix ✅
**Context:** No backend; data must survive reloads.
**Decision:** Persist all state to `localStorage` under `tally-*` keys via a central `LS`/`lsGet`/
`lsSet` layer in `app.jsx`. Seed ~70 days of demo data on first run.
**Consequences:** Instant, offline, private by default. Single-device only — the motivation for the
later backend ([ADR-009](#adr-009)). The `LS` cache layer is reused as the offline cache once synced.

## ADR-003 — Modules as `window.*` globals in load order ✅
**Context:** No bundler means no `import`/`export`.
**Decision:** Each file attaches exports to `window` (`window.HabitUtils`, `window.Components`, …);
`index.html` loads them in dependency order. New modules slot into that order.
**Consequences:** Simple and explicit; load order is load-bearing (later files read earlier globals).
Files split by responsibility to stay focused (`social.jsx` was split out rather than growing
`components.jsx`).

## ADR-004 — "Don't miss twice" streak model ✅
**Decision:** A streak survives exactly one missed scheduled day; a second miss resets it. Pause
days bridge (no credit, no penalty). `weekly_count` habits count *weeks*, others count *days*.
**Consequences:** Forgiving, anti-shame design. `computeStreak` is reused everywhere (incl. friend
rows), so its unit (`w` vs `d`) must be honored by every consumer.

## ADR-005 — Pause ("life happens") ✅
**Decision:** Pause habits for a date range with a reason; expired pauses auto-resume on mount and
trigger a gentle recovery/welcome-back screen. Streaks survive the gap.
**Consequences:** Breaks don't punish the user. Pause state is local; syncing it is deferred ([ADR-015](#adr-015)).

## ADR-006 — Edit by tapping the name; delete via menu/editor ✅
**Context:** The whole row tap already means "complete." Editing needed a non-conflicting trigger.
**Decision:** Check circle = complete; tapping the habit *body* opens the editor. Delete ("archive")
lives in the ••• menu and inside the editor. One shared `HabitModal` for add + edit.
**Alternatives:** edit via ••• only (less discoverable); long-press (less obvious). 
**Consequences:** Preserves the hero tap-to-complete interaction; editor reuse keeps code DRY.

## ADR-007 — Habit deadlines ✅
**Context:** Users want habits that end after a stretch (e.g. a 30-day challenge).
**Decision:** Optional `endDate` = inclusive last active day. After it, `isScheduled` returns false,
so the habit leaves today's totals and shows a "finished" pill; history stays. Duration chips are
anchored to **today** (never the creation date) so a chip can't end a habit in the past.
**Consequences:** Clean reuse of the scheduling path; no separate "archived" concept needed.

## ADR-008 — Friends simulated-first; per-habit `shared`; dedicated Friends tab ✅
**Context:** Wanted the friends/accountability UX before committing to a backend.
**Decision:** Build the full friends experience against **mock** local friends. One `shared` boolean
per habit (private default, shared = all friends). Friends live on a dedicated **Friends tab**;
friend habits render read-only reusing the habit-row look. Friend objects mirror the habit shape.
**Consequences:** Nailed the UX and data model cheaply; the shapes were deliberately chosen to map
onto a backend ([ADR-009](#adr-009)) with no UI rework. Per-friend audiences deferred.

## ADR-009 — Real backend = Supabase 🟡
**Context:** Single-device localStorage can't support "friends on their own phones" or cross-device.
Audience goal: a real product with open signups.
**Decision:** Use **Supabase** (Postgres + Auth + Realtime + Row-Level Security).
**Alternatives:** Firebase/Firestore (NoSQL — clunkier for the friend-graph + queries, more
lock-in); custom Node/Postgres backend (max control, far more to build/host — premature).
**Consequences:** Relational fit for users/friends/habits; RLS gives per-row authorization; realtime
gives live sync; scales to paid tiers. Adds an external dependency + project setup.

## ADR-010 — Keep zero-build with the backend (CDN client, public anon key, RLS) 🟡
**Context:** A real product could justify a build step (Vite); tally's identity is zero-build.
**Decision:** Keep zero-build. Load the Supabase UMD client from a CDN; put the public `SUPABASE_URL`
+ anon key in a committed `config.js`. Security comes from **Row-Level Security**, not from hiding
the anon key (it's designed to be public).
**Alternatives:** adopt Vite + env vars + CI (more product-grade, but reworks every file's loading
and adds install/tooling friction). Revisit only if bundling/CI become genuinely necessary.
**Consequences:** Preserves "open and go"; ships fast. RLS correctness becomes critical.

## ADR-011 — Auth: Google OAuth + phone/SMS OTP 🟡
**Decision:** Offer Google sign-in (one-tap, no passwords, no email-deliverability bottleneck) and
phone/SMS OTP. Start lean; add methods later.
**Consequences:** Google needs a one-time OAuth credential. **SMS is not free** — needs a paid
provider (e.g. Twilio) + rate-limiting/captcha (SMS is abuse-prone). Email magic-link / email+password
deferred.

## ADR-012 — Everything syncs, RLS-protected (private stays private) 🟡
**Context:** Where do private (non-shared) habits live once there's a server?
**Decision:** **All** habits sync to the owner's account so they work on every device. RLS lets
friends `SELECT` only `shared` rows; private habits are the owner's alone (encrypted at rest by
Supabase).
**Alternatives:** keep private habits local-only (no cross-device for them; two storage paths);
end-to-end encryption (most private, but key-management complexity — overkill now).
**Consequences:** Standard multi-device behavior; trust rests on correct RLS policies, which must be
tested adversarially (a second account must not read the first's rows).

## ADR-013 — Friends via invite link / code, mutual 🟡
**Decision:** Connect by sharing a personal invite link/code; friendship is mutual (both consent
before shared habits are visible). No public directory.
**Alternatives:** username search (needs unique handles, search, request inbox, blocking/abuse);
both (more scope up front). Username search deferred.
**Consequences:** Privacy-preserving and low-scope; scales fine. Phase 2 work.

## ADR-014 — Local-first, optional sign-in (both modes first-class) 🟡
**Context:** Forcing login would break "open and go" and existing local users.
**Decision:** The app works fully as a **guest** on local data; signing in is an opt-in upgrade that
migrates local data up and enables sync (+ friends in Phase 2). **Both guest and synced modes stay
first-class** — sign-out returns to guest with the local cache intact.
**Alternatives:** require sign-in (simpler one-source-of-truth code, but loses try-without-account
and forces account creation).
**Consequences:** A bit more code (two modes), but preserves the product's character and gives users
the choice.

## ADR-015 — Phasing: P1 own-data sync, P2 friends 🟡
**Decision:** Ship the backend in two independently shippable phases — **Phase 1**: accounts + sync
of your own habits across your devices; **Phase 2**: real friends (invite links, friend-read RLS,
live shared progress). Each gets its own spec → plan → build.
**Deferred (YAGNI):** syncing pause/MVD state, nudges/reactions, username search, custom SMTP,
captcha/abuse hardening.
**Consequences:** Value ships sooner (multi-device for yourself before the friend graph); smaller,
verifiable plans.
