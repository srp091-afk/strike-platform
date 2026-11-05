-- SMM «Проекты» (workspaces): бренд/клиент агентства. Интеграции, стратегия, посты и аккаунты
-- принадлежат проекту, а проект — пользователю.

create table if not exists public.smm_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  constraint smm_projects_name_check check (char_length(btrim(name)) between 1 and 80)
);

create index if not exists smm_projects_user_idx on public.smm_projects (user_id, created_at desc);

alter table public.smm_projects enable row level security;

drop policy if exists smm_projects_owner on public.smm_projects;
create policy smm_projects_owner on public.smm_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- project_id во всех SMM-таблицах (пока nullable: ниже переносим уже существующие данные).
alter table public.smm_integrations add column if not exists project_id uuid references public.smm_projects (id) on delete cascade;
alter table public.smm_strategy     add column if not exists project_id uuid references public.smm_projects (id) on delete cascade;
alter table public.smm_posts        add column if not exists project_id uuid references public.smm_projects (id) on delete cascade;
alter table public.social_accounts  add column if not exists project_id uuid references public.smm_projects (id) on delete cascade;

-- Перенос: каждому пользователю с уже сохранёнными SMM-данными создаём проект «Мой первый проект».
insert into public.smm_projects (user_id, name)
select u.user_id, 'Мой первый проект'
from (
  select user_id from public.smm_integrations where project_id is null
  union select user_id from public.smm_strategy where project_id is null
  union select user_id from public.smm_posts where project_id is null
  union select user_id from public.social_accounts where project_id is null
) u
where not exists (select 1 from public.smm_projects p where p.user_id = u.user_id);

update public.smm_integrations t set project_id = (select p.id from public.smm_projects p where p.user_id = t.user_id order by p.created_at limit 1) where t.project_id is null;
update public.smm_strategy     t set project_id = (select p.id from public.smm_projects p where p.user_id = t.user_id order by p.created_at limit 1) where t.project_id is null;
update public.smm_posts        t set project_id = (select p.id from public.smm_projects p where p.user_id = t.user_id order by p.created_at limit 1) where t.project_id is null;
update public.social_accounts  t set project_id = (select p.id from public.smm_projects p where p.user_id = t.user_id order by p.created_at limit 1) where t.project_id is null;

alter table public.smm_integrations alter column project_id set not null;
alter table public.smm_strategy     alter column project_id set not null;
alter table public.smm_posts        alter column project_id set not null;
alter table public.social_accounts  alter column project_id set not null;

-- Одна запись настроек на проект (раньше — на пользователя).
alter table public.smm_integrations drop constraint if exists smm_integrations_user_id_key;
alter table public.smm_strategy     drop constraint if exists smm_strategy_user_id_key;
alter table public.smm_integrations drop constraint if exists smm_integrations_project_unique;
alter table public.smm_strategy     drop constraint if exists smm_strategy_project_unique;
alter table public.smm_integrations add constraint smm_integrations_project_unique unique (project_id);
alter table public.smm_strategy     add constraint smm_strategy_project_unique unique (project_id);

-- Один и тот же аккаунт соцсети можно подключить в разных проектах.
alter table public.social_accounts drop constraint if exists social_accounts_unique;
alter table public.social_accounts drop constraint if exists social_accounts_project_unique;
alter table public.social_accounts add constraint social_accounts_project_unique unique (project_id, provider, provider_account_id);

create index if not exists smm_posts_project_idx on public.smm_posts (project_id, scheduled_time);
create index if not exists social_accounts_project_idx on public.social_accounts (project_id);
