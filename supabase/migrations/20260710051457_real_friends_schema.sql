-- invite code generator: 8 chars from an ambiguity-free alphabet
create or replace function public.gen_invite_code() returns text
language sql volatile as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (floor(random()*31)::int)+1, 1), ''
  ) from generate_series(1, 8);
$$;

-- profiles.invite_code (backfill existing rows, then default + not null)
alter table public.profiles add column if not exists invite_code text unique;
update public.profiles set invite_code = public.gen_invite_code() where invite_code is null;
alter table public.profiles alter column invite_code set default public.gen_invite_code();
alter table public.profiles alter column invite_code set not null;

-- friendships: one canonical row per mutual pair (user_a < user_b)
create table if not exists public.friendships (
  user_a     uuid not null references public.profiles(id) on delete cascade,
  user_b     uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
alter table public.friendships enable row level security;

-- habit_shares: per-friend allow-list, used only when share_mode='selected'
create table if not exists public.habit_shares (
  habit_id  uuid not null references public.habits(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  primary key (habit_id, friend_id)
);
alter table public.habit_shares enable row level security;

-- habits.share_mode supersedes the shared boolean. We KEEP `shared` for now so the
-- currently-deployed old client (which still writes it) keeps working during rollout;
-- a follow-up migration drops it once the new client is live. The new client stops
-- writing `shared` — it is NOT NULL DEFAULT false, so its default applies on insert.
alter table public.habits add column if not exists share_mode text not null default 'private'
  check (share_mode in ('private','all','selected'));
update public.habits set share_mode = case when shared then 'all' else 'private' end
  where share_mode = 'private';
