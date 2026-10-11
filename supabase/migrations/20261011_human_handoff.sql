alter table public.agents
  add column if not exists human_handoff_duration text not null default '1_hour';

alter table public.agents
  drop constraint if exists agents_human_handoff_duration_check;

alter table public.agents
  add constraint agents_human_handoff_duration_check
  check (human_handoff_duration in ('1_hour', '3_hours', '24_hours', 'forever'));

alter table public.conversations
  add column if not exists bot_paused_until timestamptz;

update public.conversations
set bot_paused_until = now() + interval '100 years'
where is_bot_active = false
  and bot_paused_until is null;
