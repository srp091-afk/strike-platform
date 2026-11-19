-- Клиент (owner) выдаёт доступ к своему кабинету по email.
-- delegate_id заполняется, когда этот email уже есть среди пользователей.

create table if not exists public.account_delegations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  delegate_email text not null check (delegate_email = lower(delegate_email) and delegate_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  delegate_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_delegations_owner_email_unique unique (owner_id, delegate_email)
);

create index if not exists account_delegations_delegate_idx
  on public.account_delegations (delegate_id);

alter table public.account_delegations enable row level security;

drop policy if exists account_delegations_owner_select on public.account_delegations;
create policy account_delegations_owner_select on public.account_delegations
  for select using (auth.uid() = owner_id);

drop policy if exists account_delegations_owner_insert on public.account_delegations;
create policy account_delegations_owner_insert on public.account_delegations
  for insert with check (auth.uid() = owner_id);

drop policy if exists account_delegations_owner_delete on public.account_delegations;
create policy account_delegations_owner_delete on public.account_delegations
  for delete using (auth.uid() = owner_id);

drop policy if exists account_delegations_delegate_select on public.account_delegations;
create policy account_delegations_delegate_select on public.account_delegations
  for select using (auth.uid() = delegate_id);
