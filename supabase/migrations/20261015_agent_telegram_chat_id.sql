alter table public.agents
  add column if not exists telegram_chat_id text;
