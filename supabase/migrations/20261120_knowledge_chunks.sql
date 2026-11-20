-- Векторный поиск по базе знаний агента. Чанки удаляются вместе с файлом.
set search_path = public, extensions;

create extension if not exists vector;

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  file_id uuid not null references public.agent_knowledge_files (id) on delete cascade,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_chunks_agent_idx
  on public.knowledge_chunks (agent_id);

create index if not exists knowledge_chunks_file_idx
  on public.knowledge_chunks (file_id);

create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

alter table public.knowledge_chunks enable row level security;

create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_agent_id uuid,
  match_threshold double precision default 0.3,
  match_count integer default 4
)
returns table (
  id uuid,
  content text,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    knowledge_chunks.id,
    knowledge_chunks.content,
    1 - (knowledge_chunks.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks
  where knowledge_chunks.agent_id = match_agent_id
    and 1 - (knowledge_chunks.embedding <=> query_embedding) > match_threshold
  order by knowledge_chunks.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

revoke all on function public.match_knowledge_chunks(vector, uuid, double precision, integer) from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks(vector, uuid, double precision, integer) to service_role;
