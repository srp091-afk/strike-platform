-- Прочтение колокольчика принадлежит конкретному пользователю, не кабинету.

create table if not exists public.user_notification_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  notification_key text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_key),
  constraint user_notification_reads_key_len check (char_length(notification_key) between 1 and 200)
);

alter table public.user_notification_reads enable row level security;

drop policy if exists user_notification_reads_owner on public.user_notification_reads;
create policy user_notification_reads_owner on public.user_notification_reads
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
