-- Параметры студии генерации. Запуск: SQL Editor Supabase. Повторный запуск безопасен.
alter table public.ad_projects
  add column if not exists creatives_count integer,
  add column if not exists creative_language text,
  add column if not exists font_style text,
  add column if not exists style_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ad_projects_creatives_count_check'
  ) then
    alter table public.ad_projects
      add constraint ad_projects_creatives_count_check
      check (creatives_count is null or creatives_count between 1 and 5);
  end if;
end $$;
