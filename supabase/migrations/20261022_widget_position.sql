-- Угол экрана, в котором плавающий веб-виджет показывается на сайте клиента.

alter table public.agents
  add column if not exists widget_position text not null default 'bottom-right';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agents_widget_position_check'
  ) then
    alter table public.agents
      add constraint agents_widget_position_check
      check (widget_position in ('bottom-right', 'bottom-left', 'bottom-center'));
  end if;
end $$;
