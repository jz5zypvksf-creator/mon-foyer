begin;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  is_read boolean not null default false,
  constraint messages_content_not_blank check (length(btrim(content)) > 0),
  constraint messages_content_max_length check (char_length(content) <= 4000),
  constraint messages_distinct_participants check (sender_id <> recipient_id)
);

create index if not exists messages_conversation_created_idx
  on public.messages (sender_id, recipient_id, created_at desc, id desc);

create index if not exists messages_recipient_unread_idx
  on public.messages (recipient_id, created_at desc)
  where is_read = false;

alter table public.messages enable row level security;
revoke all on table public.messages from anon, authenticated;
grant select, insert on table public.messages to authenticated;
grant update (is_read) on table public.messages to authenticated;

create policy "messages_select_participants"
on public.messages for select to authenticated
using (
  (select auth.uid()) = sender_id
  or (select auth.uid()) = recipient_id
);

create policy "messages_insert_as_sender"
on public.messages for insert to authenticated
with check (
  (select auth.uid()) = sender_id
  and recipient_id <> (select auth.uid())
  and is_read = false
);

create policy "messages_recipient_marks_read"
on public.messages for update to authenticated
using ((select auth.uid()) = recipient_id)
with check (
  (select auth.uid()) = recipient_id
  and is_read = true
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_not_blank check (length(btrim(endpoint)) > 0),
  constraint push_subscriptions_p256dh_not_blank check (length(btrim(p256dh)) > 0),
  constraint push_subscriptions_auth_not_blank check (length(btrim(auth)) > 0)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

create policy "push_subscriptions_select_own"
on public.push_subscriptions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "push_subscriptions_insert_own"
on public.push_subscriptions for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "push_subscriptions_update_own"
on public.push_subscriptions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "push_subscriptions_delete_own"
on public.push_subscriptions for delete to authenticated
using ((select auth.uid()) = user_id);

create schema if not exists private;

create or replace function private.broadcast_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'sender_id', new.sender_id,
      'recipient_id', new.recipient_id,
      'content', new.content,
      'created_at', new.created_at,
      'is_read', new.is_read
    ),
    'message_created',
    'user:' || new.recipient_id::text || ':messages',
    true
  );
  return new;
end;
$$;

revoke all on function private.broadcast_new_message() from public, anon, authenticated;

drop trigger if exists messages_broadcast_after_insert on public.messages;
create trigger messages_broadcast_after_insert
after insert on public.messages
for each row execute function private.broadcast_new_message();

create policy "message_recipients_receive_private_broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) = 'user:' || (select auth.uid())::text || ':messages'
);

commit;
