-- Личный аккаунт Twilio пользователя. Номер уникален: входящий вебхук находит владельца по To.

create table if not exists public.user_twilio_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  account_sid text not null,
  auth_token text not null,
  whatsapp_number text not null check (whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_twilio_configs_number_unique unique (whatsapp_number)
);

alter table public.user_twilio_configs enable row level security;

drop policy if exists user_twilio_configs_owner on public.user_twilio_configs;
create policy user_twilio_configs_owner on public.user_twilio_configs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
