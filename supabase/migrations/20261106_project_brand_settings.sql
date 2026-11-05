-- Настройки бренда SMM-проекта + новые платформы кросспостинга.

alter table public.smm_projects
  add column if not exists tone_of_voice text,
  add column if not exists target_audience text,
  add column if not exists brand_color text not null default '#000000',
  add column if not exists brand_font text not null default 'Inter';

alter table public.smm_projects drop constraint if exists smm_projects_brand_color_check;
alter table public.smm_projects
  add constraint smm_projects_brand_color_check check (brand_color ~ '^#[0-9a-fA-F]{6}$');

alter table public.smm_projects drop constraint if exists smm_projects_brand_font_check;
alter table public.smm_projects
  add constraint smm_projects_brand_font_check check (brand_font in ('Inter', 'Montserrat', 'Roboto', 'Playfair Display'));

alter table public.social_accounts drop constraint if exists social_accounts_provider_check;
alter table public.social_accounts
  add constraint social_accounts_provider_check
  check (provider in ('instagram', 'facebook', 'tiktok', 'threads', 'youtube'));
