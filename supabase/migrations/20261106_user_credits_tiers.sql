-- STRIKE Credits (SC) и модульные тарифы. 100 SC = $1.
alter table public.profiles
  add column if not exists strike_credits integer not null default 500,
  add column if not exists tier_agents text not null default 'trial',
  add column if not exists tier_smm text not null default 'trial',
  add column if not exists tier_sites text not null default 'trial',
  add column if not exists is_bundle_active boolean not null default false;

alter table public.profiles drop constraint if exists profiles_strike_credits_check;
alter table public.profiles add constraint profiles_strike_credits_check check (strike_credits >= 0);

-- Журнал начислений SC по заказам: защита от двойного начисления при повторной доставке вебхука.
create table if not exists public.strike_credit_grants (
  order_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  credits integer not null check (credits > 0),
  created_at timestamptz not null default now()
);
alter table public.strike_credit_grants enable row level security;

create or replace function public.grant_strike_credits(p_user_id uuid, p_order_id text, p_credits integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  insert into public.strike_credit_grants (order_id, user_id, credits)
  values (p_order_id, p_user_id, p_credits)
  on conflict (order_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false;
  end if;
  update public.profiles set strike_credits = strike_credits + p_credits where id = p_user_id;
  return true;
end;
$$;

revoke all on function public.grant_strike_credits(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.grant_strike_credits(uuid, text, integer) to service_role;