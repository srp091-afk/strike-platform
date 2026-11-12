-- Отличает пояс, который пользователь выбрал сам, от автоматического UTC.
-- Пока флаг true, интерфейс подставляет часовой пояс браузера и сохраняет его.

alter table public.outreach_campaigns
  add column if not exists timezone_is_default boolean;

update public.outreach_campaigns
set timezone_is_default = coalesce(
  timezone_is_default,
  timezone is null or timezone in ('UTC', 'Etc/UTC', 'Etc/GMT', 'Etc/GMT0', 'Etc/GMT+0', 'Etc/GMT-0')
);

alter table public.outreach_campaigns
  alter column timezone_is_default set default true;

alter table public.outreach_campaigns
  alter column timezone_is_default set not null;
