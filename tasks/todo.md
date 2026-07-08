# tally — task tracking

Live plan. Check items off as they're done; add a short review note when a chunk lands.

## Now

_(nothing in progress)_

## Next

- [ ] **Deploy to GitHub Pages (Task 7)** — enable Pages on `main`/root; add the Pages URL to
      Supabase redirect URLs. **Blocker to solve first:** `config.js` is gitignored, so a plain
      Pages deploy runs guest-only (no `window.sb`). Need a config-injection strategy (e.g. a
      GitHub Actions build step that writes `config.js` from a repo secret, or accept the anon
      key being public on the live site and commit a Pages-only config). Decide before deploying.
- [ ] **Email auth (optional, later)** — only works with custom SMTP + code-based OTP (see
      lessons). Google is the primary auth for now; skip email unless SMTP is set up.
- [ ] **Phone auth (optional)** — needs Twilio (paid). Deferred.

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
- [x] **Live Supabase project wired + sign-in verified end-to-end** — 2026-07-08. Real project
      (`rnrygrfuhsnlnmqbynui`) configured in local `config.js` (gitignored; `config.example.js`
      committed). Backend verified: client connects, schema present, RLS blocks anon reads AND
      writes. Email magic-link auth abandoned (link-scanner + SMTP-gated templates — see lessons);
      **Google OAuth** set up and **live sync confirmed** (Google sign-in → habits round-trip
      through Supabase, user-verified across sessions).

## Notes / open questions

- **Sync is inert until Task 0.** `config.js` holds placeholder values, so `window.sb === null`
  and the whole sync path is dormant — the app behaves exactly like the pre-Phase-1 guest app.
- Deferred (accepted, non-blocking): completions-realtime subscription is unfiltered (RLS-scoped),
  so a local toggle triggers a self-echo reload — chatty but correct; supabase CDN left on
  floating `@2` without SRI (unlike other pinned+hashed scripts) — pin + hash when convenient.
