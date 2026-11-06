-- Instagram Direct для AI-агентов (Facebook Login → страница → привязанный Instagram Business аккаунт).
alter table public.agents
  add column if not exists instagram_account_id text,
  add column if not exists instagram_access_token text,
  add column if not exists instagram_username text,
  add column if not exists instagram_page_id text,
  add column if not exists instagram_avatar_url text;

-- Один Instagram-аккаунт — один агент (по нему вебхук находит агента).
create unique index if not exists agents_instagram_account_id_key
  on public.agents (instagram_account_id)
  where instagram_account_id is not null;