-- База знаний агента: файлы в закрытом бакете и журнал загрузок.
-- Повторный запуск безопасен. Запись идёт service-role ключом и обходит RLS.

create table if not exists public.agent_knowledge_files (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  file_name text not null,
  file_size integer not null check (file_size >= 0 and file_size <= 10485760),
  file_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_knowledge_files_agent_created_idx
  on public.agent_knowledge_files (agent_id, created_at desc);

alter table public.agent_knowledge_files enable row level security;

drop policy if exists "agent_knowledge_files_select_own" on public.agent_knowledge_files;
create policy "agent_knowledge_files_select_own"
  on public.agent_knowledge_files for select
  to authenticated
  using (
    exists (
      select 1
      from public.agents
      where agents.id = agent_knowledge_files.agent_id
        and agents.user_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge_bases',
  'knowledge_bases',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists knowledge_bases_service_role_all on storage.objects;
create policy knowledge_bases_service_role_all
  on storage.objects for all
  to service_role
  using (bucket_id = 'knowledge_bases')
  with check (bucket_id = 'knowledge_bases');
