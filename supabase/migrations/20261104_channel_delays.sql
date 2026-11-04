-- Задержка ответа теперь задаётся отдельно для каждого канала.
alter table public.agents
  add column if not exists channel_delays jsonb not null
  default '{"whatsapp": 0, "telegram": 0, "instagram": 0, "web_widget": 0}'::jsonb;

-- Перенос старой общей задержки (response_delay) во все каналы и удаление старой колонки.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agents' and column_name = 'response_delay'
  ) then
    update public.agents
    set channel_delays = jsonb_build_object(
      'whatsapp', response_delay,
      'telegram', response_delay,
      'instagram', response_delay,
      'web_widget', response_delay
    )
    where response_delay > 0;

    alter table public.agents drop constraint if exists agents_response_delay_nonnegative;
    alter table public.agents drop column response_delay;
  end if;
end $$;
