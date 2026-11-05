-- Текст-запасной вариант для AI-рассылки: уходит без анализа сайта, если сайт недоступен.
alter table public.outreach_campaigns
  add column if not exists fallback_message text not null default '';
