-- Registre comptable unifié : état du dernier audit Belfius et lien avec l'épargne.
alter table public.bank_snapshots
  add column if not exists operation_state jsonb not null default '{}'::jsonb,
  add column if not exists opening_month text,
  add column if not exists opening_balance numeric,
  add column if not exists opening_balances jsonb not null default '{}'::jsonb;

alter table public.operations
  add column if not exists savings_goal_id uuid references public.savings_goals(id) on delete restrict,
  add column if not exists savings_direction text,
  add column if not exists budget_month text,
  add column if not exists income_kind text,
  add column if not exists income_source text;

alter table public.operations
  drop constraint if exists operations_budget_month_format,
  add constraint operations_budget_month_format
    check (budget_month is null or budget_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  drop constraint if exists operations_income_kind_values,
  add constraint operations_income_kind_values
    check (income_kind is null or income_kind in ('salary', 'complementary', 'other'));

alter table public.operations
  drop constraint if exists operations_savings_direction_check;

alter table public.operations
  add constraint operations_savings_direction_check
  check (savings_direction is null or savings_direction in ('in', 'out'));

create index if not exists operations_savings_goal_id_idx
  on public.operations(savings_goal_id)
  where savings_goal_id is not null;

-- Empêche le retour des objectifs identiques créés historiquement à plusieurs reprises.
create unique index if not exists savings_goals_household_normalized_label_uidx
  on public.savings_goals (household_id, lower(trim(label)));

-- Verrou définitif contre les créations concurrentes d'un même objectif.
create unique index if not exists savings_goals_household_normalized_label_uidx
  on public.savings_goals (household_id, lower(trim(label)));

create or replace function public.apply_operation_savings_effect()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_effect numeric := 0;
  new_effect numeric := 0;
begin
  if tg_op <> 'INSERT' and old.savings_goal_id is not null then
    old_effect := case when old.savings_direction = 'in' then old.amount else -old.amount end;
    update public.savings_goals
      set saved = saved - old_effect
      where id = old.savings_goal_id and household_id = old.household_id;
  end if;

  if tg_op <> 'DELETE' and new.savings_goal_id is not null then
    new_effect := case when new.savings_direction = 'in' then new.amount else -new.amount end;
    update public.savings_goals
      set saved = saved + new_effect
      where id = new.savings_goal_id and household_id = new.household_id;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists operations_apply_savings_effect on public.operations;
create trigger operations_apply_savings_effect
after insert or update or delete
on public.operations
for each row execute function public.apply_operation_savings_effect();
