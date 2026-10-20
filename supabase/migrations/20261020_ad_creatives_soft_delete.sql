-- Креативы как строки таблицы ad_creatives + Soft Delete.
-- Запуск: SQL Editor Supabase. Повторный запуск безопасен.
-- Приложение читает только строки с deleted_at IS NULL,
-- удаление креатива = UPDATE ad_creatives SET deleted_at = now().

alter table public.ad_creatives
  add column if not exists deleted_at timestamptz,
  add column if not exists generation_id uuid references public.ad_generations (id) on delete cascade,
  add column if not exists style_id text,
  add column if not exists image_urls jsonb not null default '[]'::jsonb,
  add column if not exists texts jsonb,
  add column if not exists accent_color text,
  add column if not exists sort_index integer not null default 0;

create index if not exists ad_creatives_project_visible_idx
  on public.ad_creatives (project_id, deleted_at, created_at desc);

create index if not exists ad_creatives_generation_idx
  on public.ad_creatives (generation_id, sort_index);

-- Backfill: разложить существующие ad_generations.images (сеты [url] / [before, after])
-- в строки ad_creatives, чтобы архивные креативы тоже получили id и soft delete.
insert into public.ad_creatives (project_id, generation_id, image_url, image_urls, sort_index)
select
  g.project_id,
  g.id,
  case when jsonb_typeof(t.elem) = 'array' then t.elem ->> 0 else t.elem #>> '{}' end,
  case when jsonb_typeof(t.elem) = 'array' then t.elem else jsonb_build_array(t.elem #>> '{}') end,
  (t.ord - 1)::integer
from public.ad_generations as g
cross join lateral jsonb_array_elements(g.images) with ordinality as t (elem, ord)
where jsonb_typeof(g.images) = 'array'
  and not exists (
    select 1 from public.ad_creatives as c where c.generation_id = g.id
  );
