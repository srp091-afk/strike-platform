alter table public.agents
  add column if not exists active_channels jsonb not null
  default '{"whatsapp": true, "telegram": false, "instagram": false}'::jsonb;
