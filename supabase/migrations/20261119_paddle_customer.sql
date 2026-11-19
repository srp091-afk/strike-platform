-- Идентификаторы Paddle Billing для клиентского портала. Применяет владелец проекта.
alter table public.profiles
  add column if not exists paddle_customer_id text,
  add column if not exists paddle_subscription_id text;
