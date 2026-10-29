-- Run in the Supabase SQL editor if the apply script cannot reach it.
-- Each signed-in owner has one saved company. RLS keeps rows private.

create table if not exists public.company_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.company_saves enable row level security;

drop policy if exists "owner reads own save" on public.company_saves;
create policy "owner reads own save"
  on public.company_saves for select
  using (auth.uid() = user_id);

drop policy if exists "owner inserts own save" on public.company_saves;
create policy "owner inserts own save"
  on public.company_saves for insert
  with check (auth.uid() = user_id);

drop policy if exists "owner updates own save" on public.company_saves;
create policy "owner updates own save"
  on public.company_saves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "owner deletes own save" on public.company_saves;
create policy "owner deletes own save"
  on public.company_saves for delete
  using (auth.uid() = user_id);
