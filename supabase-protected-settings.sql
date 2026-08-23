-- Paramètres protégés de Mon Foyer.
-- Les budgets sont versionnés par mois afin de préserver l'historique.

create table if not exists public.household_budget_settings (
  household_id uuid not null references public.households(id) on delete cascade,
  effective_month text not null check (effective_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  food_budget numeric not null default 500 check (food_budget >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (household_id, effective_month)
);

create index if not exists household_budget_settings_updated_by_idx
on public.household_budget_settings (updated_by);

alter table public.household_budget_settings enable row level security;

drop policy if exists "members can read household budget settings" on public.household_budget_settings;
create policy "members can read household budget settings"
on public.household_budget_settings for select to authenticated
using (exists (
  select 1 from public.household_members member
  where member.household_id = household_budget_settings.household_id
    and member.user_id = (select auth.uid())
));

drop policy if exists "members can insert household budget settings" on public.household_budget_settings;
create policy "members can insert household budget settings"
on public.household_budget_settings for insert to authenticated
with check (exists (
  select 1 from public.household_members member
  where member.household_id = household_budget_settings.household_id
    and member.user_id = (select auth.uid())
));

drop policy if exists "members can update household budget settings" on public.household_budget_settings;
create policy "members can update household budget settings"
on public.household_budget_settings for update to authenticated
using (exists (
  select 1 from public.household_members member
  where member.household_id = household_budget_settings.household_id
    and member.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.household_members member
  where member.household_id = household_budget_settings.household_id
    and member.user_id = (select auth.uid())
));

create table if not exists public.care_people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  tracks_reimbursements boolean not null default true,
  exclude_from_food_budget boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists care_people_household_name_unique
on public.care_people (household_id, lower(trim(name)));

alter table public.care_people enable row level security;

drop policy if exists "members can read care people" on public.care_people;
create policy "members can read care people"
on public.care_people for select to authenticated
using (exists (
  select 1 from public.household_members member
  where member.household_id = care_people.household_id
    and member.user_id = (select auth.uid())
));

drop policy if exists "members can insert care people" on public.care_people;
create policy "members can insert care people"
on public.care_people for insert to authenticated
with check (exists (
  select 1 from public.household_members member
  where member.household_id = care_people.household_id
    and member.user_id = (select auth.uid())
));

drop policy if exists "members can update care people" on public.care_people;
create policy "members can update care people"
on public.care_people for update to authenticated
using (exists (
  select 1 from public.household_members member
  where member.household_id = care_people.household_id
    and member.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.household_members member
  where member.household_id = care_people.household_id
    and member.user_id = (select auth.uid())
));

alter table public.savings_goals
  add column if not exists bucket text,
  add column if not exists monthly_amount numeric not null default 0 check (monthly_amount >= 0),
  add column if not exists standing_order_reference text,
  add column if not exists standing_order_day integer check (standing_order_day is null or standing_order_day between 1 and 31),
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

insert into public.household_budget_settings (household_id, effective_month, food_budget)
select household.id, '2026-08', 500
from public.households household
on conflict (household_id, effective_month) do nothing;

insert into public.care_people (household_id, name)
select household.id, person.name
from public.households household
cross join (values ('Papa'), ('Nonna')) as person(name)
where not exists (
  select 1 from public.care_people existing
  where existing.household_id = household.id
    and lower(trim(existing.name)) = lower(person.name)
);

update public.savings_goals set
  bucket = case
    when lower(label) like '%vacance%' then 'vacances'
    when lower(label) like '%garage%' or lower(label) like '%entretien véhicule%' then 'garage'
    when lower(label) like '%taxe%' or lower(label) like '%impôt%' then 'taxes'
    when lower(label) in ('voiture', 'épargne solde peugeot') then 'solde_peugeot'
    when lower(label) in ('maison', 'frais divers maison / foyer') then 'frais_maison'
    when lower(label) like '%pension alain%' then 'pension_alain'
    when lower(label) like '%pension esther%' then 'pension_esther'
    when lower(label) like '%urgence%' then 'urgence'
    else coalesce(bucket, 'custom_' || replace(id::text, '-', ''))
  end,
  standing_order_reference = case
    when lower(label) like '%vacance%' then '18833987'
    when lower(label) like '%garage%' or lower(label) like '%entretien véhicule%' then '18838193'
    when lower(label) like '%taxe%' or lower(label) like '%impôt%' then '19776928'
    when lower(label) in ('voiture', 'épargne solde peugeot') then '18893403'
    when lower(label) in ('maison', 'frais divers maison / foyer') then '18833985'
    when lower(label) like '%pension alain%' then '17178591'
    when lower(label) like '%pension esther%' then '17178594'
    else standing_order_reference
  end,
  monthly_amount = case
    when lower(label) like '%vacance%' then 100
    when lower(label) like '%garage%' or lower(label) like '%entretien véhicule%' then 100
    when lower(label) like '%taxe%' or lower(label) like '%impôt%' then 300
    when lower(label) in ('maison', 'frais divers maison / foyer') then 100
    when lower(label) like '%pension alain%' then 110
    when lower(label) like '%pension esther%' then 110
    else monthly_amount
  end
where bucket is null;

grant select, insert, update on public.household_budget_settings to authenticated;
grant select, insert, update on public.care_people to authenticated;
