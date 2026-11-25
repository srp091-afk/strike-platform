-- Настройки профиля: уведомления и часовой пояс владельца аккаунта.

alter table public.profiles
  add column if not exists notification_settings jsonb not null default jsonb_build_object(
    'low_balance', true,
    'subscription', true,
    'channel_alerts', true
  ),
  add column if not exists timezone text;

alter table public.profiles drop constraint if exists profiles_notification_settings_object;
alter table public.profiles
  add constraint profiles_notification_settings_object
  check (jsonb_typeof(notification_settings) = 'object');
