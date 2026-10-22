-- Новый агент ещё не подключил ни одного канала: WhatsApp по умолчанию выключен.
-- Раньше дефолт active_channels ставил whatsapp=true, из-за чего тумблер нового
-- агента выглядел активным при пустом канале (wa_is_active при этом false).

alter table public.agents
  alter column active_channels
  set default '{"whatsapp": false, "telegram": false, "instagram": false}'::jsonb;
