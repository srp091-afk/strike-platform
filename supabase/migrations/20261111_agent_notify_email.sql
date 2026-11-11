alter table public.agents
  add column if not exists notify_email_enabled boolean not null default false,
  add column if not exists notify_email_address text;
