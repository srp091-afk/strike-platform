-- Онлайн-запись агента: YCLIENTS / Altegio и прямая ссылка DIKIDI.
-- Partner Token и User Token пишет только service role. На клиент они не отдаются.

alter table public.agents
  add column if not exists yclients_platform text,
  add column if not exists yclients_company_id text,
  add column if not exists yclients_partner_token text,
  add column if not exists yclients_user_token text,
  add column if not exists dikidi_booking_url text;
