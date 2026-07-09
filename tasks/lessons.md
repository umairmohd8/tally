# tally — lessons

Patterns learned from corrections, so the same mistake isn't repeated. One entry per lesson:
what happened → the rule going forward.

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
