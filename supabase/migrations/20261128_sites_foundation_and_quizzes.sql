-- Сайты: типы, субдомены и квизы. Старые лендинги остаются site_type = landing.

alter table public.landings
  add column if not exists site_type text not null default 'landing',
  add column if not exists subdomain text,
  add column if not exists custom_domain text,
  add column if not exists domain_status text not null default 'subdomain_only',
  add column if not exists status text not null default 'draft',
  add column if not exists theme_config jsonb not null default '{"preset":"dark_premium","accentColor":"#cf0234","fontFamily":"Inter","borderRadius":16}'::jsonb,
  add column if not exists draft_schema jsonb,
  add column if not exists published_schema jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists analytics_config jsonb not null default '{}'::jsonb,
  add column if not exists seo_config jsonb not null default '{}'::jsonb,
  add column if not exists views_count integer not null default 0,
  add column if not exists starts_count integer not null default 0,
  add column if not exists leads_count integer not null default 0;

alter table public.landings drop constraint if exists landings_site_type_check;
alter table public.landings
  add constraint landings_site_type_check
  check (site_type in ('quiz', 'landing', 'multipage', 'store', 'bio'));

alter table public.landings drop constraint if exists landings_domain_status_check;
alter table public.landings
  add constraint landings_domain_status_check
  check (domain_status in ('subdomain_only', 'pending_dns', 'verifying', 'active', 'error'));

alter table public.landings drop constraint if exists landings_status_check;
alter table public.landings
  add constraint landings_status_check
  check (status in ('draft', 'published', 'paused'));

update public.landings
set status = 'published'
where status = 'draft'
  and coalesce(bullets->>'status', '') = 'published';

update public.landings
set subdomain = slug
where subdomain is null
  and slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
  and slug not in (
    'www', 'app', 'api', 'admin', 'auth', 'mail', 'smtp', 'cdn', 'static', 'assets',
    'billing', 'docs', 'help', 'support', 'status', 'blog', 'strike', 'strikeplatform',
    'test', 'staging', 'dev'
  );

create unique index if not exists landings_subdomain_uidx
  on public.landings (subdomain)
  where subdomain is not null;

create unique index if not exists landings_custom_domain_uidx
  on public.landings (custom_domain)
  where custom_domain is not null;

create table if not exists public.site_submissions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.landings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  site_type text not null default 'quiz',
  contact_name text,
  contact_phone text,
  contact_email text,
  preferred_messenger text,
  answers jsonb not null default '[]'::jsonb,
  calculated_result jsonb,
  utm_params jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint site_submissions_messenger_check check (
    preferred_messenger is null or preferred_messenger in ('whatsapp', 'telegram', 'phone', 'email')
  )
);

create index if not exists site_submissions_site_idx
  on public.site_submissions (site_id, created_at desc);

create index if not exists site_submissions_owner_idx
  on public.site_submissions (user_id, created_at desc);

alter table public.site_submissions enable row level security;

drop policy if exists site_submissions_owner_read on public.site_submissions;
create policy site_submissions_owner_read on public.site_submissions
  for select using (auth.uid() = user_id);

drop policy if exists site_submissions_owner_delete on public.site_submissions;
create policy site_submissions_owner_delete on public.site_submissions
  for delete using (auth.uid() = user_id);

create table if not exists public.site_events (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.landings (id) on delete cascade,
  event_type text not null,
  step_id text,
  session_id text,
  created_at timestamptz not null default now(),
  constraint site_events_type_check check (event_type in ('view', 'quiz_start', 'step_complete', 'lead_submit'))
);

create index if not exists site_events_site_idx
  on public.site_events (site_id, created_at desc);

alter table public.site_events enable row level security;

drop policy if exists site_events_owner_read on public.site_events;
create policy site_events_owner_read on public.site_events
  for select using (
    exists (
      select 1 from public.landings l
      where l.id = site_id and l.user_id = auth.uid()
    )
  );
