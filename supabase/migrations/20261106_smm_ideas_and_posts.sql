-- Идеи, сценарии и канбан контент-плана: расширение smm_posts.

alter table public.smm_posts
  add column if not exists title text not null default '',
  add column if not exists content text not null default '',
  add column if not exists video_format text not null default 'broll',
  add column if not exists voiceover_text text,
  add column if not exists visual_prompt text,
  add column if not exists target_channels text[] not null default '{}';

-- Перенос старых данных в новые колонки.
update public.smm_posts set content = content_text where content = '' and content_text <> '';
update public.smm_posts set title = left(split_part(content_text, E'\n', 1), 120) where title = '' and content_text <> '';

-- Новые статусы (старые маппим: draft/failed -> idea, scheduled/publishing -> ready).
alter table public.smm_posts drop constraint if exists smm_posts_status_check;
update public.smm_posts set status = case status
  when 'draft' then 'idea'
  when 'failed' then 'idea'
  when 'scheduled' then 'ready'
  when 'publishing' then 'ready'
  else status
end
where status not in ('idea', 'in_progress', 'ready', 'published');
alter table public.smm_posts alter column status set default 'idea';
alter table public.smm_posts
  add constraint smm_posts_status_check check (status in ('idea', 'in_progress', 'ready', 'published'));

alter table public.smm_posts drop constraint if exists smm_posts_video_format_check;
alter table public.smm_posts
  add constraint smm_posts_video_format_check check (video_format in ('avatar', 'broll', 'overlay', 'none'));

alter table public.smm_posts drop constraint if exists smm_posts_channels_check;
alter table public.smm_posts
  add constraint smm_posts_channels_check
  check (target_channels <@ array['instagram', 'facebook', 'tiktok', 'threads', 'youtube']::text[]);

create index if not exists smm_posts_project_status_idx on public.smm_posts (project_id, status);

-- RLS: доступ только владельцу проекта.
alter table public.smm_posts enable row level security;
drop policy if exists smm_posts_owner on public.smm_posts;
drop policy if exists smm_posts_project_owner on public.smm_posts;
create policy smm_posts_project_owner on public.smm_posts
  for all
  using (exists (select 1 from public.smm_projects p where p.id = smm_posts.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.smm_projects p where p.id = smm_posts.project_id and p.user_id = auth.uid()));
