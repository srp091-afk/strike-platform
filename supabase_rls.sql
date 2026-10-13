-- STRIKE — доступ по владельцу (Supabase Auth).
-- Запуск: SQL Editor проекта Supabase. Повторный запуск безопасен.
--
-- agents, integrations и conversations уже хранят user_id (ссылка на public.profiles,
-- а profiles.id совпадает с auth.users.id). Скрипт не перезаписывает существующие строки:
-- добавляет колонку, только если её нет, и внешний ключ на auth.users, если его ещё нет.
-- У messages колонки не было: она добавляется и заполняется из диалога.

-- ---------------------------------------------------------------------------
-- user_id
-- ---------------------------------------------------------------------------

do $$
declare
  target text;
begin
  foreach target in array array['agents', 'integrations', 'conversations', 'messages']
  loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = target
        and column_name = 'user_id'
    ) then
      execute format('alter table public.%I add column user_id uuid', target);
    end if;
  end loop;
end $$;

update public.messages as m
set user_id = c.user_id
from public.conversations as c
where m.conversation_id = c.id
  and m.user_id is null;

do $$
declare
  target text;
begin
  foreach target in array array['agents', 'integrations', 'conversations', 'messages']
  loop
    if not exists (
      select 1
      from pg_constraint as c
      join pg_class as rel on rel.oid = c.conrelid
      join pg_namespace as nsp on nsp.oid = rel.relnamespace
      join pg_class as frel on frel.oid = c.confrelid
      join pg_namespace as fnsp on fnsp.oid = frel.relnamespace
      where c.contype = 'f'
        and nsp.nspname = 'public'
        and rel.relname = target
        and fnsp.nspname = 'auth'
        and frel.relname = 'users'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (user_id) references auth.users (id) on delete cascade',
        target,
        target || '_user_id_auth_users_fkey'
      );
    end if;
  end loop;
end $$;

create index if not exists messages_user_id_idx on public.messages (user_id);

-- Вебхуки пишут сообщения через service_role и не передают user_id.
-- Триггер копирует владельца из диалога, чтобы политика user_id = auth.uid() их видела.
create or replace function public.set_message_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    select c.user_id
    into new.user_id
    from public.conversations as c
    where c.id = new.conversation_id;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_set_user_id on public.messages;
create trigger messages_set_user_id
  before insert on public.messages
  for each row execute function public.set_message_user_id();

do $$
begin
  if not exists (select 1 from public.messages where user_id is null) then
    alter table public.messages alter column user_id set not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- service_role обходит RLS, поэтому вебхуки продолжают писать в эти таблицы.
-- ---------------------------------------------------------------------------

alter table public.agents enable row level security;
alter table public.integrations enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

do $$
declare
  target text;
  action text;
begin
  foreach target in array array['agents', 'integrations', 'conversations', 'messages']
  loop
    execute format('drop policy if exists %I on public.%I', target || '_all_own', target);
    foreach action in array array['select', 'insert', 'update', 'delete']
    loop
      execute format('drop policy if exists %I on public.%I', target || '_' || action || '_own', target);
    end loop;
  end loop;
end $$;

create policy agents_select_own
  on public.agents for select
  to authenticated
  using (user_id = auth.uid());

create policy agents_insert_own
  on public.agents for insert
  to authenticated
  with check (user_id = auth.uid());

create policy agents_update_own
  on public.agents for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy agents_delete_own
  on public.agents for delete
  to authenticated
  using (user_id = auth.uid());

create policy integrations_select_own
  on public.integrations for select
  to authenticated
  using (user_id = auth.uid());

create policy integrations_insert_own
  on public.integrations for insert
  to authenticated
  with check (user_id = auth.uid());

create policy integrations_update_own
  on public.integrations for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy integrations_delete_own
  on public.integrations for delete
  to authenticated
  using (user_id = auth.uid());

create policy conversations_select_own
  on public.conversations for select
  to authenticated
  using (user_id = auth.uid());

create policy conversations_insert_own
  on public.conversations for insert
  to authenticated
  with check (user_id = auth.uid());

create policy conversations_update_own
  on public.conversations for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy conversations_delete_own
  on public.conversations for delete
  to authenticated
  using (user_id = auth.uid());

create policy messages_select_own
  on public.messages for select
  to authenticated
  using (user_id = auth.uid());

create policy messages_insert_own
  on public.messages for insert
  to authenticated
  with check (user_id = auth.uid());

create policy messages_update_own
  on public.messages for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy messages_delete_own
  on public.messages for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.agents to authenticated;
grant select, insert, update, delete on public.integrations to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
