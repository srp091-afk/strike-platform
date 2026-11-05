-- Внутренняя экономика генераций: платформа использует свои мастер-ключи,
-- пользователь тратит кредиты. Пользовательские API-ключи больше не хранятся.

alter table public.smm_integrations
  drop column if exists heygen_api_key,
  drop column if exists runway_api_key,
  drop column if exists elevenlabs_api_key;

-- Тестовые генерации для новых (и уже существующих) клиентов.
alter table public.profiles
  add column if not exists video_credits integer not null default 3;

alter table public.profiles
  drop constraint if exists profiles_video_credits_check;
alter table public.profiles
  add constraint profiles_video_credits_check check (video_credits >= 0);

-- Атомарное списание: один UPDATE с условием, гонки двух параллельных запусков невозможны.
-- Возвращает остаток после списания или -1, если кредитов нет.
create or replace function public.consume_video_credit(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  update public.profiles
     set video_credits = video_credits - 1
   where id = p_user_id and video_credits > 0
  returning video_credits into remaining;
  return coalesce(remaining, -1);
end;
$$;

-- Возврат кредита, если видеодвижок не принял задачу.
create or replace function public.refund_video_credit(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  update public.profiles
     set video_credits = video_credits + 1
   where id = p_user_id
  returning video_credits into remaining;
  return coalesce(remaining, -1);
end;
$$;

-- Вызывать функции может только сервер (service_role), не браузер.
revoke all on function public.consume_video_credit(uuid) from public, anon, authenticated;
revoke all on function public.refund_video_credit(uuid) from public, anon, authenticated;
grant execute on function public.consume_video_credit(uuid) to service_role;
grant execute on function public.refund_video_credit(uuid) to service_role;
