-- Telegram: поддержка двух типов подключения канала агента.
--   telegram_type = 'bot'     -> telegram_bot_token (токен от @BotFather)
--   telegram_type = 'userbot' -> telegram_phone + telegram_api_id + telegram_api_hash (личный аккаунт)
-- Старые колонки tg_bot_token / tg_bot_username / tg_is_active остаются:
-- tg_bot_token зеркалит telegram_bot_token для вебхука /api/webhooks/telegram/[token].

alter table public.agents
  add column if not exists telegram_type text not null default 'bot',
  add column if not exists telegram_bot_token text,
  add column if not exists telegram_phone text,
  add column if not exists telegram_api_id text,
  add column if not exists telegram_api_hash text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agents_telegram_type_check'
  ) then
    alter table public.agents
      add constraint agents_telegram_type_check
      check (telegram_type in ('bot', 'userbot'));
  end if;
end $$;

-- Бэкфилл для уже подключённых ботов.
update public.agents
set
  telegram_type = 'bot',
  telegram_bot_token = tg_bot_token
where tg_bot_token is not null
  and telegram_bot_token is null;

create unique index if not exists agents_telegram_bot_token_key
  on public.agents (telegram_bot_token)
  where telegram_bot_token is not null;

create unique index if not exists agents_telegram_phone_key
  on public.agents (telegram_phone)
  where telegram_phone is not null;
