-- Сгенерированные креативы (картинка + тексты). Запуск: SQL Editor Supabase. Повторный запуск безопасен.
alter table public.ad_projects
  add column if not exists creatives_data jsonb;
