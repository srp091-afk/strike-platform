-- Проактивные кампании: источники, сценарии и очередь утверждения.
-- Доступ владельца через RLS. Воркер и серверные действия ходят service role.

create table if not exists public.proactive_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  type text not null check (type in ('csv', 'google_sheets', 'pipedrive')),
  config jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'error')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  constraint proactive_sources_name_len check (char_length(name) between 1 and 120),
  constraint proactive_sources_config_object check (jsonb_typeof(config) = 'object')
);

create index if not exists proactive_sources_user_idx
  on public.proactive_sources (user_id, created_at desc);

create table if not exists public.proactive_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  source_id uuid not null references public.proactive_sources (id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('whatsapp', 'telegram', 'email')),
  goal_prompt text not null default '',
  require_approval boolean not null default true,
  schedule_cron text,
  delivery_config jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('active', 'paused', 'draft')),
  created_at timestamptz not null default now(),
  constraint proactive_campaigns_name_len check (char_length(name) between 1 and 120),
  constraint proactive_campaigns_delivery_object check (jsonb_typeof(delivery_config) = 'object')
);

create index if not exists proactive_campaigns_user_idx
  on public.proactive_campaigns (user_id, created_at desc);
create index if not exists proactive_campaigns_source_idx
  on public.proactive_campaigns (source_id);

create table if not exists public.agent_action_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  campaign_id uuid not null references public.proactive_campaigns (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  source_id uuid not null references public.proactive_sources (id) on delete cascade,
  external_entity_id text not null,
  contact_name text not null default '',
  contact_target text not null default '',
  channel text not null check (channel in ('whatsapp', 'telegram', 'email')),
  ai_reasoning text not null default '',
  context_payload jsonb not null default '{}'::jsonb,
  draft_subject text,
  draft_message text not null default '',
  post_action jsonb,
  status text not null default 'pending_approval' check (
    status in ('pending_approval', 'scheduled', 'sending', 'sent', 'failed', 'rejected')
  ),
  scheduled_for timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  constraint agent_action_queue_entity_len check (char_length(external_entity_id) between 1 and 200),
  constraint agent_action_queue_context_object check (jsonb_typeof(context_payload) = 'object')
);

create index if not exists agent_action_queue_status_schedule_idx
  on public.agent_action_queue (status, scheduled_for);

create index if not exists agent_action_queue_user_status_idx
  on public.agent_action_queue (user_id, status, created_at desc);

create unique index if not exists agent_action_queue_active_entity_idx
  on public.agent_action_queue (campaign_id, external_entity_id)
  where status in ('pending_approval', 'scheduled', 'sending', 'sent', 'failed');

alter table public.proactive_sources enable row level security;
alter table public.proactive_campaigns enable row level security;
alter table public.agent_action_queue enable row level security;

drop policy if exists proactive_sources_owner on public.proactive_sources;
create policy proactive_sources_owner on public.proactive_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists proactive_campaigns_owner on public.proactive_campaigns;
create policy proactive_campaigns_owner on public.proactive_campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists agent_action_queue_owner on public.agent_action_queue;
create policy agent_action_queue_owner on public.agent_action_queue
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Атомарный захват подошедших задач. service role обходит RLS, анониму функцию не отдаём.
create or replace function public.claim_proactive_actions(p_limit integer, p_user_id uuid)
returns setof public.agent_action_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.agent_action_queue q
     set status = 'sending'
   where q.id in (
     select q2.id
     from public.agent_action_queue q2
     join public.proactive_campaigns c on c.id = q2.campaign_id
     where q2.status = 'scheduled'
       and q2.scheduled_for <= now()
       and c.status = 'active'
       and (p_user_id is null or q2.user_id = p_user_id)
     order by q2.scheduled_for
     limit greatest(1, least(coalesce(p_limit, 20), 100))
     for update of q2 skip locked
   )
  returning q.*;
end;
$$;

revoke all on function public.claim_proactive_actions(integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_proactive_actions(integer, uuid) to service_role;
