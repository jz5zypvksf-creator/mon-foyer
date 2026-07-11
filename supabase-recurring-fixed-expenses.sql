-- Mon Foyer - synchronisation des frais fixes recurrents
-- A lancer dans Supabase > SQL Editor.

begin;

create table if not exists public.recurring_fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  label text not null,
  amount numeric not null default 0,
  day integer not null check (day between 1 and 31),
  person text not null,
  category text not null,
  created_at timestamp with time zone default now()
);

alter table public.recurring_fixed_expenses enable row level security;

revoke all on public.recurring_fixed_expenses from anon;
grant select, insert, update, delete on public.recurring_fixed_expenses to authenticated;

drop policy if exists "members can read recurring fixed expenses" on public.recurring_fixed_expenses;
drop policy if exists "members can insert recurring fixed expenses" on public.recurring_fixed_expenses;
drop policy if exists "members can update recurring fixed expenses" on public.recurring_fixed_expenses;
drop policy if exists "members can delete recurring fixed expenses" on public.recurring_fixed_expenses;

create policy "members can read recurring fixed expenses"
on public.recurring_fixed_expenses
for select
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = recurring_fixed_expenses.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can insert recurring fixed expenses"
on public.recurring_fixed_expenses
for insert
to authenticated
with check (
  exists (
    select 1
    from public.household_members member
    where member.household_id = recurring_fixed_expenses.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can update recurring fixed expenses"
on public.recurring_fixed_expenses
for update
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = recurring_fixed_expenses.household_id
      and member.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.household_members member
    where member.household_id = recurring_fixed_expenses.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can delete recurring fixed expenses"
on public.recurring_fixed_expenses
for delete
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = recurring_fixed_expenses.household_id
      and member.user_id = auth.uid()
  )
);

commit;
