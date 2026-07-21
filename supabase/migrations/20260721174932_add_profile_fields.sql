-- add new columns to profiles table
alter table public.profiles
  add column if not exists bio text default '',
  add column if not exists avatar_emoji text default '',
  add column if not exists weekly_target integer default 5;
