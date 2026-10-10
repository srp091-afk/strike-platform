alter table public.conversations
  add column if not exists is_processing boolean not null default false;
