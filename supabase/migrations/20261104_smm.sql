-- SMM-модуль: подключённые соцсети, стратегия, контент-план, ключи видеодвижка.
-- Все таблицы принадлежат пользователю (user_id) и закрыты RLS «только владелец».
-- Токены и API-ключи читает и пишет только сервер (service_role); в браузер их отдавать нельзя.

create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  account_name text not null,
  provider_account_id text not null,
  access_token text,
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_accounts_provider_check check (provider in ('instagram', 'facebook')),
  constraint social_accounts_status_check check (status in ('connected', 'expired', 'disconnected', 'error')),
  constraint social_accounts_unique unique (user_id, provider, provider_account_id)
);

create index if not exists social_accounts_user_idx on public.social_accounts (user_id);

create table if not exists public.smm_strategy (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  project_description text not null default '',
  tone_of_voice text not null default 'friendly',
  posting_schedule jsonb not null default '{"days":["mon","wed","fri"],"time":"12:00","posts_per_week":3}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint smm_strategy_tone_check
    check (tone_of_voice in ('friendly', 'expert', 'bold', 'premium', 'playful'))
);

create table if not exists public.smm_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  social_account_id uuid references public.social_accounts (id) on delete set null,
  content_text text not null default '',
  media_urls text[] not null default '{}',
  scheduled_time timestamptz,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint smm_posts_status_check
    check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed'))
);

create index if not exists smm_posts_user_schedule_idx on public.smm_posts (user_id, scheduled_time);
create index if not exists smm_posts_status_idx on public.smm_posts (status, scheduled_time);

create table if not exists public.smm_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  heygen_api_key text,
  runway_api_key text,
  elevenlabs_api_key text,
  default_avatar_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at
drop trigger if exists social_accounts_set_updated_at on public.social_accounts;
create trigger social_accounts_set_updated_at
  before update on public.social_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists smm_strategy_set_updated_at on public.smm_strategy;
create trigger smm_strategy_set_updated_at
  before update on public.smm_strategy
  for each row execute function public.set_updated_at();

drop trigger if exists smm_posts_set_updated_at on public.smm_posts;
create trigger smm_posts_set_updated_at
  before update on public.smm_posts
  for each row execute function public.set_updated_at();

drop trigger if exists smm_integrations_set_updated_at on public.smm_integrations;
create trigger smm_integrations_set_updated_at
  before update on public.smm_integrations
  for each row execute function public.set_updated_at();

-- RLS
alter table public.social_accounts enable row level security;
alter table public.smm_strategy enable row level security;
alter table public.smm_posts enable row level security;
alter table public.smm_integrations enable row level security;

drop policy if exists social_accounts_owner on public.social_accounts;
create policy social_accounts_owner on public.social_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists smm_strategy_owner on public.smm_strategy;
create policy smm_strategy_owner on public.smm_strategy
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists smm_posts_owner on public.smm_posts;
create policy smm_posts_owner on public.smm_posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists smm_integrations_owner on public.smm_integrations;
create policy smm_integrations_owner on public.smm_integrations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
