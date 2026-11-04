-- Порядок карточек агентов в списке (drag-and-drop). Меньше = выше.
alter table public.agents
  add column if not exists order_index integer not null default 0;

-- Стартовая расстановка: новые выше старых, как раньше (по created_at desc).
with ranked as (
  select id, row_number() over (partition by user_id order by created_at desc) - 1 as rn
  from public.agents
)
update public.agents a
set order_index = ranked.rn
from ranked
where a.id = ranked.id;
