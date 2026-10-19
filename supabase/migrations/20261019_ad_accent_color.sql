-- User-selected accent color for creative templates. Re-run safe.
alter table public.ad_projects
  add column if not exists accent_color text;
