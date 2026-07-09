-- Mon Foyer - synchronisation des categories personnalisees
-- A lancer dans Supabase > SQL Editor.

begin;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id text not null,
  label text not null,
  type text not null check (type in ('variable', 'fixed')),
  icon text not null default 'divers',
  created_at timestamp with time zone default now(),
  unique (household_id, category_id)
);

alter table public.categories enable row level security;

revoke all on public.categories from anon;
grant select, insert, update, delete on public.categories to authenticated;

drop policy if exists "members can read categories" on public.categories;
drop policy if exists "members can insert categories" on public.categories;
drop policy if exists "members can update categories" on public.categories;
drop policy if exists "members can delete categories" on public.categories;

create policy "members can read categories"
on public.categories
for select
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = categories.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can insert categories"
on public.categories
for insert
to authenticated
with check (
  exists (
    select 1
    from public.household_members member
    where member.household_id = categories.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can update categories"
on public.categories
for update
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = categories.household_id
      and member.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.household_members member
    where member.household_id = categories.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can delete categories"
on public.categories
for delete
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = categories.household_id
      and member.user_id = auth.uid()
  )
);

commit;
