-- Рассылки: язык первого сообщения (AI-режим).
alter table public.outreach_campaigns
  add column if not exists language text not null default 'Русский';
