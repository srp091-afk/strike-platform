-- Умные напоминания (follow-up): настройки агента и состояние диалога.

alter table public.agents
  add column if not exists followup_enabled boolean not null default false,
  add column if not exists followup_interval_hours integer not null default 24,
  add column if not exists followup_max_count integer not null default 2,
  add column if not exists followup_template text;

alter table public.agents
  drop constraint if exists agents_followup_values_check;
alter table public.agents
  add constraint agents_followup_values_check
  check (followup_interval_hours >= 1 and followup_max_count >= 0);

alter table public.conversations
  add column if not exists last_agent_message_at timestamptz,
  add column if not exists push_count integer not null default 0,
  add column if not exists is_waiting_for_user boolean not null default false;

-- Крон выбирает только диалоги, где бот ждёт ответа клиента.
create index if not exists conversations_followup_idx
  on public.conversations (last_agent_message_at)
  where is_waiting_for_user = true;
