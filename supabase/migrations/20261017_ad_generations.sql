-- Папки версий креативов. Запуск: SQL Editor Supabase. Повторный запуск безопасен.
create extension if not exists "uuid-ossp";

create table if not exists public.ad_generations (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.ad_projects (id) on delete cascade,
  title text not null,
  style_name text not null,
  status text not null default 'processing',
  is_active boolean not null default false,
  images jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint ad_generations_status_check check (status in ('processing', 'ready', 'error')),
  constraint ad_generations_images_array check (jsonb_typeof(images) = 'array')
);

create index if not exists ad_generations_project_created_idx
  on public.ad_generations (project_id, created_at desc);

create unique index if not exists ad_generations_one_active_per_project
  on public.ad_generations (project_id)
  where is_active;

alter table public.ad_generations enable row level security;

grant select, insert, update, delete on public.ad_generations to authenticated;

drop policy if exists ad_generations_select_own on public.ad_generations;
drop policy if exists ad_generations_insert_own on public.ad_generations;
drop policy if exists ad_generations_update_own on public.ad_generations;
drop policy if exists ad_generations_delete_own on public.ad_generations;

create policy ad_generations_select_own
  on public.ad_generations for select
  to authenticated
  using (
    exists (
      select 1
      from public.ad_projects as project
      where project.id = project_id
        and project.user_id = auth.uid()
    )
  );

create policy ad_generations_insert_own
  on public.ad_generations for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.ad_projects as project
      where project.id = project_id
        and project.user_id = auth.uid()
    )
  );

create policy ad_generations_update_own
  on public.ad_generations for update
  to authenticated
  using (
    exists (
      select 1
      from public.ad_projects as project
      where project.id = project_id
        and project.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.ad_projects as project
      where project.id = project_id
        and project.user_id = auth.uid()
    )
  );

create policy ad_generations_delete_own
  on public.ad_generations for delete
  to authenticated
  using (
    exists (
      select 1
      from public.ad_projects as project
      where project.id = project_id
        and project.user_id = auth.uid()
    )
  );
