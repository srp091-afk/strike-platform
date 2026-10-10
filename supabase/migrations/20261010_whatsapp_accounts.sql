create table if not exists public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  instance_id text not null,
  api_token text not null,
  agent_id uuid not null references public.agents (id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint whatsapp_accounts_instance_unique unique (instance_id)
);

create index if not exists whatsapp_accounts_agent_id_idx on public.whatsapp_accounts (agent_id);

alter table public.whatsapp_accounts enable row level security;
