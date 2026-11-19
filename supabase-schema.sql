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
