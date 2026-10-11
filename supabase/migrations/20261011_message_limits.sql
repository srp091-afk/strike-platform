alter table public.agents
  add column if not exists limit_agent_messages integer not null default 0;

alter table public.agents
  add column if not exists limit_client_messages integer not null default 0;

alter table public.agents
  add column if not exists limit_total_messages integer not null default 0;

alter table public.agents
  drop constraint if exists agents_message_limits_nonnegative;

alter table public.agents
  add constraint agents_message_limits_nonnegative
  check (
    limit_agent_messages >= 0
    and limit_client_messages >= 0
    and limit_total_messages >= 0
  );

create index if not exists messages_conversation_role_idx
  on public.messages (conversation_id, role);
