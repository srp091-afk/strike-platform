-- План очереди можно пересчитать, не отправив уже опубликованные сообщения повторно.
-- queue_generation на кампании растёт при перезапуске. Старые задачи QStash несут прежний номер.
-- dispatch_after — когда строка должна уйти. По нему видно зависший или устаревший план.

alter table public.outreach_campaigns
  add column if not exists queue_generation integer not null default 0;

alter table public.outreach_logs
  add column if not exists dispatch_after timestamptz;

create index if not exists outreach_logs_dispatch_idx
  on public.outreach_logs (campaign_id, dispatch_after)
  where strike_status = 'queued';
