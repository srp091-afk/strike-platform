-- Входящие лиды: сессия до диалога в Twilio. Отправку шаблона этот слой не делает.

create table if not exists public.lead_sessions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  phone text not null,
  lead_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (
    status in ('pending', 'template_sent', 'waiting_for_reply', 'active_24h_window', 'closed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_sessions_agent_idx
  on public.lead_sessions (agent_id, created_at desc);

alter table public.lead_sessions enable row level security;

drop policy if exists lead_sessions_owner on public.lead_sessions;
create policy lead_sessions_owner on public.lead_sessions
  for all using (
    exists (select 1 from public.agents a where a.id = agent_id and a.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.agents a where a.id = agent_id and a.user_id = auth.uid())
  );
