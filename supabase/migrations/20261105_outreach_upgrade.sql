-- Рассылки: расширенный маппинг базы, режим «точный текст», фиксированная пауза.

alter table public.outreach_campaigns
  add column if not exists name_column text,
  add column if not exists social_column text,
  add column if not exists message_type text not null default 'ai',
  add column if not exists fixed_message text not null default '',
  add column if not exists delay_mode text not null default 'random',
  add column if not exists fixed_delay_minutes integer not null default 5;

alter table public.outreach_campaigns
  drop constraint if exists outreach_campaigns_message_type_check;
alter table public.outreach_campaigns
  add constraint outreach_campaigns_message_type_check check (message_type in ('ai', 'fixed'));

alter table public.outreach_campaigns
  drop constraint if exists outreach_campaigns_delay_mode_check;
alter table public.outreach_campaigns
  add constraint outreach_campaigns_delay_mode_check check (delay_mode in ('random', 'fixed'));

alter table public.outreach_campaigns
  drop constraint if exists outreach_campaigns_fixed_delay_check;
alter table public.outreach_campaigns
  add constraint outreach_campaigns_fixed_delay_check check (fixed_delay_minutes between 0 and 1440);
