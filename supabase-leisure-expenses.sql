-- Synchronise les dépenses Loisirs/Vacances entre les appareils.
create table if not exists public.leisure_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  date date not null,
  amount numeric(12,2) not null check (amount > 0),
  vendor text not null,
  place text not null,
  category text not null default 'other',
  note text not null default '',
  balance_after numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leisure_expenses_household_date_idx
on public.leisure_expenses (household_id, date desc);

alter table public.leisure_expenses enable row level security;
grant select, insert, update, delete on public.leisure_expenses to authenticated;
revoke all on public.leisure_expenses from anon;

drop policy if exists "members can read leisure expenses" on public.leisure_expenses;
create policy "members can read leisure expenses"
on public.leisure_expenses for select to authenticated
using (exists (
  select 1 from public.household_members member
  where member.household_id = leisure_expenses.household_id
    and member.user_id = (select auth.uid())
));

drop policy if exists "members can insert leisure expenses" on public.leisure_expenses;
create policy "members can insert leisure expenses"
on public.leisure_expenses for insert to authenticated
with check (exists (
  select 1 from public.household_members member
  where member.household_id = leisure_expenses.household_id
    and member.user_id = (select auth.uid())
));

drop policy if exists "members can update leisure expenses" on public.leisure_expenses;
create policy "members can update leisure expenses"
on public.leisure_expenses for update to authenticated
using (exists (
  select 1 from public.household_members member
  where member.household_id = leisure_expenses.household_id
    and member.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.household_members member
  where member.household_id = leisure_expenses.household_id
    and member.user_id = (select auth.uid())
));

drop policy if exists "members can delete leisure expenses" on public.leisure_expenses;
create policy "members can delete leisure expenses"
on public.leisure_expenses for delete to authenticated
using (exists (
  select 1 from public.household_members member
  where member.household_id = leisure_expenses.household_id
    and member.user_id = (select auth.uid())
));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='leisure_expenses'
  ) then
    alter publication supabase_realtime add table public.leisure_expenses;
  end if;
end $$;
