create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

alter table public.whatsapp_messages
  add column if not exists conversation_id uuid references public.whatsapp_conversations(id) on delete set null;

update public.whatsapp_messages message
set conversation_id = conversation.id
from public.whatsapp_conversations conversation
where message.conversation_id is null
  and message.channel_user_id = conversation.channel_user_id;

create index if not exists whatsapp_messages_conversation_id_created_at_idx
  on public.whatsapp_messages (conversation_id, created_at asc);

create table if not exists public.whatsapp_orders (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  channel_user_id text not null,
  order_key text not null,
  order_snapshot jsonb not null default '{}'::jsonb,
  total integer not null default 0,
  status text not null default 'confirmado',
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_user_id, order_key)
);

create index if not exists whatsapp_orders_channel_user_id_confirmed_at_idx
  on public.whatsapp_orders (channel_user_id, confirmed_at desc);

create index if not exists whatsapp_orders_conversation_id_idx
  on public.whatsapp_orders (conversation_id);

alter table public.whatsapp_orders enable row level security;

drop trigger if exists set_whatsapp_orders_updated_at on public.whatsapp_orders;

create trigger set_whatsapp_orders_updated_at
before update on public.whatsapp_orders
for each row
execute function public.set_updated_at();
