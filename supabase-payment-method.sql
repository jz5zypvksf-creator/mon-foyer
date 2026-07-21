-- Mon Foyer - moyen de paiement des operations
-- A lancer dans Supabase > SQL Editor.

begin;

alter table public.operations
add column if not exists payment_method text not null default 'Compte Belfius';

update public.operations
set payment_method = 'Compte Belfius'
where payment_method is null
   or trim(payment_method) = '';

commit;
