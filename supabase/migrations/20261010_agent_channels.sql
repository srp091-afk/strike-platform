alter table public.agents
  add column if not exists wa_instance_id text,
  add column if not exists wa_api_token text,
  add column if not exists wa_phone_number text,
  add column if not exists wa_is_active boolean not null default false,
  add column if not exists tg_bot_token text,
  add column if not exists tg_bot_username text,
  add column if not exists tg_is_active boolean not null default false;

create unique index if not exists agents_wa_instance_id_key
  on public.agents (wa_instance_id)
  where wa_instance_id is not null;

create unique index if not exists agents_tg_bot_token_key
  on public.agents (tg_bot_token)
  where tg_bot_token is not null;

do $$
begin
  if to_regclass('public.whatsapp_accounts') is not null then
    update public.agents as agent
    set
      wa_instance_id = account.instance_id,
      wa_api_token = account.api_token,
      wa_phone_number = account.phone_number,
      wa_is_active = coalesce(account.is_active, false)
    from (
      select distinct on (agent_id)
        agent_id,
        instance_id,
        api_token,
        phone_number,
        is_active
      from public.whatsapp_accounts
      where agent_id is not null
      order by agent_id, is_active desc, created_at desc
    ) as account
    where agent.id = account.agent_id
      and agent.wa_instance_id is null;

    drop table public.whatsapp_accounts;
  end if;
end $$;
