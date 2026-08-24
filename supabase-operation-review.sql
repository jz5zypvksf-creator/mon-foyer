-- Reconstruction du suivi de contrôle bancaire des opérations.
-- Script idempotent à exécuter dans l'éditeur SQL Supabase.

alter table public.operations
  add column if not exists review_status text not null default 'unreviewed',
  add column if not exists review_note text,
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists dispute_reference text,
  add column if not exists resolved_at timestamptz;

alter table public.operations
  drop constraint if exists operations_review_status_check;

alter table public.operations
  add constraint operations_review_status_check
  check (review_status in ('unreviewed', 'verified', 'disputed', 'resolved'));
