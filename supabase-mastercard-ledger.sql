-- Grand livre Mastercard : achats détaillés, règlement Belfius et solde bancaire certifié.
-- Le numéro complet de la carte n'est jamais stocké ; seul le libellé masqué est utilisé.

alter table public.operations
  add column if not exists settles_payment_method text,
  add column if not exists settlement_date date;

alter table public.recurring_fixed_expenses
  add column if not exists payment_method text not null default 'Compte Belfius';

alter table public.bank_snapshots
  add column if not exists live_balance numeric,
  add column if not exists live_balance_date timestamptz,
  add column if not exists live_balance_source text,
  add column if not exists live_operation_state jsonb not null default '{}'::jsonb;

create index if not exists operations_settlement_date_idx
  on public.operations (household_id, settlement_date)
  where settlement_date is not null;

comment on column public.operations.settles_payment_method is
  'Compte de carte apuré par un règlement bancaire interne.';
comment on column public.operations.settlement_date is
  'Date prévue du prélèvement bancaire d’un achat par carte.';
comment on column public.bank_snapshots.live_balance is
  'Solde certifié depuis l’application bancaire, distinct du dernier CSV.';
