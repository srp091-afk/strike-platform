-- Битрикс24 у агента. URL входящего вебхука пишет только service role и на клиент не отдаётся.
-- crm_chat_links общая с другими CRM: одна строка на диалог, колонки Битрикс24 nullable.

alter table public.agents
  add column if not exists bitrix_webhook_url text,
  add column if not exists bitrix_openline_id text,
  add column if not exists bitrix_responsible_id bigint,
  add column if not exists bitrix_handoff_status_id text;

create table if not exists public.crm_chat_links (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  channel text not null,
  chat_id text not null,
  amo_contact_id bigint,
  amo_lead_id bigint,
  pipedrive_person_id bigint,
  pipedrive_deal_id bigint,
  bitrix_lead_id bigint,
  bitrix_session_id text,
  created_at timestamptz not null default now(),
  constraint crm_chat_links_agent_channel_chat unique (agent_id, channel, chat_id)
);

alter table public.crm_chat_links
  add column if not exists bitrix_lead_id bigint,
  add column if not exists bitrix_session_id text;

alter table public.crm_chat_links
  alter column amo_contact_id drop not null,
  alter column amo_lead_id drop not null;

create index if not exists crm_chat_links_bitrix_lead_idx
  on public.crm_chat_links (agent_id, bitrix_lead_id);

alter table public.crm_chat_links enable row level security;

drop policy if exists crm_chat_links_owner on public.crm_chat_links;
create policy crm_chat_links_owner on public.crm_chat_links
  for all using (
    exists (select 1 from public.agents a where a.id = agent_id and a.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.agents a where a.id = agent_id and a.user_id = auth.uid())
  );
