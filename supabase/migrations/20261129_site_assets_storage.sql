-- Public media and lead-magnet files for quiz sites.
-- Reads are public. Direct client writes stay inside the owner's folder.
-- The upload API uses the service role and checks site ownership first.
-- Re-run safe. Apply in the Supabase SQL editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-assets',
  'site-assets',
  true,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'video/mp4',
    'video/webm',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip'
  ]
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists site_assets_public_read on storage.objects;
create policy site_assets_public_read
  on storage.objects for select
  to public
  using (bucket_id = 'site-assets');

drop policy if exists site_assets_owner_insert on storage.objects;
create policy site_assets_owner_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'site-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists site_assets_owner_update on storage.objects;
create policy site_assets_owner_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'site-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'site-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists site_assets_owner_delete on storage.objects;
create policy site_assets_owner_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'site-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
