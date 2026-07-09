# tally — task tracking

Live plan. Check items off as they're done; add a short review note when a chunk lands.

## Now

_(nothing in progress)_

## Next

- [ ] **Supabase redirect URL for live site** — add `https://umairmohd8.github.io/tally/**` to
      Auth → URL Configuration → Redirect URLs, and set Site URL, so Google sign-in works on the
      deployed app (not just localhost). MANUAL (user, Supabase dashboard).
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
- [x] **Deployed to GitHub Pages** — 2026-07-08. Repo made public (free-plan Pages needs public;
      audited first — no secrets/PII in code or history). `.github/workflows/deploy.yml` generates
      `config.js` from repo secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) at build time and
      publishes. Live at **https://umairmohd8.github.io/tally/** — verified serving, mounting, and
      connecting to Supabase. Auto-deploys on push to `main`.

- [x] **Landing + login page with live demo** — 2026-07-09. New `landing.jsx`
      (`window.Landing.LandingPage`): hero + 4 feature cards + a live **ephemeral** demo (reuses
      `HabitRow`, local state only, resets on reload). `app.jsx` renders it when
      `Sync.enabled() && !session`; seed initializers (habits + friends) no longer seed when a
      backend is configured — fixes the incognito stale-data leak (also resolves the "new account
      shows demo friends" item). Google-only sign-in. Verified local + **live** (fresh visitor →
      landing, `tally-habits` = `[]`, demo ephemeral). Spec + plan in `docs/superpowers/`.

## Notes / open questions

- **Sync is inert until Task 0.** `config.js` holds placeholder values, so `window.sb === null`
  and the whole sync path is dormant — the app behaves exactly like the pre-Phase-1 guest app.
- Deferred (accepted, non-blocking): completions-realtime subscription is unfiltered (RLS-scoped),
  so a local toggle triggers a self-echo reload — chatty but correct; supabase CDN left on
  floating `@2` without SRI (unlike other pinned+hashed scripts) — pin + hash when convenient.
