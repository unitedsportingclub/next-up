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

alter table public.player_profiles
  add column if not exists profile_image_path text,
  add column if not exists highlight_video_url text;

create table if not exists public.nextup_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.nextup_admins enable row level security;

drop policy if exists "Admins can view their own access" on public.nextup_admins;
create policy "Admins can view their own access"
on public.nextup_admins
for select
to authenticated
using (user_id = auth.uid());

revoke all on public.nextup_admins from public, anon, authenticated;
grant select (user_id) on public.nextup_admins to authenticated;

create or replace function public.is_nextup_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nextup_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_nextup_admin() from public;
grant execute on function public.is_nextup_admin() to authenticated;

alter table public.player_profiles enable row level security;

drop policy if exists "Approved profiles are public" on public.player_profiles;
drop policy if exists "Admins can read player profiles" on public.player_profiles;
create policy "Admins can read player profiles"
on public.player_profiles
for select
to authenticated
using (public.is_nextup_admin());

drop policy if exists "Admins can review pending profiles" on public.player_profiles;
create policy "Admins can review pending profiles"
on public.player_profiles
for update
to authenticated
using (public.is_nextup_admin() and status = 'pending')
with check (public.is_nextup_admin() and status in ('approved', 'rejected'));

revoke select (name, position, age, location, club, profile_image_path, highlight_video_url)
on public.player_profiles from public, anon, authenticated;
revoke select on public.player_profiles from public, anon, authenticated;
grant select on public.player_profiles to authenticated;
revoke update on public.player_profiles from public, anon, authenticated;
grant update (status) on public.player_profiles to authenticated;

create or replace view public.approved_player_profiles as
select name, position, age, location, club, profile_image_path, highlight_video_url, created_at
from public.player_profiles
where status = 'approved';

revoke all on public.approved_player_profiles from public, anon, authenticated;
grant select on public.approved_player_profiles to anon, authenticated;

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-images',
  'player-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view player photos" on storage.objects;
create policy "Public can view player photos"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'player-images');

drop policy if exists "Visitors can upload player photos" on storage.objects;
create policy "Visitors can upload player photos"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'player-images'
  and (storage.foldername(name))[1] = 'profiles'
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
);

