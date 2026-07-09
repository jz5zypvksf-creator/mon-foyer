-- Mon Foyer - securisation Supabase
-- A lancer dans Supabase > SQL Editor.
--
-- IMPORTANT:
-- 1. Verifie que awdb@icloud.com est bien l'adresse du compte Alain.
-- 2. Verifie que ewdb@icloud.com est bien l'adresse du compte Esther.
-- 3. Lance tout le script en une fois.

begin;

-- Cette fonction avait servi pendant les premiers essais et Supabase la signale.
-- Elle n'est pas necessaire au fonctionnement de Mon Foyer.
drop function if exists public.rls_auto_enable();

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamp with time zone default now(),
  unique (household_id, user_id)
);

-- Ajout des comptes autorises pour le foyer Alain & Esther.
insert into public.household_members (household_id, user_id, role)
select
  'f7bba85b-3ead-45e1-8802-f9bf7a9965de'::uuid,
  users.id,
  members.role
from auth.users users
join (
  values
    ('awdb@icloud.com', 'admin'),
    ('ewdb@icloud.com', 'member')
) as members(email, role)
  on lower(users.email) = lower(members.email)
on conflict (household_id, user_id) do update
set role = excluded.role;

alter table public.households enable row level security;
alter table public.messages enable row level security;
alter table public.operations enable row level security;
alter table public.stores enable row level security;
alter table public.savings_goals enable row level security;
alter table public.household_members enable row level security;

revoke all on public.households from anon;
revoke all on public.messages from anon;
revoke all on public.operations from anon;
revoke all on public.stores from anon;
revoke all on public.savings_goals from anon;
revoke all on public.household_members from anon;

grant select on public.households to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.operations to authenticated;
grant select, insert, update, delete on public.stores to authenticated;
grant select, insert, update, delete on public.savings_goals to authenticated;
grant select on public.household_members to authenticated;

drop policy if exists "members can read their household" on public.households;
drop policy if exists "members can read messages" on public.messages;
drop policy if exists "members can insert messages" on public.messages;
drop policy if exists "members can update messages" on public.messages;
drop policy if exists "members can delete messages" on public.messages;
drop policy if exists "members can read operations" on public.operations;
drop policy if exists "members can insert operations" on public.operations;
drop policy if exists "members can update operations" on public.operations;
drop policy if exists "members can delete operations" on public.operations;
drop policy if exists "members can read stores" on public.stores;
drop policy if exists "members can insert stores" on public.stores;
drop policy if exists "members can update stores" on public.stores;
drop policy if exists "members can delete stores" on public.stores;
drop policy if exists "members can read savings goals" on public.savings_goals;
drop policy if exists "members can insert savings goals" on public.savings_goals;
drop policy if exists "members can update savings goals" on public.savings_goals;
drop policy if exists "members can delete savings goals" on public.savings_goals;
drop policy if exists "users can read their membership" on public.household_members;

create policy "users can read their membership"
on public.household_members
for select
to authenticated
using (user_id = auth.uid());

create policy "members can read their household"
on public.households
for select
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = households.id
      and member.user_id = auth.uid()
  )
);

create policy "members can read messages"
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = messages.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can insert messages"
on public.messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.household_members member
    where member.household_id = messages.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can update messages"
on public.messages
for update
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = messages.household_id
      and member.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.household_members member
    where member.household_id = messages.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can delete messages"
on public.messages
for delete
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = messages.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can read operations"
on public.operations
for select
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = operations.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can insert operations"
on public.operations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.household_members member
    where member.household_id = operations.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can update operations"
on public.operations
for update
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = operations.household_id
      and member.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.household_members member
    where member.household_id = operations.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can delete operations"
on public.operations
for delete
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = operations.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can read stores"
on public.stores
for select
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = stores.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can insert stores"
on public.stores
for insert
to authenticated
with check (
  exists (
    select 1
    from public.household_members member
    where member.household_id = stores.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can update stores"
on public.stores
for update
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = stores.household_id
      and member.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.household_members member
    where member.household_id = stores.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can delete stores"
on public.stores
for delete
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = stores.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can read savings goals"
on public.savings_goals
for select
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = savings_goals.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can insert savings goals"
on public.savings_goals
for insert
to authenticated
with check (
  exists (
    select 1
    from public.household_members member
    where member.household_id = savings_goals.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can update savings goals"
on public.savings_goals
for update
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = savings_goals.household_id
      and member.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.household_members member
    where member.household_id = savings_goals.household_id
      and member.user_id = auth.uid()
  )
);

create policy "members can delete savings goals"
on public.savings_goals
for delete
to authenticated
using (
  exists (
    select 1
    from public.household_members member
    where member.household_id = savings_goals.household_id
      and member.user_id = auth.uid()
  )
);

commit;
