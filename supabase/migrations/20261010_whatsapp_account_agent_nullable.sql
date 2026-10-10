alter table public.whatsapp_accounts alter column agent_id drop not null;

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'whatsapp_accounts'
    and con.contype = 'f'
    and pg_get_constraintdef(con.oid) ilike '%agents%';

  if constraint_name is not null then
    execute format('alter table public.whatsapp_accounts drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_agent_id_fkey
  foreign key (agent_id) references public.agents (id) on delete set null;
