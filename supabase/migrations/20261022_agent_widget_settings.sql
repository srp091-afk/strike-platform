-- Настройки веб-виджета чата (публичная страница /widget/chat/<agentId>).

alter table public.agents
  add column if not exists widget_agent_name text not null default 'AI-Ассистент',
  add column if not exists widget_operator_name text not null default 'Менеджер',
  add column if not exists widget_auto_open boolean not null default false,
  add column if not exists widget_open_delay integer not null default 5,
  add column if not exists widget_color_header_bg text not null default '#171717',
  add column if not exists widget_color_header_text text not null default '#f5f5f5',
  add column if not exists widget_greeting text not null default 'Здравствуйте! Я — AI-ассистент. Готов ответить на ваши вопросы.',
  add column if not exists widget_avatar_agent text,
  add column if not exists widget_avatar_operator text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agents_widget_open_delay_range'
  ) then
    alter table public.agents
      add constraint agents_widget_open_delay_range
      check (widget_open_delay >= 1 and widget_open_delay <= 60);
  end if;
end $$;
