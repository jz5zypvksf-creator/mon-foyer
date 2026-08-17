-- Stocke durablement le dernier solde Belfius certifié par audit CSV.
create table if not exists public.bank_snapshots (
  household_id uuid primary key references public.households(id) on delete cascade,
  balance numeric(12,2) not null,
  balance_date text not null default '',
  imported_at timestamptz not null default now(),
  pending_amount numeric(12,2) not null default 0,
  remaining integer not null default 0 check (remaining >= 0),
  confirmations integer not null default 0 check (confirmations >= 0),
  anomalies integer not null default 0 check (anomalies >= 0),
  clean boolean not null default false,
  source_file text,
  updated_at timestamptz not null default now()
);

alter table public.bank_snapshots enable row level security;

grant select, insert, update on public.bank_snapshots to authenticated;
revoke all on public.bank_snapshots from anon;

drop policy if exists "members can read bank snapshots" on public.bank_snapshots;
create policy "members can read bank snapshots"
on public.bank_snapshots for select to authenticated
using (exists (
  select 1 from public.household_members member
  where member.household_id = bank_snapshots.household_id
    and member.user_id = (select auth.uid())
));

drop policy if exists "members can insert bank snapshots" on public.bank_snapshots;
create policy "members can insert bank snapshots"
on public.bank_snapshots for insert to authenticated
with check (exists (
  select 1 from public.household_members member
  where member.household_id = bank_snapshots.household_id
    and member.user_id = (select auth.uid())
));

drop policy if exists "members can update bank snapshots" on public.bank_snapshots;
create policy "members can update bank snapshots"
on public.bank_snapshots for update to authenticated
using (exists (
  select 1 from public.household_members member
  where member.household_id = bank_snapshots.household_id
    and member.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.household_members member
  where member.household_id = bank_snapshots.household_id
    and member.user_id = (select auth.uid())
));
