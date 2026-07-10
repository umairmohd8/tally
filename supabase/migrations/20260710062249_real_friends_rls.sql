-- friendship check (definer-safe; avoids recursive policy references)
create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.friendships
    where user_a = least(a, b) and user_b = greatest(a, b)
  );
$$;

-- profiles: friends may read name + avatar (owner policy stays as-is)
drop policy if exists profiles_friend_read on public.profiles;
create policy profiles_friend_read on public.profiles for select
  using (public.are_friends(id, auth.uid()));

-- habits: friends may read shared habits (owner policies stay as-is)
drop policy if exists habits_friend_read on public.habits;
create policy habits_friend_read on public.habits for select
  using (
    (share_mode = 'all' and public.are_friends(user_id, auth.uid()))
    or (share_mode = 'selected' and public.are_friends(user_id, auth.uid())
        and exists (select 1 from public.habit_shares hs
                    where hs.habit_id = habits.id and hs.friend_id = auth.uid()))
  );

-- habit_completions: visible iff the parent habit is visible to the caller
drop policy if exists hc_friend_read on public.habit_completions;
create policy hc_friend_read on public.habit_completions for select
  using (exists (
    select 1 from public.habits h
    where h.id = habit_completions.habit_id
      and ((h.share_mode = 'all' and public.are_friends(h.user_id, auth.uid()))
        or (h.share_mode = 'selected' and public.are_friends(h.user_id, auth.uid())
            and exists (select 1 from public.habit_shares hs
                        where hs.habit_id = h.id and hs.friend_id = auth.uid())))
  ));

-- friendships: participants may read/delete; inserts only via the RPC (no insert policy)
drop policy if exists friendships_read on public.friendships;
create policy friendships_read on public.friendships for select
  using (auth.uid() in (user_a, user_b));
drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships for delete
  using (auth.uid() in (user_a, user_b));

-- habit_shares: owner-only (must own the referenced habit)
drop policy if exists habit_shares_owner_all on public.habit_shares;
create policy habit_shares_owner_all on public.habit_shares for all
  using (exists (select 1 from public.habits h
                 where h.id = habit_shares.habit_id and h.user_id = auth.uid()))
  with check (exists (select 1 from public.habits h
                      where h.id = habit_shares.habit_id and h.user_id = auth.uid()));

-- add a friend by code (only privileged write path)
create or replace function public.add_friend_by_code(code text)
returns table (id uuid, name text, avatar_color text)
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  target uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  select p.id into target from public.profiles p where p.invite_code = upper(btrim(code));
  if target is null then raise exception 'not_found'; end if;
  if target = me then raise exception 'self'; end if;
  if exists (select 1 from public.friendships
             where user_a = least(me, target) and user_b = greatest(me, target)) then
    raise exception 'already_friends';
  end if;
  insert into public.friendships(user_a, user_b) values (least(me, target), greatest(me, target));
  return query select p.id, p.name, p.avatar_color from public.profiles p where p.id = target;
end;
$$;
