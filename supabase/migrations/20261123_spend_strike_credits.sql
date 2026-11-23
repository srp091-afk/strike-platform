-- Атомарное списание STRIKE Credits за ответ агента и строка в истории транзакций.

alter table public.billing_transactions
  add column if not exists credits integer;

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'billing_transactions'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%kind%';
  if constraint_name is not null then
    execute format('alter table public.billing_transactions drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.billing_transactions
  add constraint billing_transactions_kind_check
  check (kind in ('topup', 'subscription', 'usage'));

-- Списывает SC, только если баланса хватает. Повтор того же order id ничего не делает.
-- Возвращает остаток или -1, если кредитов не хватило.
create or replace function public.spend_strike_credits(
  p_user_id uuid,
  p_credits integer,
  p_order_id text,
  p_description text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
  inserted_count integer;
begin
  if p_credits < 1 then
    raise exception 'credits must be positive';
  end if;

  insert into public.billing_transactions (
    user_id,
    lemon_order_id,
    kind,
    description,
    amount_usd,
    method,
    status,
    payment_method,
    amount,
    currency,
    credits
  )
  values (
    p_user_id,
    p_order_id,
    'usage',
    p_description,
    0,
    'SC',
    'paid',
    'SC',
    0,
    'SC',
    -p_credits
  )
  on conflict (lemon_order_id) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    select strike_credits into remaining from public.profiles where id = p_user_id;
    return coalesce(remaining, 0);
  end if;

  update public.profiles
     set strike_credits = strike_credits - p_credits
   where id = p_user_id
     and strike_credits >= p_credits
   returning strike_credits into remaining;

  if remaining is null then
    delete from public.billing_transactions where lemon_order_id = p_order_id;
    return -1;
  end if;

  return remaining;
end;
$$;

revoke all on function public.spend_strike_credits(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.spend_strike_credits(uuid, integer, text, text) to service_role;
