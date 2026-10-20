-- Creative format state: feed '4:5' vs stories '9:16'. Re-run safe.
-- The app already works without these columns (graceful fallbacks);
-- they persist the chosen format per project / generation.
alter table public.ad_projects
  add column if not exists aspect_ratio text;

alter table public.ad_generations
  add column if not exists aspect_ratio text;
