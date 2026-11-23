-- Дата окончания текущего оплаченного периода Start / Pro / Agency.
alter table public.profiles
  add column if not exists subscription_ends_at timestamptz;
