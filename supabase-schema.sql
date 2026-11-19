create table if not exists public.player_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position text not null check (position in ('Forward', 'Midfielder', 'Defender', 'Goalkeeper')),
  age integer not null check (age between 13 and 45),
  location text not null,
  club text not null default '',
  payment_reference text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.player_profiles enable row level security;

drop policy if exists "Approved profiles are public" on public.player_profiles;
create policy "Approved profiles are public"
on public.player_profiles
for select
to anon, authenticated
using (status = 'approved');

drop policy if exists "Visitors can submit pending profiles" on public.player_profiles;
create policy "Visitors can submit pending profiles"
on public.player_profiles
for insert
to anon, authenticated
with check (
  status = 'pending'
  and payment_reference is not null
  and char_length(payment_reference) between 1 and 100
);
