-- Флаг администратора платформы. Тарифные лимиты его не ограничивают.
alter table public.profiles
  add column if not exists is_admin boolean not null default false;
