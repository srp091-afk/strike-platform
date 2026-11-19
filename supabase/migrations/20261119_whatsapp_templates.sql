-- Шаблоны WhatsApp, созданные через Twilio Content API.
-- Имя уникально на весь аккаунт: один WABA, одно имя шаблона.

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_]+$'),
  language text not null check (language ~ '^[a-z]{2}(_[A-Z]{2})?$'),
  body text not null check (char_length(btrim(body)) > 0),
  twilio_content_sid text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_templates_name_unique unique (name),
  constraint whatsapp_templates_sid_unique unique (twilio_content_sid)
);

create index if not exists whatsapp_templates_user_idx
  on public.whatsapp_templates (user_id, created_at desc);

alter table public.whatsapp_templates enable row level security;

drop policy if exists whatsapp_templates_owner on public.whatsapp_templates;
create policy whatsapp_templates_owner on public.whatsapp_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
