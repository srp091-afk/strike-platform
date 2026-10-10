alter table public.agents
  add column if not exists split_messages boolean not null default false;
