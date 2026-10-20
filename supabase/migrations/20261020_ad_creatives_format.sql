-- Per-creative format: each ad_creatives row stores the format that was
-- active in the "ФОРМАТ" toggle when its pack slot was added
-- ('4:5' feed / '9:16' stories). Mixed packs are supported. Re-run safe.
alter table public.ad_creatives
  add column if not exists aspect_ratio text;
