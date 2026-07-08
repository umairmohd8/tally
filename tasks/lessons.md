# tally — lessons

Patterns learned from corrections, so the same mistake isn't repeated. One entry per lesson:
what happened → the rule going forward.

## Supabase email magic-links die to link-scanners; template edits need custom SMTP
**What happened:** Tried to verify sign-in via email magic link. Every link came back
`otp_expired` the instant it was opened — a mail/link scanner pre-visits URLs and burns the
single-use token before anyone can use it. The scanner-proof fix (6-digit OTP code via
`{{ .Token }}`) was blocked because Supabase gates email-template customization behind
**custom SMTP** on the built-in email service.
**Rule going forward:** For quick auth verification, prefer **OAuth (Google)** — no email link,
nothing for a scanner to consume. Only use email auth when custom SMTP is configured, and then
prefer code-based OTP over magic links for corporate/scanned mailboxes. Don't burn time
re-sending magic links to a mailbox that expired the first one — the scanner will eat every retry.

## Anon key trips the secret scanner even though it's public-by-design
**What happened:** Committing `config.js` with the real Supabase anon key was blocked by the
ggshield pre-commit hook (generic JWT detector). The key IS public (RLS protects data), but the
policy/scanner treats any JWT as a secret.
**Rule going forward:** Keep `config.js` gitignored with the real values local-only; commit a
`config.example.js` template instead. Don't `--no-verify` past the secret scanner. (Deploy-time
config injection is a separate problem to solve for GitHub Pages.)
