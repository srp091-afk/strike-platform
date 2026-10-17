-- Оформленный бриф для UI-карточки. Запуск: SQL Editor Supabase. Повторный запуск безопасен.
alter table public.ad_projects
  add column if not exists formatted_brief jsonb;
