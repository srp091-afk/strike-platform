-- Google Calendar у агента. Токен пишет только service role. Повторный запуск безопасен.
alter table public.agents
  add column if not exists gcal_refresh_token text,
  add column if not exists gcal_calendar_id text not null default 'primary',
  add column if not exists gcal_timezone text not null default 'UTC';
