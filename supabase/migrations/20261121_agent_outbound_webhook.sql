-- Исходящий вебхук агента: URL приёмника и необязательный секрет подписи.
alter table public.agents
  add column if not exists webhook_url text,
  add column if not exists webhook_secret text;
