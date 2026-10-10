-- STRIKE — схема Supabase (PostgreSQL)
-- Запуск: SQL Editor в проекте Supabase, один раз на пустой public schema.
-- Повторный запуск безопасен: таблицы создаются с IF NOT EXISTS, политики пересоздаются.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- agents
-- ---------------------------------------------------------------------------

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  system_prompt text not null default '',
  model text not null default 'gpt-4o-mini',
  temperature numeric(3, 2) not null default 0.70,
  is_active boolean not null default true,
  active_channels jsonb not null default '{"whatsapp": true, "telegram": false, "instagram": false}'::jsonb,
  response_delay integer not null default 0,
  split_messages boolean not null default false,
  wa_instance_id text,
  wa_api_token text,
  wa_phone_number text,
  wa_is_active boolean not null default false,
  tg_bot_token text,
  tg_bot_username text,
  tg_is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agents_temperature_range check (temperature >= 0 and temperature <= 2),
  constraint agents_response_delay_nonnegative check (response_delay >= 0)
);

create index if not exists agents_user_id_idx on public.agents (user_id);
create unique index if not exists agents_wa_instance_id_key
  on public.agents (wa_instance_id)
  where wa_instance_id is not null;
create unique index if not exists agents_tg_bot_token_key
  on public.agents (tg_bot_token)
  where tg_bot_token is not null;

drop trigger if exists agents_set_updated_at on public.agents;
create trigger agents_set_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- integrations
-- Каналы: whatsapp (GreenAPI), instagram, telegram.
-- Секреты живут отдельно и недоступны клиенту.
-- ---------------------------------------------------------------------------

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete set null,
  provider text not null,
  name text not null,
  status text not null default 'disconnected',
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrations_provider_check
    check (provider in ('whatsapp', 'instagram', 'telegram')),
  constraint integrations_status_check
    check (status in ('connected', 'disconnected', 'error'))
);

create index if not exists integrations_user_id_idx on public.integrations (user_id);
create index if not exists integrations_agent_id_idx on public.integrations (agent_id);
create index if not exists integrations_provider_external_idx
  on public.integrations (provider, external_id);

drop trigger if exists integrations_set_updated_at on public.integrations;
create trigger integrations_set_updated_at
  before update on public.integrations
  for each row execute function public.set_updated_at();

-- Ожидаемый JSON в credentials:
-- whatsapp:  { "idInstance": "", "apiTokenInstance": "", "apiUrl": "https://api.green-api.com" }
-- instagram: { "pageId": "", "accessToken": "" }
-- telegram:  { "botToken": "" }

create table if not exists public.integration_secrets (
  integration_id uuid primary key references public.integrations (id) on delete cascade,
  credentials jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists integration_secrets_set_updated_at on public.integration_secrets;
create trigger integration_secrets_set_updated_at
  before update on public.integration_secrets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- conversations / messages
-- chunk_index + chunk_group_id: один ответ модели, разрезанный по пустой строке.
-- ---------------------------------------------------------------------------

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete set null,
  integration_id uuid references public.integrations (id) on delete cascade,
  external_chat_id text not null,
  contact_name text,
  contact_handle text,
  last_message_preview text,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  is_bot_active boolean not null default true,
  is_processing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_external_unique unique (integration_id, external_chat_id)
);

create index if not exists conversations_user_last_message_idx
  on public.conversations (user_id, last_message_at desc);
create index if not exists conversations_integration_id_idx
  on public.conversations (integration_id);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null,
  content text not null,
  chunk_index integer,
  chunk_group_id uuid,
  status text not null default 'sent',
  external_message_id text,
  created_at timestamptz not null default now(),
  constraint messages_role_check check (role in ('user', 'assistant', 'system')),
  constraint messages_status_check check (status in ('pending', 'sent', 'failed'))
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index if not exists messages_chunk_group_idx
  on public.messages (chunk_group_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- integration_secrets: политик нет. Читает только service_role (вебхуки и LLM).
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.agents enable row level security;
alter table public.integrations enable row level security;
alter table public.integration_secrets enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists agents_all_own on public.agents;
create policy agents_all_own
  on public.agents for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists integrations_all_own on public.integrations;
create policy integrations_all_own
  on public.integrations for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists conversations_all_own on public.conversations;
create policy conversations_all_own
  on public.conversations for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists messages_all_own on public.messages;
create policy messages_all_own
  on public.messages for all
  to authenticated
  using (
    exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

grant usage on schema public to authenticated, service_role;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.agents to authenticated;
grant select, insert, update, delete on public.integrations to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;

grant all on public.profiles to service_role;
grant all on public.agents to service_role;
grant all on public.integrations to service_role;
grant all on public.integration_secrets to service_role;
grant all on public.conversations to service_role;
grant all on public.messages to service_role;
