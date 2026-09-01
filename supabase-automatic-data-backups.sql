-- Points de récupération automatiques Mon Foyer.
-- Ils protègent les données applicatives contre une régression ou une mauvaise
-- manipulation. Le code source reste versionné dans GitHub et les déploiements
-- Vercel demeurent réversibles indépendamment de ces instantanés.

create table if not exists public.data_backup_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  backup_date date not null,
  backup_kind text not null check (backup_kind in ('daily', 'month_end')),
  payload jsonb not null,
  row_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (household_id, backup_date, backup_kind)
);

create index if not exists data_backup_snapshots_household_created_idx
  on public.data_backup_snapshots (household_id, created_at desc);

alter table public.data_backup_snapshots enable row level security;
revoke all on public.data_backup_snapshots from anon;
grant select on public.data_backup_snapshots to authenticated;

drop policy if exists "members can read their recovery snapshots" on public.data_backup_snapshots;
create policy "members can read their recovery snapshots"
on public.data_backup_snapshots for select to authenticated
using (exists (
  select 1 from public.household_members member
  where member.household_id = data_backup_snapshots.household_id
    and member.user_id = (select auth.uid())
));

create schema if not exists private;

create or replace function private.create_household_data_backup(
  p_household_id uuid,
  p_kind text default 'daily'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_now timestamptz := now();
  v_date date := (now() at time zone 'Europe/Brussels')::date;
  v_tables jsonb;
  v_counts jsonb;
begin
  if p_kind not in ('daily', 'month_end') then
    raise exception 'Type de sauvegarde invalide';
  end if;

  v_tables := jsonb_build_object(
    'categories', coalesce((select jsonb_agg(to_jsonb(t)) from public.categories t where t.household_id = p_household_id), '[]'::jsonb),
    'stores', coalesce((select jsonb_agg(to_jsonb(t)) from public.stores t where t.household_id = p_household_id), '[]'::jsonb),
    'savings_goals', coalesce((select jsonb_agg(to_jsonb(t)) from public.savings_goals t where t.household_id = p_household_id), '[]'::jsonb),
    'recurring_fixed_expenses', coalesce((select jsonb_agg(to_jsonb(t)) from public.recurring_fixed_expenses t where t.household_id = p_household_id), '[]'::jsonb),
    'operations', coalesce((select jsonb_agg(to_jsonb(t)) from public.operations t where t.household_id = p_household_id), '[]'::jsonb),
    'leisure_expenses', coalesce((select jsonb_agg(to_jsonb(t)) from public.leisure_expenses t where t.household_id = p_household_id), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(t)) from public.messages t where t.household_id = p_household_id), '[]'::jsonb),
    'bank_snapshots', coalesce((select jsonb_agg(to_jsonb(t)) from public.bank_snapshots t where t.household_id = p_household_id), '[]'::jsonb),
    'household_budget_settings', coalesce((select jsonb_agg(to_jsonb(t)) from public.household_budget_settings t where t.household_id = p_household_id), '[]'::jsonb),
    'care_people', coalesce((select jsonb_agg(to_jsonb(t)) from public.care_people t where t.household_id = p_household_id), '[]'::jsonb),
    'reminder_preferences', coalesce((select jsonb_agg(to_jsonb(t)) from public.reminder_preferences t where t.household_id = p_household_id), '[]'::jsonb),
    'monthly_accounting_audits', coalesce((select jsonb_agg(to_jsonb(t)) from public.monthly_accounting_audits t where t.household_id = p_household_id), '[]'::jsonb)
  );

  select jsonb_object_agg(entry.key, jsonb_array_length(entry.value))
    into v_counts
  from jsonb_each(v_tables) entry;

  insert into public.data_backup_snapshots (
    household_id, backup_date, backup_kind, payload, row_counts, created_at
  ) values (
    p_household_id,
    v_date,
    p_kind,
    jsonb_build_object(
      'createdAt', v_now,
      'householdId', p_household_id,
      'source', 'Supabase automatic snapshot',
      'tables', v_tables
    ),
    v_counts,
    v_now
  )
  on conflict (household_id, backup_date, backup_kind) do update set
    payload = excluded.payload,
    row_counts = excluded.row_counts,
    created_at = excluded.created_at
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function private.create_household_data_backup(uuid, text) from public, anon, authenticated;

create or replace function private.run_automatic_data_backups()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Brussels')::date;
  household record;
begin
  for household in select id from public.households loop
    perform private.create_household_data_backup(household.id, 'daily');
    if v_today = (date_trunc('month', v_today) + interval '1 month - 1 day')::date then
      perform private.create_household_data_backup(household.id, 'month_end');
    end if;
  end loop;

  delete from public.data_backup_snapshots snapshot
  where snapshot.backup_kind = 'daily'
    and snapshot.backup_date < v_today - 35;

  delete from public.data_backup_snapshots snapshot
  where snapshot.backup_kind = 'month_end'
    and snapshot.backup_date < (v_today - interval '13 months')::date;
end;
$$;

revoke all on function private.run_automatic_data_backups() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'mon-foyer-automatic-data-backup';

  perform cron.schedule(
    'mon-foyer-automatic-data-backup',
    '15 2 * * *',
    'select private.run_automatic_data_backups();'
  );
end;
$$;

-- Premier point de récupération immédiat, sans attendre la tâche nocturne.
select private.run_automatic_data_backups();
