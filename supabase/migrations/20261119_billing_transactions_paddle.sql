-- История оплат Paddle в существующей таблице billing_transactions.
alter table public.billing_transactions
  add column if not exists paddle_transaction_id text,
  add column if not exists payment_method text,
  add column if not exists amount numeric(12, 2),
  add column if not exists currency text not null default 'USD';

create unique index if not exists billing_transactions_paddle_id_key
  on public.billing_transactions (paddle_transaction_id)
  where paddle_transaction_id is not null;

drop function if exists public.billing_apply_order(uuid, text, text, text, numeric);

-- Пишет одну строку на заказ. Повтор того же id ничего не добавляет.
-- Для пополнения прибавляет к balance_usd фактически списанную сумму, в том числе 0.
create or replace function public.billing_apply_order(
  p_user_id uuid,
  p_order_id text,
  p_kind text,
  p_description text,
  p_amount numeric,
  p_method text default 'card',
  p_currency text default 'USD'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.billing_transactions (
    user_id,
    lemon_order_id,
    kind,
    description,
    amount_usd,
    method,
    status,
    paddle_transaction_id,
    payment_method,
    amount,
    currency
  )
  values (
    p_user_id,
    p_order_id,
    p_kind,
    p_description,
    p_amount,
    p_method,
    'paid',
    case when p_order_id like 'txn_%' then p_order_id else null end,
    p_method,
    p_amount,
    coalesce(nullif(p_currency, ''), 'USD')
  )
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

revoke all on function public.billing_apply_order(uuid, text, text, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.billing_apply_order(uuid, text, text, text, numeric, text, text) to service_role;
