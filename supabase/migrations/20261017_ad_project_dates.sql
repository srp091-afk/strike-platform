-- Даты обновления и рекомендуемой замены креативов. Запуск: SQL Editor Supabase. Повторный запуск безопасен.
alter table public.ad_projects
  add column if not exists updated_at timestamptz,
  add column if not exists creatives_replace_at timestamptz;

update public.ad_projects
set
  updated_at = coalesce(updated_at, created_at, now()),
  creatives_replace_at = coalesce(creatives_replace_at, created_at + interval '14 days', now() + interval '14 days')
where updated_at is null
   or creatives_replace_at is null;
