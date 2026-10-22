-- Supabase Storage: аватары веб-виджета (агент и оператор).
-- Бакет публичный на чтение: URL аватаров отдаются в публичный виджет на чужих сайтах.
-- Запись с сервера идёт service-role ключом (обходит RLS), политики ниже фиксируют намерение.
-- Повторный запуск безопасен.

insert into storage.buckets (id, name, public)
values ('widget_avatars', 'widget_avatars', true)
on conflict (id) do update
set name = excluded.name,
    public = true;

-- Публичное чтение для всех.
drop policy if exists widget_avatars_public_read on storage.objects;
create policy widget_avatars_public_read
  on storage.objects for select
  to public
  using (bucket_id = 'widget_avatars');

-- Добавление для авторизованных пользователей.
drop policy if exists widget_avatars_authenticated_insert on storage.objects;
create policy widget_avatars_authenticated_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'widget_avatars');

-- Обновление для авторизованных пользователей.
drop policy if exists widget_avatars_authenticated_update on storage.objects;
create policy widget_avatars_authenticated_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'widget_avatars')
  with check (bucket_id = 'widget_avatars');

-- Удаление для авторизованных пользователей.
drop policy if exists widget_avatars_authenticated_delete on storage.objects;
create policy widget_avatars_authenticated_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'widget_avatars');
