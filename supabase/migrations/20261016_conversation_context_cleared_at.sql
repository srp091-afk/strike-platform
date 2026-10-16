alter table public.conversations
  add column if not exists context_cleared_at timestamptz;
