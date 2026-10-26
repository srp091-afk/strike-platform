-- Биллинг (Lemon Squeezy): тариф и баланс в profiles + журнал транзакций.

alter table public.profiles
  add column if not exists plan text not null default 'free',
  add column if not exists subscription_status text,
  add column if not exists lemon_subscription_id text,
  add column if not exists lemon_customer_id text,
  add column if not exists plan_renews_at timestamptz,
  add column if not exists balance_usd numeric(12, 2) not null default 0;

create table if not exists public.billing_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Идентификатор заказа Lemon Squeezy: защита от повторной обработки вебхука.
  lemon_order_id text not null unique,
  kind text not null check (kind in ('topup', 'subscription')),
  description text not null,
  method text not null default 'card',
  amount_usd numeric(12, 2) not null,
  status text not null default 'paid',
  created_at timestamptz not null default now()
);

create index if not exists billing_transactions_user_created_idx
  on public.billing_transactions (user_id, created_at desc);

alter table public.billing_transactions enable row level security;

drop policy if exists "billing_transactions_select_own" on public.billing_transactions;
create policy "billing_transactions_select_own"
  on public.billing_transactions for select
  using (auth.uid() = user_id);

-- Атомарно: записать заказ (идемпотентно) и, для пополнения, увеличить баланс.
-- Возвращает true, если заказ обработан впервые.
create or replace function public.billing_apply_order(
  p_user_id uuid,
  p_order_id text,
  p_kind text,
  p_description text,
  p_amount numeric
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.billing_transactions (user_id, lemon_order_id, kind, description, amount_usd)
  values (p_user_id, p_order_id, p_kind, p_description, p_amount)
  on conflict (lemon_order_id) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return false;
  end if;

  if p_kind = 'topup' then
    update public.profiles
      set balance_usd = balance_usd + p_amount
      where id = p_user_id;
  end if;

  return true;
end;
$$;

revoke all on function public.billing_apply_order(uuid, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.billing_apply_order(uuid, text, text, text, numeric) to service_role;
