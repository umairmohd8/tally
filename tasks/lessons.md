# tally — lessons

Patterns learned from corrections, so the same mistake isn't repeated. One entry per lesson:
what happened → the rule going forward.

## Completions never synced: reading a value assigned inside a setState updater (bug)
**What happened:** Habit check-ins showed locally but vanished on refresh, and the DB had zero
`habit_completions`. Root cause: `toggle` assigned `becameDone` *inside* the `setHabits(prev => …)`
updater, then read it on the next line to gate the cloud write (`if (becameDone !== null) Sync.setCompletion(…)`).
React only runs a setState updater **synchronously** via its eager-bailout optimization, which is
**skipped whenever the fiber already has a pending update** (a realtime reload, a queued toast, a
prior setState). In that case the updater is deferred, `becameDone` stays `null`, and the write is
silently skipped — worsened by `.catch(() => {})` hiding every failure. `addHabit` never had the
bug because it built a plain `const` outside the updater. `editHabit` had the same latent bug.
Confirmed with a React 18.3.1 repro: no pending update → updater runs inline (write fires); a
pending `setState` first → updater deferred (`becameDone` null, write skipped).
**Rule going forward:** NEVER read a variable assigned inside a `setState`/`useReducer` updater on
a later synchronous line — updaters must be pure and their timing isn't guaranteed. Compute the
value from current state *before* calling setState (put the fresh state in the `useCallback` deps),
then pass it to both the updater and any side-effect. Also: don't `.catch(() => {})` sync writes —
swallowing errors hides data loss; at minimum surface a toast.

## Magic-link "otp_expired" was a cross-browser PKCE mismatch, NOT a scanner (corrected)
**What happened:** Email magic links kept returning `otp_expired`. I diagnosed a "mail/link
scanner eating single-use links" and pushed toward code-based OTP + custom SMTP (Resend). **That
root cause was wrong.** The real reason: I was opening the pasted link in the *automation* browser
while the flow was initiated in a different context — magic-link/OAuth PKCE stores a verifier in
the **originating** browser, so opening the link elsewhere fails as "invalid/expired." When the
user ran the whole flow (request link → click link) in their **own single browser**, built-in
magic link worked with **no SMTP** needed.
**Rule going forward:** For magic-link / OAuth PKCE flows, the callback MUST be opened in the same
browser+profile that started it. Don't verify these by pasting the link into a different browser,
and don't diagnose "scanner" from failures that cross browsers. Only reach for code-based OTP +
SMTP if the link genuinely fails within a single browser. Built-in Supabase email (magic link)
works without SMTP — just rate-limited (~a few/hour) and template not customizable.

## Anon key trips the secret scanner even though it's public-by-design
**What happened:** Committing `config.js` with the real Supabase anon key was blocked by the
ggshield pre-commit hook (generic JWT detector). The key IS public (RLS protects data), but the
policy/scanner treats any JWT as a secret.
**Rule going forward:** Keep `config.js` gitignored with the real values local-only; commit a
`config.example.js` template instead. Don't `--no-verify` past the secret scanner. (Deploy-time
config injection is a separate problem to solve for GitHub Pages.)
