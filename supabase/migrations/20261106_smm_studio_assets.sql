-- AI-Видеостудия: публичный бакет smm_media и таблица ассетов проекта.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'smm_media',
  'smm_media',
  true,
  52428800,
  array['video/mp4', 'video/quicktime', 'audio/mpeg', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.smm_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.smm_projects (id) on delete cascade,
  file_url text not null,
  storage_path text,
  asset_type text not null,
  created_at timestamptz not null default now(),
  constraint smm_assets_type_check check (asset_type in ('user_upload', 'ai_generated'))
);

create index if not exists smm_assets_project_idx on public.smm_assets (project_id, created_at desc);

alter table public.smm_assets enable row level security;

drop policy if exists smm_assets_project_owner on public.smm_assets;
create policy smm_assets_project_owner on public.smm_assets
  for all
  using (exists (select 1 from public.smm_projects p where p.id = smm_assets.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.smm_projects p where p.id = smm_assets.project_id and p.user_id = auth.uid()));

-- Файлы лежат в папках {project_id}/...: загружать и управлять ими может только владелец проекта.
-- Чтение по публичной ссылке открыто (бакет public), чтобы видеодвижок мог скачать фон.
drop policy if exists smm_media_owner_insert on storage.objects;
create policy smm_media_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'smm_media'
    and exists (select 1 from public.smm_projects p where p.id::text = (storage.foldername(name))[1] and p.user_id = auth.uid())
  );

drop policy if exists smm_media_owner_select on storage.objects;
create policy smm_media_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'smm_media'
    and exists (select 1 from public.smm_projects p where p.id::text = (storage.foldername(name))[1] and p.user_id = auth.uid())
  );

drop policy if exists smm_media_owner_update on storage.objects;
create policy smm_media_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'smm_media'
    and exists (select 1 from public.smm_projects p where p.id::text = (storage.foldername(name))[1] and p.user_id = auth.uid())
  );

drop policy if exists smm_media_owner_delete on storage.objects;
create policy smm_media_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'smm_media'
    and exists (select 1 from public.smm_projects p where p.id::text = (storage.foldername(name))[1] and p.user_id = auth.uid())
  );
