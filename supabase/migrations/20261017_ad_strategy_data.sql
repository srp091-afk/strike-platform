-- Стратегия и тексты кампании. Запуск: SQL Editor Supabase. Повторный запуск безопасен.
alter table public.ad_projects
  add column if not exists strategy_data jsonb;
