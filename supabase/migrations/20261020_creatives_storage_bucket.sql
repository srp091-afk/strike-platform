-- Permanent storage for generated creative images.
-- Replicate delivery URLs are temporary; API code re-uploads files to this
-- public bucket and stores only its public URLs in creatives_data / images.
-- Re-run safe. Run in Supabase SQL Editor (or via supabase db push).

insert into storage.buckets (id, name, public)
values ('creatives', 'creatives', true)
on conflict (id) do update
set name = excluded.name,
    public = true;

-- Anyone can read a creative image (public bucket URLs are used in <img>/templates).
drop policy if exists creatives_public_read on storage.objects;
create policy creatives_public_read
  on storage.objects for select
  to public
  using (bucket_id = 'creatives');

-- Writes are performed by the server with the service-role key (bypasses RLS).
-- Keep an explicit service-role policy so intent is clear and auditable.
drop policy if exists creatives_service_role_write on storage.objects;
create policy creatives_service_role_write
  on storage.objects for all
  to service_role
  using (bucket_id = 'creatives')
  with check (bucket_id = 'creatives');
