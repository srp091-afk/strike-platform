alter table public.conversations
  add column if not exists is_bot_active boolean not null default true;
