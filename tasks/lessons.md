# tally — lessons

Patterns learned from corrections, so the same mistake isn't repeated. One entry per lesson:
what happened → the rule going forward.

## Selected-shared habits were invisible to the friends they were shared with (bug)
**What happened:** After shipping real friends, a habit shared to a specific friend (`share_mode
= 'selected'`) never appeared for that friend — the friend card showed but with no habits.
Root cause: `habits_friend_read` (and `hc_friend_read`) checked the allow-list with an inline
`EXISTS (select 1 from habit_shares where habit_id = … and friend_id = auth.uid())`, but
`habit_shares` has **owner-only** RLS. So when the *friend* (not the owner) evaluated the policy,
that subquery — subject to `habit_shares` RLS — saw zero rows: a friend has no read access to the
allow-list entry naming them. The habit (and its completions) stayed hidden. The `'all'` path was
fine; only `'selected'` broke. Related to but distinct from the earlier `habits<->habit_shares`
recursion lesson: the recursion fix made `habit_shares_owner_all` use `owns_habit()` (stopping the
42P17 loop) but did NOT grant friends visibility of their own allow-list rows. Proven with a
read-only rolled-back RLS simulation (friend saw 0 habits before, `Fin/Min` after).
**Rule going forward:** An RLS policy that does `EXISTS(select from other_table …)` only sees rows
the *current role* is allowed to read under `other_table`'s own RLS. If the check needs to see rows
the caller doesn't own (a friend checking an owner-managed allow-list), wrap it in a `SECURITY
DEFINER` helper (`is_shared_with()`, like `are_friends()`/`owns_habit()`) that bypasses the inner
table's RLS. When designing cross-user visibility, test from the *recipient's* JWT, not just the
owner's — the owner always passes owner-only policies and hides this class of bug.

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

## Unchecking a habit silently failed: recursive RLS between habits and habit_shares (bug)
**What happened:** After the completion-sync fix, checking a habit persisted but *unchecking*
didn't — the check reappeared on the realtime reload. Root cause: the `real_friends` RLS
migration created a policy cycle — `habits.habits_friend_read` subqueries `habit_shares`, and
`habit_shares_owner_all` subqueries `habits` — so evaluating either table's RLS looped
(`42P17: infinite recursion detected in policy for relation "habits"`). Because the
`habit_completions` "own completions" policy also subqueries `habits`, completion **DELETEs**
hit the recursion and threw; the client's `.catch(() => {})` swallowed it, so the DB row stayed
and the reload restored the check. (INSERT/UPSERT dodged the recursive plan, which is why
*checking* worked but *unchecking* didn't — a confusing asymmetry.) Fixed with a `SECURITY
DEFINER` `owns_habit()` helper (same pattern `are_friends()` already used) so the `habit_shares`
policy checks ownership without re-entering habits RLS. Proven via a rolled-back transaction
before applying to prod. Migration: `real-friends` worktree `20260710130000_fix_rls_recursion.sql`.
**Rule going forward:** RLS policies that cross-reference each other's tables via inline
`EXISTS(select from other_table ...)` recurse — table A's policy hits table B's policy hits
table A's. Break the cycle with a `SECURITY DEFINER` function (bypasses RLS on the inner lookup).
When a write mysteriously no-ops, test the exact SQL under the caller's role/JWT via a rolled-back
transaction — it surfaces RLS errors the fire-and-forget client hides. Don't `.catch(() => {})`.

## Duplicated every habit: migration treated a failed existence-check as "empty account" (bug)
**What happened:** All 7 habits doubled to 14 (batch insert, identical `updated_at`). Cause:
`migrateLocalHabits` guards re-upload with `const { data: existing } = await …select('id')…` —
it **discarded the error**. When that query errored (the live RLS recursion, before it was fixed),
`existing` came back null, the `if (existing && existing.length) return null` guard didn't fire,
and migration re-uploaded the local habit list on top of the existing cloud rows. Fixed by
destructuring `error` and `throw`ing on it (abort migration on uncertainty). Cleaned up the 7
dupe rows via soft-delete (they had zero completions; originals kept their history).
**Rule going forward:** A guard that decides "is it safe to write?" must distinguish *"checked,
and the answer is no"* from *"the check failed."* Never treat a swallowed/failed read as the
permissive branch — especially before an insert/migration. Destructure Supabase `error` and act
on it; `const { data } = …` that drops `error` is a latent bug when the query can fail.

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

## Magic-link emails arrived with EMPTY bodies — free-tier + built-in email provider (bug)
**What happened:** Magic-link emails arrived with the subject rendered ("Your sign-in link") but a
completely **blank body** (no link). Everything looked healthy: client `signInWithOtp` correct,
`admin/generate_link` produced a valid non-empty ConfirmationURL + OTP, and the Management API
(`GET /v1/projects/{ref}/config/auth`) showed populated, valid `mailer_templates_magic_link_content`.
The tell was `mailer_templates_custom_contents.MAILER_TEMPLATES_MAGIC_LINK_CONTENT: false` (all
templates `false`). A `PATCH /config/auth` to set the template returned the real cause:
`"Email template modification is not available for free tier projects using the default email
provider. Please upgrade your plan or configure a custom SMTP provider."` Supabase has since
tightened the built-in ("default") email service — on **free tier + default provider**, template
customization is disabled AND the built-in provider ships a degraded/empty body. This CONTRADICTS
the earlier lesson above ("built-in works without SMTP"): it no longer does. Only fix is upgrade
plan or configure custom SMTP (Resend: host `smtp.resend.com`, port 465, user `resend`, pass =
`re_…` API key; sender must be a verified domain, or `onboarding@resend.dev` for self-only tests).
**Rule going forward:** Supabase's built-in email is now dev-only and, on free tier, actively
broken for real delivery (empty bodies, no template customization). For any real magic-link/OTP
email, configure custom SMTP from the start — don't rely on the built-in provider. When email
config looks perfect in the Management API but delivery is wrong, the `mailer_templates_custom_contents`
booleans and a trial `PATCH /config/auth` surface plan/provider restrictions the GET hides.
The earlier "built-in works without SMTP" note is superseded.

## Anon key trips the secret scanner even though it's public-by-design
**What happened:** Committing `config.js` with the real Supabase anon key was blocked by the
ggshield pre-commit hook (generic JWT detector). The key IS public (RLS protects data), but the
policy/scanner treats any JWT as a secret.
**Rule going forward:** Keep `config.js` gitignored with the real values local-only; commit a
`config.example.js` template instead. Don't `--no-verify` past the secret scanner. (Deploy-time
config injection is a separate problem to solve for GitHub Pages.)
