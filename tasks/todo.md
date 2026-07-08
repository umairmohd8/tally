# tally — task tracking

Live plan. Check items off as they're done; add a short review note when a chunk lands.

## Now

_(nothing in progress)_

## Next

- [ ] **Task 0 — Supabase project setup (MANUAL, user).** See the plan
      `docs/superpowers/plans/2026-05-29-real-backend-sync-phase1.md` §Task 0: create the
      project, run the schema+RLS SQL, enable Google + phone auth, add localhost:8000 +
      GitHub Pages redirect URLs. Then hand off Project URL + anon key → fill `config.js`.
- [ ] **Live-sync verification (Task 8B)** — after Task 0 + real `config.js`: sign-in renders,
      migration, cross-device realtime, fresh-device pull, RLS isolation, sign-out.
- [ ] **Deploy to GitHub Pages (Task 7)** — enable Pages on `main`/root; add the Pages URL to
      Supabase redirect URLs.

## Done

- [x] Set up project scaffolding: `git init`, `.gitignore`, `CLAUDE.md`, `tasks/` — 2026-05-29
- [x] Core tracker, edit/delete + deadlines, simulated friends/social — (see git log, 2026-05-29)
- [x] **Phase 1 code (Tasks 1–6): Supabase backend + live sync** — 2026-07-08. `config.js`
      (placeholders → guest mode until Task 0), `sync.jsx` (auth/CRUD/migration/realtime),
      `auth.jsx` (sign-in modal + account control), wired into `app.jsx`/`index.html`.
      Built via workflow (implement → 3-lens review). Fixed review findings: init
      double-fire (single-source + idempotent-per-user onAuth), UUID/DB mismatch (shared
      `window.Sync.uuid()`), `getUser()`→`getSession()`, phone-OTP modal now closes on
      session. Seeded demo data no longer migrates unless the user shaped their own list
      (`tally-touched` flag on add/edit/delete). Guest mode browser-verified (renders, no
      errors, account control hidden while `window.sb === null`).

## Notes / open questions

- **Sync is inert until Task 0.** `config.js` holds placeholder values, so `window.sb === null`
  and the whole sync path is dormant — the app behaves exactly like the pre-Phase-1 guest app.
- Deferred (accepted, non-blocking): completions-realtime subscription is unfiltered (RLS-scoped),
  so a local toggle triggers a self-echo reload — chatty but correct; supabase CDN left on
  floating `@2` without SRI (unlike other pinned+hashed scripts) — pin + hash when convenient.
