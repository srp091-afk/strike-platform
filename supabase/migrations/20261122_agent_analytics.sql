-- Публичные идентификаторы аналитики веб-виджета. Это не секреты: их можно отдавать в конфиг виджета.

alter table public.agents
  add column if not exists ym_counter_id text,
  add column if not exists ga4_measurement_id text,
  add column if not exists ga4_enabled boolean not null default false;
