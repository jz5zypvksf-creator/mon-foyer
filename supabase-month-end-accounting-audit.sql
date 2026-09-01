-- Clôture comptable mensuelle Mon Foyer.
-- Les transferts internes affectent la trésorerie et les comptes d'épargne,
-- mais jamais le résultat revenus - dépenses.

alter table public.operations
  add column if not exists accounting_nature text;

alter table public.recurring_fixed_expenses
  add column if not exists accounting_nature text;

alter table public.operations drop constraint if exists operations_accounting_nature_check;
alter table public.operations add constraint operations_accounting_nature_check check (
  accounting_nature is null or accounting_nature in (
    'income', 'reimbursement', 'expense', 'internal_transfer',
    'savings_withdrawal', 'card_purchase', 'card_settlement', 'adjustment'
  )
);

alter table public.recurring_fixed_expenses drop constraint if exists recurring_accounting_nature_check;
alter table public.recurring_fixed_expenses add constraint recurring_accounting_nature_check check (
  accounting_nature is null or accounting_nature in ('expense', 'internal_transfer', 'card_purchase')
);

create index if not exists operations_household_budget_month_nature_idx
  on public.operations (household_id, budget_month, accounting_nature);

create table if not exists public.monthly_accounting_audits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text not null check (status in ('balanced', 'review', 'critical')),
  opening_balance numeric(14,2) not null default 0,
  income numeric(14,2) not null default 0,
  assigned_income numeric(14,2) not null default 0,
  reimbursements numeric(14,2) not null default 0,
  savings_withdrawals numeric(14,2) not null default 0,
  resources numeric(14,2) not null default 0,
  expenses numeric(14,2) not null default 0,
  savings_transfers numeric(14,2) not null default 0,
  operating_result numeric(14,2) not null default 0,
  cash_after_savings numeric(14,2) not null default 0,
  card_purchases numeric(14,2) not null default 0,
  card_settlements numeric(14,2) not null default 0,
  bank_balance numeric(14,2),
  bank_balance_date date,
  anomaly_count integer not null default 0,
  anomalies jsonb not null default '[]'::jsonb,
  details jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id) on delete set null,
  unique (household_id, month)
);

create index if not exists monthly_accounting_audits_household_month_idx
  on public.monthly_accounting_audits (household_id, month desc);
create index if not exists monthly_accounting_audits_generated_by_idx
  on public.monthly_accounting_audits (generated_by);

alter table public.monthly_accounting_audits enable row level security;
revoke all on public.monthly_accounting_audits from anon;
grant select, insert, update on public.monthly_accounting_audits to authenticated;

drop policy if exists "members can read monthly accounting audits" on public.monthly_accounting_audits;
create policy "members can read monthly accounting audits"
on public.monthly_accounting_audits for select to authenticated
using (exists (
  select 1 from public.household_members member
  where member.household_id = monthly_accounting_audits.household_id
    and member.user_id = (select auth.uid())
));

drop policy if exists "members can insert monthly accounting audits" on public.monthly_accounting_audits;
create policy "members can insert monthly accounting audits"
on public.monthly_accounting_audits for insert to authenticated
with check (exists (
  select 1 from public.household_members member
  where member.household_id = monthly_accounting_audits.household_id
    and member.user_id = (select auth.uid())
));

drop policy if exists "members can update monthly accounting audits" on public.monthly_accounting_audits;
create policy "members can update monthly accounting audits"
on public.monthly_accounting_audits for update to authenticated
using (exists (
  select 1 from public.household_members member
  where member.household_id = monthly_accounting_audits.household_id
    and member.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.household_members member
  where member.household_id = monthly_accounting_audits.household_id
    and member.user_id = (select auth.uid())
));

create or replace function public.run_month_end_audit(p_household_id uuid, p_month text)
returns public.monthly_accounting_audits
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result public.monthly_accounting_audits;
  v_start date;
  v_end date;
  v_opening numeric := 0;
  v_income numeric := 0;
  v_assigned numeric := 0;
  v_reimbursements numeric := 0;
  v_withdrawals numeric := 0;
  v_expenses numeric := 0;
  v_transfers numeric := 0;
  v_card_purchases numeric := 0;
  v_card_settlements numeric := 0;
  v_bank_balance numeric;
  v_bank_date date;
  v_bank_anomalies integer := 0;
  v_duplicate_count integer := 0;
  v_orphan_transfer_count integer := 0;
  v_duplicate_savings_count integer := 0;
  v_anomalies jsonb := '[]'::jsonb;
  v_status text := 'balanced';
begin
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mois invalide: %', p_month;
  end if;
  if not exists (
    select 1 from public.household_members member
    where member.household_id = p_household_id
      and (member.user_id = (select auth.uid()) or current_user in ('postgres', 'supabase_admin'))
  ) then
    raise exception 'Accès refusé au foyer';
  end if;

  v_start := (p_month || '-01')::date;
  v_end := (v_start + interval '1 month - 1 day')::date;

  select coalesce((snapshot.opening_balances ->> p_month)::numeric,
                  case when snapshot.opening_month = p_month then snapshot.opening_balance end, 0),
         snapshot.balance,
         case
           when snapshot.balance_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(snapshot.balance_date::text, 10)::date
           when snapshot.balance_date::text ~ '^\d{2}/\d{2}/\d{4}' then to_date(left(snapshot.balance_date::text, 10), 'DD/MM/YYYY')
           else null
         end,
         coalesce(snapshot.anomalies, 0)
    into v_opening, v_bank_balance, v_bank_date, v_bank_anomalies
  from public.bank_snapshots snapshot
  where snapshot.household_id = p_household_id;

  -- Les chèques-repas disponibles au premier jour complètent le solde bancaire.
  select v_opening + coalesce(sum(case
    when coalesce(op.payment_method, '') not ilike '%chèque%repas%' then 0
    when op.type in ('income', 'reimbursement') then op.amount
    when op.type in ('fixed', 'variable') then -op.amount
    else 0 end), 0)
    into v_opening
  from public.operations op
  where op.household_id = p_household_id and op.date < v_start;

  with classified as (
    select op.*,
      coalesce(op.accounting_nature,
        case
          when lower(op.label) like 'ajustement belfius%' then 'adjustment'
          when op.type = 'card_settlement' then 'card_settlement'
          when op.savings_direction = 'out' or lower(op.label) like 'transfert depuis épargne%' then 'savings_withdrawal'
          when op.type = 'savings_transfer' or op.savings_direction = 'in' then 'internal_transfer'
          when op.type = 'income' then 'income'
          when op.type = 'reimbursement' then 'reimbursement'
          when lower(op.category) like 'épargne%' or lower(op.label) like 'épargne %'
            or lower(op.label) in ('prime', 'argent de poche (beobank)', 'taxes / impôts', 'frais divers foyer', 'frais divers véhicule') then 'internal_transfer'
          when coalesce(op.payment_method, '') ilike '%mastercard%' then 'card_purchase'
          else 'expense'
        end) nature
    from public.operations op
    where op.household_id = p_household_id
      and coalesce(op.budget_month, to_char(op.date, 'YYYY-MM')) = p_month
      and op.date <= v_end
  )
  select
    coalesce(sum(amount) filter (where nature = 'income' and date >= v_start), 0),
    coalesce(sum(amount) filter (where nature = 'income' and budget_month = p_month), 0),
    coalesce(sum(amount) filter (where nature = 'reimbursement'), 0),
    coalesce(sum(amount) filter (where nature = 'savings_withdrawal'), 0),
    coalesce(sum(amount) filter (where nature in ('expense', 'card_purchase')), 0),
    coalesce(sum(amount) filter (where nature = 'internal_transfer'), 0),
    coalesce(sum(amount) filter (where nature = 'card_purchase'), 0),
    coalesce(sum(amount) filter (where nature = 'card_settlement'), 0),
    count(*) filter (where nature = 'internal_transfer' and savings_goal_id is null and lower(label) not like '%beobank%')
  into v_income, v_assigned, v_reimbursements, v_withdrawals, v_expenses,
       v_transfers, v_card_purchases, v_card_settlements, v_orphan_transfer_count
  from classified;

  select coalesce(sum(group_count - 1), 0)::integer into v_duplicate_count
  from (
    select count(*) group_count from public.operations op
    where op.household_id = p_household_id
      and coalesce(op.budget_month, to_char(op.date, 'YYYY-MM')) = p_month
    group by op.date, round(op.amount, 2), lower(trim(coalesce(op.store, op.label))),
             coalesce(op.person, ''), coalesce(op.payment_method, '')
    having count(*) > 1
  ) duplicates;

  select count(*)::integer into v_duplicate_savings_count
  from (
    select coalesce(nullif(standing_order_reference, ''), bucket) key
    from public.savings_goals
    where household_id = p_household_id and active is not false
    group by coalesce(nullif(standing_order_reference, ''), bucket)
    having count(*) > 1
  ) duplicate_goals;

  if v_bank_date is null or v_bank_date < v_end then
    v_anomalies := v_anomalies || jsonb_build_array(jsonb_build_object(
      'code', 'bank_statement_incomplete', 'severity', 'review',
      'message', format('Le relevé Belfius ne clôture pas le mois (dernier solde: %s).', coalesce(v_bank_date::text, 'absent'))
    ));
  end if;
  if v_bank_anomalies > 0 then
    v_anomalies := v_anomalies || jsonb_build_array(jsonb_build_object(
      'code', 'bank_reconciliation_pending', 'severity', 'review', 'count', v_bank_anomalies,
      'message', format('%s écriture(s) restent à rapprocher avec Belfius.', v_bank_anomalies)
    ));
  end if;
  if v_duplicate_count > 0 then
    v_anomalies := v_anomalies || jsonb_build_array(jsonb_build_object(
      'code', 'duplicate_operations', 'severity', 'critical', 'count', v_duplicate_count,
      'message', format('%s doublon(s) comptable(s) potentiel(s) détecté(s).', v_duplicate_count)
    ));
  end if;
  if v_orphan_transfer_count > 0 then
    v_anomalies := v_anomalies || jsonb_build_array(jsonb_build_object(
      'code', 'unassigned_savings_transfers', 'severity', 'critical', 'count', v_orphan_transfer_count,
      'message', format('%s transfert(s) d''épargne sans compte destinataire.', v_orphan_transfer_count)
    ));
  end if;
  if v_duplicate_savings_count > 0 then
    v_anomalies := v_anomalies || jsonb_build_array(jsonb_build_object(
      'code', 'duplicate_savings_accounts', 'severity', 'review', 'count', v_duplicate_savings_count,
      'message', format('%s référence(s) d''épargne sont rattachées à plusieurs fiches.', v_duplicate_savings_count)
    ));
  end if;

  if v_anomalies @> '[{"severity":"critical"}]'::jsonb then v_status := 'critical';
  elsif jsonb_array_length(v_anomalies) > 0 then v_status := 'review';
  end if;

  insert into public.monthly_accounting_audits (
    household_id, month, status, opening_balance, income, assigned_income,
    reimbursements, savings_withdrawals, resources, expenses, savings_transfers,
    operating_result, cash_after_savings, card_purchases, card_settlements,
    bank_balance, bank_balance_date, anomaly_count, anomalies, details, generated_by, generated_at
  ) values (
    p_household_id, p_month, v_status, round(v_opening, 2), round(v_income, 2), round(v_assigned, 2),
    round(v_reimbursements, 2), round(v_withdrawals, 2), round(v_assigned + v_reimbursements, 2),
    round(v_expenses, 2), round(v_transfers, 2),
    round(v_assigned + v_reimbursements - v_expenses, 2),
    round(v_assigned + v_reimbursements + v_withdrawals - v_expenses - v_transfers, 2),
    round(v_card_purchases, 2), round(v_card_settlements, 2), v_bank_balance, v_bank_date,
    jsonb_array_length(v_anomalies), v_anomalies,
    jsonb_build_object('period_start', v_start, 'period_end', v_end, 'method_version', 2),
    (select auth.uid()), now()
  )
  on conflict (household_id, month) do update set
    status = excluded.status, opening_balance = excluded.opening_balance,
    income = excluded.income, assigned_income = excluded.assigned_income,
    reimbursements = excluded.reimbursements, savings_withdrawals = excluded.savings_withdrawals,
    resources = excluded.resources, expenses = excluded.expenses,
    savings_transfers = excluded.savings_transfers, operating_result = excluded.operating_result,
    cash_after_savings = excluded.cash_after_savings, card_purchases = excluded.card_purchases,
    card_settlements = excluded.card_settlements, bank_balance = excluded.bank_balance,
    bank_balance_date = excluded.bank_balance_date, anomaly_count = excluded.anomaly_count,
    anomalies = excluded.anomalies, details = excluded.details,
    generated_by = excluded.generated_by, generated_at = excluded.generated_at
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.run_month_end_audit(uuid, text) from public, anon;
grant execute on function public.run_month_end_audit(uuid, text) to authenticated;

create schema if not exists private;
create or replace function private.run_scheduled_month_end_audits()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Brussels')::date;
  household record;
begin
  if v_today <> (date_trunc('month', v_today) + interval '1 month - 1 day')::date then return; end if;
  for household in select id from public.households loop
    perform public.run_month_end_audit(household.id, to_char(v_today, 'YYYY-MM'));
  end loop;
end;
$$;
revoke all on function private.run_scheduled_month_end_audits() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'mon-foyer-month-end-accounting-audit';
  perform cron.schedule(
    'mon-foyer-month-end-accounting-audit',
    '55 21 * * *',
    'select private.run_scheduled_month_end_audits();'
  );
end;
$$;

-- Consolidation des transferts d'août déjà identifiés, sans réécrire leur historique.
update public.operations set accounting_nature = 'internal_transfer'
where accounting_nature is null and (
  lower(label) like 'épargne %'
  or lower(label) in ('prime', 'argent de poche (beobank)', 'taxes / impôts', 'frais divers foyer', 'frais divers véhicule')
  or type = 'savings_transfer' or savings_direction = 'in'
);

update public.operations set accounting_nature = 'internal_transfer'
where lower(label) like 'epargne %' and accounting_nature <> 'internal_transfer';

-- Rattachement fonctionnel au compte d'épargne financé. Le compte actif ayant le
-- solde le plus élevé est retenu lorsqu'une ancienne fiche vide existe encore.
update public.operations op set
  savings_goal_id = (
    select sg.id from public.savings_goals sg
    where sg.household_id = op.household_id
      and sg.bucket = case
        when lower(op.label) like '%pension alain%' then 'pension_alain'
        when lower(op.label) like '%pension esther%' then 'pension_esther'
        when lower(op.label) like '%cadastre%' or lower(op.label) like '%contribution%' then 'taxes'
        when lower(op.label) like '%frais divers foyer%' then 'frais_maison'
        when lower(op.label) like '%frais divers véhicule%' then 'garage'
        when lower(op.label) like '%solde peugeot%' then 'solde_peugeot'
        when lower(op.label) like '%loisirs%' then 'vacances'
        else null end
    order by (sg.active is not false) desc, sg.saved desc, sg.created_at
    limit 1
  ),
  savings_direction = 'in',
  accounting_nature = 'internal_transfer'
where op.accounting_nature = 'internal_transfer'
  and op.savings_goal_id is null
  and (lower(op.label) like '%pension alain%'
    or lower(op.label) like '%pension esther%'
    or lower(op.label) like '%cadastre%'
    or lower(op.label) like '%contribution%'
    or lower(op.label) like '%frais divers foyer%'
    or lower(op.label) like '%frais divers véhicule%'
    or lower(op.label) like '%solde peugeot%'
    or lower(op.label) like '%loisirs%');

-- Les virements libellés Beobank alimentent le compte Vacances / Loisirs,
-- conformément à la règle de reconnaissance bancaire déjà utilisée par l'application.
update public.operations op set
  savings_goal_id = (
    select sg.id from public.savings_goals sg
    where sg.household_id = op.household_id and sg.bucket = 'vacances'
    order by (sg.active is not false) desc, sg.saved desc, sg.created_at
    limit 1
  ),
  savings_direction = 'in',
  accounting_nature = 'internal_transfer'
where op.accounting_nature = 'internal_transfer'
  and op.savings_goal_id is null
  and (lower(op.label) = 'prime' or lower(op.label) like '%beobank%');

-- Les anciennes fiches d'épargne vides en doublon sont désactivées, jamais supprimées.
update public.savings_goals empty_goal set active = false
where coalesce(empty_goal.saved, 0) = 0 and empty_goal.active is not false
  and exists (
    select 1 from public.savings_goals funded_goal
    where funded_goal.household_id = empty_goal.household_id
      and funded_goal.id <> empty_goal.id
      and funded_goal.active is not false
      and coalesce(funded_goal.saved, 0) > 0
      and coalesce(nullif(funded_goal.standing_order_reference, ''), funded_goal.bucket)
        = coalesce(nullif(empty_goal.standing_order_reference, ''), empty_goal.bucket)
  );

update public.operations set accounting_nature = case
  when type = 'income' and savings_direction = 'out' then 'savings_withdrawal'
  when type = 'income' then 'income'
  when type = 'reimbursement' then 'reimbursement'
  when type = 'card_settlement' then 'card_settlement'
  when coalesce(payment_method, '') ilike '%mastercard%' then 'card_purchase'
  when lower(label) like 'ajustement belfius%' then 'adjustment'
  else 'expense' end
where accounting_nature is null;

update public.recurring_fixed_expenses set accounting_nature = case
  when lower(label) like 'épargne %'
    or lower(label) in ('prime', 'argent de poche (beobank)', 'taxes / impôts', 'frais divers foyer', 'frais divers véhicule')
    then 'internal_transfer'
  when coalesce(payment_method, '') ilike '%mastercard%' then 'card_purchase'
  else 'expense' end
where accounting_nature is null;
