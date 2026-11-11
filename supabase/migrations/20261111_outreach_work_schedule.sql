-- Режим работы кампании. Существующие кампании остаются круглосуточными,
-- пока пользователь сам не задаст окно. Новые строки получают 09:00–18:00 UTC.

alter table public.outreach_campaigns
  add column if not exists work_time_start text,
  add column if not exists work_time_end text,
  add column if not exists timezone text;

update public.outreach_campaigns
set
  work_time_start = coalesce(work_time_start, '00:00'),
  work_time_end = coalesce(work_time_end, '23:59'),
  timezone = coalesce(timezone, 'UTC')
where work_time_start is null
   or work_time_end is null
   or timezone is null;

alter table public.outreach_campaigns
  alter column work_time_start set default '09:00',
  alter column work_time_end set default '18:00',
  alter column timezone set default 'UTC';

alter table public.outreach_campaigns
  alter column work_time_start set not null,
  alter column work_time_end set not null,
  alter column timezone set not null;

do $$
begin
  alter table public.outreach_campaigns
    add constraint outreach_work_time_start_format
    check (work_time_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.outreach_campaigns
    add constraint outreach_work_time_end_format
    check (work_time_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.outreach_campaigns
    add constraint outreach_work_window
    check (work_time_start < work_time_end);
exception
  when duplicate_object then null;
end $$;

create index if not exists outreach_logs_campaign_sent_idx
  on public.outreach_logs (campaign_id, strike_sent_time)
  where strike_status = 'success';
