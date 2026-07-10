-- Fix: infinite recursion (42P17) between habits and habit_shares RLS.
--
-- The real_friends RLS introduced a policy cycle the original migration missed:
--   habits.habits_friend_read  -> subquery on habit_shares
--   habit_shares_owner_all     -> subquery on habits
-- Evaluating either table's RLS re-triggered the other's, looping forever. Because
-- habit_completions' "own completions" policy also subqueries habits, this surfaced
-- as completion DELETEs (unchecking a habit) failing with 42P17 — silently swallowed
-- by the client's fire-and-forget .catch, so unchecks never persisted.
--
-- Break the cycle the same way are_friends() does for friendships: a SECURITY DEFINER
-- helper that checks habit ownership without re-entering RLS. Access semantics are
-- unchanged (habit_shares stays owner-only).

create or replace function public.owns_habit(hid uuid, uid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists(select 1 from public.habits h where h.id = hid and h.user_id = uid);
  $$;

drop policy if exists habit_shares_owner_all on public.habit_shares;
create policy habit_shares_owner_all on public.habit_shares for all
  using (public.owns_habit(habit_id, auth.uid()))
  with check (public.owns_habit(habit_id, auth.uid()));
