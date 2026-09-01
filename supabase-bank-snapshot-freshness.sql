-- Empêche un ancien CSV conservé sur un appareil de remplacer un relevé bancaire
-- plus récent déjà synchronisé dans Supabase.

create schema if not exists private;

create or replace function private.bank_snapshot_date(p_value text)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value ~ '^\d{2}/\d{2}/\d{4}' then
    return to_timestamp(left(p_value, 19), 'DD/MM/YYYY HH24:MI:SS');
  end if;
  if p_value ~ '^\d{4}-\d{2}-\d{2}' then
    return left(p_value, 19)::timestamp at time zone 'Europe/Brussels';
  end if;
  return null;
exception when others then
  return null;
end;
$$;

revoke all on function private.bank_snapshot_date(text) from public, anon, authenticated;

create or replace function private.preserve_newest_bank_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if private.bank_snapshot_date(new.balance_date)
      < private.bank_snapshot_date(old.balance_date) then
    new.balance := old.balance;
    new.balance_date := old.balance_date;
    new.imported_at := old.imported_at;
    new.pending_amount := old.pending_amount;
    new.remaining := old.remaining;
    new.confirmations := old.confirmations;
    new.anomalies := old.anomalies;
    new.clean := old.clean;
    new.source_file := old.source_file;
    new.operation_state := old.operation_state;
    new.opening_month := old.opening_month;
    new.opening_balance := old.opening_balance;
    new.opening_balances := old.opening_balances;
  end if;
  return new;
end;
$$;

drop trigger if exists preserve_newest_bank_snapshot on public.bank_snapshots;
create trigger preserve_newest_bank_snapshot
before update on public.bank_snapshots
for each row execute function private.preserve_newest_bank_snapshot();
