-- Диалоги STRIKE и CRM в очереди «Задач ИИ»: один контакт — одна активная задача.

alter table public.proactive_sources drop constraint if exists proactive_sources_type_check;
alter table public.proactive_sources
  add constraint proactive_sources_type_check
  check (type in ('csv', 'google_sheets', 'pipedrive', 'strike_chats', 'amocrm'));

alter table public.proactive_campaigns
  add column if not exists followup_conflict_mode text not null default 'wait_builtin';

alter table public.proactive_campaigns drop constraint if exists proactive_campaigns_followup_mode_check;
alter table public.proactive_campaigns
  add constraint proactive_campaigns_followup_mode_check
  check (followup_conflict_mode in ('wait_builtin', 'override_builtin'));

alter table public.agent_action_queue
  add column if not exists contact_key text,
  add column if not exists conversation_id uuid references public.conversations (id) on delete set null,
  add column if not exists crm_deal_id text,
  add column if not exists dialog_category text,
  add column if not exists snapshot_last_msg_at timestamptz;

update public.agent_action_queue
set contact_key = coalesce(
  nullif(lower(regexp_replace(contact_target, '[^0-9a-z@._+-]', '', 'g')), ''),
  'legacy:' || id::text
)
where contact_key is null or btrim(contact_key) = '';

alter table public.agent_action_queue
  alter column contact_key set not null;

alter table public.agent_action_queue drop constraint if exists agent_action_queue_contact_key_len;
alter table public.agent_action_queue
  add constraint agent_action_queue_contact_key_len
  check (char_length(contact_key) between 1 and 200);

alter table public.agent_action_queue drop constraint if exists agent_action_queue_category_check;
alter table public.agent_action_queue
  add constraint agent_action_queue_category_check
  check (
    dialog_category is null
    or dialog_category in (
      'waiting_proposal',
      'shared_contact',
      'unanswered_question',
      'stalled_dialog',
      'crm_followup',
      'reactivation'
    )
  );

alter table public.agent_action_queue drop constraint if exists agent_action_queue_status_check;
alter table public.agent_action_queue
  add constraint agent_action_queue_status_check
  check (status in ('pending_approval', 'scheduled', 'sending', 'sent', 'failed', 'rejected', 'stale'));

create index if not exists agent_action_queue_conversation_idx
  on public.agent_action_queue (conversation_id)
  where conversation_id is not null;

create unique index if not exists agent_action_queue_active_contact_idx
  on public.agent_action_queue (user_id, contact_key)
  where status in ('pending_approval', 'scheduled', 'sending');
