-- Списание SC за ответ агента больше не пишет строку в историю платежей.
-- Старые строки «Ответ агента» убираем: в истории остаются только оплаты.

delete from public.billing_transactions
where kind = 'usage'
   or description like 'Ответ агента%';

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
begin
  if p_credits < 1 then
    raise exception 'credits must be positive';
  end if;

  update public.profiles
     set strike_credits = strike_credits - p_credits
   where id = p_user_id
     and strike_credits >= p_credits
   returning strike_credits into remaining;

  if remaining is null then
    return -1;
  end if;

  return remaining;
end;
$$;

revoke all on function public.spend_strike_credits(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.spend_strike_credits(uuid, integer, text, text) to service_role;
