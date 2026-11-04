-- Модуль «Рассылки» (Outreach): 1 кампания = строго 1 канал.

create table if not exists public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Новая рассылка',
  agent_id uuid references public.agents(id) on delete set null,
  channel_type text check (channel_type in ('whatsapp', 'telegram', 'instagram')),
  outreach_prompt text not null default '',
  min_delay_minutes integer not null default 3 check (min_delay_minutes >= 0),
  max_delay_minutes integer not null default 8 check (max_delay_minutes >= 0),
  daily_limit integer not null default 50 check (daily_limit between 1 and 5000),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  -- Загруженная база: исходные колонки и маппинг (какая колонка = контакт, какая = сайт).
  source_columns jsonb not null default '[]'::jsonb,
  contact_column text,
  website_column text,
  -- Вебхук (Make.com и т.п.): STRIKE отправляет статус каждой отправки.
  webhook_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_delay_order check (min_delay_minutes <= max_delay_minutes)
);

create index if not exists outreach_campaigns_user_idx
  on public.outreach_campaigns (user_id, created_at desc);

create table if not exists public.outreach_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.outreach_campaigns(id) on delete cascade,
  row_index integer not null default 0,
  -- Загруженные пользователем колонки как есть: {"Телефон": "...", "Имя": "...", "Сайт": "..."}.
  contact_data jsonb not null default '{}'::jsonb,
  strike_status text not null default 'queued' check (strike_status in ('queued', 'success', 'error')),
  strike_sent_time timestamptz,
  strike_message text,
  strike_error text,
  created_at timestamptz not null default now()
);

create index if not exists outreach_logs_campaign_idx
  on public.outreach_logs (campaign_id, row_index);
create index if not exists outreach_logs_campaign_status_idx
  on public.outreach_logs (campaign_id, strike_status);

-- Доступ идёт через service role в серверных действиях; прямой доступ клиентов закрыт.
alter table public.outreach_campaigns enable row level security;
alter table public.outreach_logs enable row level security;

drop policy if exists outreach_campaigns_owner on public.outreach_campaigns;
create policy outreach_campaigns_owner on public.outreach_campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists outreach_logs_owner on public.outreach_logs;
create policy outreach_logs_owner on public.outreach_logs
  for all using (
    exists (select 1 from public.outreach_campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.outreach_campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  );
