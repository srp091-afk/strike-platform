-- MTProto (userbot): StringSession GramJS после успешного входа в личный аккаунт.
-- Значение равно полному доступу к аккаунту: не отдавать на публичные/клиентские
-- поверхности сверх экрана настроек владельца, не логировать.

alter table public.agents
  add column if not exists telegram_session text;

comment on column public.agents.telegram_session is
  'GramJS StringSession for telegram userbot (secret, full account access)';
