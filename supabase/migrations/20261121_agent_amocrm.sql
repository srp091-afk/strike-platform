-- amoCRM / Kommo у агента и связка диалога STRIKE со сделкой.
-- Токен пишет только service role и на клиент не отдаётся.

alter table public.agents
  add column if not exists amo_domain text,
  add column if not exists amo_access_token text,
  add column if not exists amo_pipeline_id bigint,
  add column if not exists amo_handoff_status_id bigint;

create table if not exists public.crm_chat_links (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  channel text not null,
  chat_id text not null,
  amo_contact_id bigint not null,
  amo_lead_id bigint not null,
  created_at timestamptz not null default now(),
  constraint crm_chat_links_agent_channel_chat unique (agent_id, channel, chat_id)
);

create index if not exists crm_chat_links_lead_idx
  on public.crm_chat_links (agent_id, amo_lead_id);

alter table public.crm_chat_links enable row level security;

drop policy if exists crm_chat_links_owner on public.crm_chat_links;
create policy crm_chat_links_owner on public.crm_chat_links
  for all using (
    exists (select 1 from public.agents a where a.id = agent_id and a.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.agents a where a.id = agent_id and a.user_id = auth.uid())
  );
