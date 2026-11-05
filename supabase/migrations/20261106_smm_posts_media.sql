-- Ссылки на прикреплённые картинки и видео поста (колонка могла быть создана раньше: add if not exists).
alter table public.smm_posts
  add column if not exists media_urls text[] not null default '{}';
