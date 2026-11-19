-- Триггер входящего вебхука. id — секретный адрес /api/webhooks/inbound-lead/{id}.
-- mapping_config:
-- {
--   "phone": { "source": "payload", "value": "Phone" },
--   "variables": {
--     "1": { "source": "payload", "value": "Name" },
--     "2": { "source": "static", "value": "Tilda" }
--   }
-- }

create table if not exists public.webhook_triggers (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  template_id uuid not null references public.whatsapp_templates (id) on delete restrict,
  name text not null check (char_length(btrim(name)) > 0),
  mapping_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists webhook_triggers_agent_idx
  on public.webhook_triggers (agent_id, created_at desc);

alter table public.webhook_triggers enable row level security;

drop policy if exists webhook_triggers_owner on public.webhook_triggers;
create policy webhook_triggers_owner on public.webhook_triggers
  for all using (
    exists (select 1 from public.agents a where a.id = agent_id and a.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.agents a where a.id = agent_id and a.user_id = auth.uid())
    and exists (select 1 from public.whatsapp_templates t where t.id = template_id and t.user_id = auth.uid())
  );
