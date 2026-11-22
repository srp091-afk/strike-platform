-- Канал Facebook Messenger на уровне агента.
-- Токен страницы хранится только на сервере и в клиент не отдаётся.

alter table public.agents
  add column if not exists fb_messenger_enabled boolean not null default false,
  add column if not exists fb_page_id text,
  add column if not exists fb_page_name text,
  add column if not exists fb_page_access_token text;

alter table public.integrations drop constraint if exists integrations_provider_check;

alter table public.integrations
  add constraint integrations_provider_check
  check (provider in ('whatsapp', 'instagram', 'telegram', 'widget', 'sms', 'viber', 'email', 'messenger'));
