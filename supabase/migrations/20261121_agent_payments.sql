-- Приём оплат у агента. Секретные ключи пишет только service role и на клиент не отдаёт.
-- agent_payments хранит ссылки, которые бот создал в диалоге, и факт оплаты.

alter table public.agents
  add column if not exists stripe_secret_key text,
  add column if not exists stripe_webhook_secret text,
  add column if not exists stripe_currency text not null default 'usd',
  add column if not exists yookassa_shop_id text,
  add column if not exists yookassa_secret_key text,
  add column if not exists prodamus_shop_url text,
  add column if not exists prodamus_secret_key text,
  add column if not exists payment_success_message text,
  add column if not exists payment_return_url text;

create table if not exists public.agent_payments (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  channel text not null,
  chat_id text not null,
  provider text not null,
  external_id text,
  amount numeric(12, 2) not null,
  currency text not null,
  description text not null,
  payment_url text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint agent_payments_provider_check check (provider in ('stripe', 'yookassa', 'prodamus')),
  constraint agent_payments_status_check check (status in ('pending', 'succeeded', 'canceled', 'failed'))
);

create index if not exists agent_payments_agent_status_idx
  on public.agent_payments (agent_id, status);

create index if not exists agent_payments_external_id_idx
  on public.agent_payments (external_id);

alter table public.agent_payments enable row level security;

drop policy if exists agent_payments_owner on public.agent_payments;
create policy agent_payments_owner on public.agent_payments
  for all using (
    exists (select 1 from public.agents a where a.id = agent_id and a.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.agents a where a.id = agent_id and a.user_id = auth.uid())
  );
