-- Тариф модуля «Ads & Креативы» (рядом с tier_agents / tier_smm / tier_sites).
alter table public.profiles
  add column if not exists tier_ads text not null default 'trial';
