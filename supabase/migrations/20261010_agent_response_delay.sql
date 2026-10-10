alter table public.agents
  add column if not exists response_delay integer not null default 0;
