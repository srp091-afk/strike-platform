-- Allow refreshing up to 10 creatives per generation run.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'ad_projects_creatives_count_check'
  ) then
    alter table public.ad_projects drop constraint ad_projects_creatives_count_check;
  end if;

  alter table public.ad_projects
    add constraint ad_projects_creatives_count_check
    check (creatives_count is null or creatives_count between 1 and 10);
end $$;
