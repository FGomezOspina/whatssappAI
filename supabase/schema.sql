create extension if not exists pgcrypto;

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  channel_user_id text not null unique,
  customer jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  status text not null default 'conversacion_abierta',
  last_message text,
  last_response text,
  last_interaction_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  channel_user_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_channel_user_id_created_at_idx
  on public.whatsapp_messages (channel_user_id, created_at desc);

create index if not exists whatsapp_messages_conversation_id_created_at_idx
  on public.whatsapp_messages (conversation_id, created_at asc);

create index if not exists whatsapp_conversations_status_idx
  on public.whatsapp_conversations (status);

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

create table if not exists public.training_examples (
  id uuid primary key default gen_random_uuid(),
  intent text not null,
  customer_message text not null,
  ideal_response text not null,
  notes text,
  tags text[] not null default '{}'::text[],
  active boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_examples_active_priority_idx
  on public.training_examples (active, priority desc, created_at desc);

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_orders enable row level security;
alter table public.training_examples enable row level security;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_whatsapp_conversations_updated_at on public.whatsapp_conversations;

create trigger set_whatsapp_conversations_updated_at
before update on public.whatsapp_conversations
for each row
execute function public.set_updated_at();

drop trigger if exists set_whatsapp_orders_updated_at on public.whatsapp_orders;

create trigger set_whatsapp_orders_updated_at
before update on public.whatsapp_orders
for each row
execute function public.set_updated_at();

drop trigger if exists set_training_examples_updated_at on public.training_examples;

create trigger set_training_examples_updated_at
before update on public.training_examples
for each row
execute function public.set_updated_at();
