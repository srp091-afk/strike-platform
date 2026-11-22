-- Каналы Viber и Email (IMAP/SMTP) на уровне агента.
-- Auth Token и пароль почты хранятся только на сервере и в клиент не отдаются.

alter table public.agents
  add column if not exists viber_enabled boolean not null default false,
  add column if not exists viber_auth_token text,
  add column if not exists viber_bot_name text,
  add column if not exists email_enabled boolean not null default false,
  add column if not exists email_address text,
  add column if not exists email_imap_host text,
  add column if not exists email_imap_port integer default 993,
  add column if not exists email_smtp_host text,
  add column if not exists email_smtp_port integer default 465,
  add column if not exists email_password text,
  add column if not exists email_last_uid bigint;

alter table public.integrations drop constraint if exists integrations_provider_check;

alter table public.integrations
  add constraint integrations_provider_check
  check (provider in ('whatsapp', 'instagram', 'telegram', 'widget', 'sms', 'viber', 'email'));
