-- Канал SMS (Twilio) на уровне агента и диалоги SMS в общих чатах.
-- Auth Token хранится только на сервере и в клиент не отдаётся.

alter table public.agents
  add column if not exists twilio_sms_enabled boolean not null default false,
  add column if not exists twilio_account_sid text,
  add column if not exists twilio_auth_token text,
  add column if not exists twilio_sms_number text;

alter table public.integrations drop constraint if exists integrations_provider_check;

alter table public.integrations
  add constraint integrations_provider_check
  check (provider in ('whatsapp', 'instagram', 'telegram', 'widget', 'sms'));
