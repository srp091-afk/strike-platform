-- Привязка сайтов (landings) к владельцу: нужна для лимита «AI-сайты» в биллинге.

alter table public.landings
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- Существующие сайты наследуют владельца от своего агента.
update public.landings as l
  set user_id = a.user_id
  from public.agents as a
  where l.agent_id = a.id
    and l.user_id is null
    and a.user_id is not null;

create index if not exists landings_user_id_idx on public.landings (user_id);

-- Приложение работает через service role (обходит RLS); политики защищают прямой доступ с anon/authenticated ключами.
alter table public.landings enable row level security;

drop policy if exists "landings_select_own" on public.landings;
create policy "landings_select_own"
  on public.landings for select
  using (auth.uid() = user_id);

drop policy if exists "landings_insert_own" on public.landings;
create policy "landings_insert_own"
  on public.landings for insert
  with check (auth.uid() = user_id);

drop policy if exists "landings_update_own" on public.landings;
create policy "landings_update_own"
  on public.landings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "landings_delete_own" on public.landings;
create policy "landings_delete_own"
  on public.landings for delete
  using (auth.uid() = user_id);
