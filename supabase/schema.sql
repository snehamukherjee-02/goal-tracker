-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- One row per user holds all of that user's tracker data.

create table if not exists public.tracker_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: each logged-in user can only see and change THEIR OWN row.
alter table public.tracker_state enable row level security;

drop policy if exists "Read own state"   on public.tracker_state;
drop policy if exists "Insert own state" on public.tracker_state;
drop policy if exists "Update own state" on public.tracker_state;
drop policy if exists "Delete own state" on public.tracker_state;

create policy "Read own state"   on public.tracker_state for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Insert own state" on public.tracker_state for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own state" on public.tracker_state for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own state" on public.tracker_state for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.tracker_state from anon;
grant select, insert, update, delete on public.tracker_state to authenticated;
