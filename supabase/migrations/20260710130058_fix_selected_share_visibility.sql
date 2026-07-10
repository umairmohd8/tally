-- Fix: 'selected'-shared habits were invisible to the very friends they were shared with.
--
-- habits_friend_read / hc_friend_read checked the allow-list with an inline
--   EXISTS (select 1 from habit_shares where habit_id = ... and friend_id = auth.uid())
-- but habit_shares is owner-only RLS (habit_shares_owner_all = owns_habit). So when the
-- FRIEND (not the owner) evaluated the policy, that EXISTS saw zero rows — the friend has
-- no read access to the allow-list entry naming them — and the selected habit (and its
-- completions) stayed hidden. The 'all' path worked; only 'selected' was affected.
--
-- Same fix as are_friends()/owns_habit(): a SECURITY DEFINER helper that checks the
-- allow-list without re-entering habit_shares RLS. Access semantics are unchanged
-- (habit_shares stays owner-only for writes/direct reads).

create or replace function public.is_shared_with(hid uuid, uid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists(select 1 from public.habit_shares hs where hs.habit_id = hid and hs.friend_id = uid);
  $$;

drop policy if exists habits_friend_read on public.habits;
create policy habits_friend_read on public.habits for select
  using (
    (share_mode = 'all' and public.are_friends(user_id, auth.uid()))
    or (share_mode = 'selected' and public.are_friends(user_id, auth.uid())
        and public.is_shared_with(habits.id, auth.uid()))
  );

drop policy if exists hc_friend_read on public.habit_completions;
create policy hc_friend_read on public.habit_completions for select
  using (exists (
    select 1 from public.habits h
    where h.id = habit_completions.habit_id
      and ((h.share_mode = 'all' and public.are_friends(h.user_id, auth.uid()))
        or (h.share_mode = 'selected' and public.are_friends(h.user_id, auth.uid())
            and public.is_shared_with(h.id, auth.uid())))
  ));
