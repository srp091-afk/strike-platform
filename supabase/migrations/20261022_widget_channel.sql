-- Веб-виджет как канал в общей таблице integrations.
-- Диалоги виджета тогда попадают в раздел «Чаты» рядом с Telegram и WhatsApp.

alter table public.integrations drop constraint if exists integrations_provider_check;

alter table public.integrations
  add constraint integrations_provider_check
  check (provider in ('whatsapp', 'instagram', 'telegram', 'widget'));
