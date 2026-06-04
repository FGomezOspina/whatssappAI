create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists public.aivance_clients (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  vertical text not null default 'generic',
  owner_platform text not null default 'AIVANCE',
  status text not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.aivance_clients
  add column if not exists vertical text not null default 'generic';

insert into public.aivance_clients (slug, name, vertical, owner_platform, status)
values ('distrifinca', 'Distrifinca', 'petshop', 'AIVANCE', 'active')
on conflict (slug) do update
set
  name = excluded.name,
  vertical = excluded.vertical,
  owner_platform = excluded.owner_platform,
  status = excluded.status,
  updated_at = now();

create table if not exists public.client_channels (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.aivance_clients(id) on delete cascade,
  provider text not null,
  channel text not null,
  phone_number_id text,
  display_name text,
  settings jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, provider, channel, phone_number_id)
);

create table if not exists public.client_prompts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.aivance_clients(id) on delete cascade,
  prompt_key text not null,
  content text not null,
  active boolean not null default true,
  priority integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, prompt_key)
);

create table if not exists public.client_delivery_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.aivance_clients(id) on delete cascade,
  rule_type text not null,
  name text not null,
  value jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  priority integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, rule_type, name)
);

create table if not exists public.catalog_brands (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.aivance_clients(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, name)
);

create table if not exists public.catalog_references (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.catalog_brands(id) on delete cascade,
  name text not null,
  species text not null default 'perro',
  category text,
  subcategory text,
  life_stage text,
  requires_confirmation boolean not null default false,
  description text,
  image_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, name)
);

alter table public.catalog_references
  add column if not exists category text,
  add column if not exists subcategory text,
  add column if not exists life_stage text,
  add column if not exists requires_confirmation boolean not null default false;

create table if not exists public.catalog_presentations (
  id uuid primary key default gen_random_uuid(),
  reference_id uuid not null references public.catalog_references(id) on delete cascade,
  weight text not null,
  price integer not null,
  currency text not null default 'COP',
  stock boolean,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reference_id, weight)
);

alter table public.catalog_presentations
  add column if not exists stock boolean;

alter table public.whatsapp_conversations
  add column if not exists client_id uuid references public.aivance_clients(id) on delete restrict;

update public.whatsapp_conversations
set client_id = (select id from public.aivance_clients where slug = 'distrifinca')
where client_id is null;

alter table public.whatsapp_conversations
  alter column client_id set not null;

alter table public.whatsapp_messages
  add column if not exists client_id uuid references public.aivance_clients(id) on delete restrict;

update public.whatsapp_messages message
set client_id = conversation.client_id
from public.whatsapp_conversations conversation
where message.client_id is null
  and message.channel_user_id = conversation.channel_user_id;

update public.whatsapp_messages
set client_id = (select id from public.aivance_clients where slug = 'distrifinca')
where client_id is null;

alter table public.whatsapp_messages
  alter column client_id set not null;

alter table public.whatsapp_orders
  add column if not exists client_id uuid references public.aivance_clients(id) on delete restrict;

update public.whatsapp_orders orders
set client_id = conversation.client_id
from public.whatsapp_conversations conversation
where orders.client_id is null
  and orders.channel_user_id = conversation.channel_user_id;

update public.whatsapp_orders
set client_id = (select id from public.aivance_clients where slug = 'distrifinca')
where client_id is null;

alter table public.whatsapp_orders
  alter column client_id set not null;

alter table public.training_examples
  add column if not exists client_id uuid references public.aivance_clients(id) on delete cascade;

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_channel_user_id_key;

alter table public.whatsapp_orders
  drop constraint if exists whatsapp_orders_channel_user_id_order_key_key;

create unique index if not exists whatsapp_conversations_client_channel_user_id_key
  on public.whatsapp_conversations (client_id, channel_user_id);

create unique index if not exists whatsapp_orders_client_channel_user_id_order_key_key
  on public.whatsapp_orders (client_id, channel_user_id, order_key);

create index if not exists whatsapp_messages_client_channel_user_id_created_at_idx
  on public.whatsapp_messages (client_id, channel_user_id, created_at desc);

create index if not exists whatsapp_orders_client_id_confirmed_at_idx
  on public.whatsapp_orders (client_id, confirmed_at desc);

create index if not exists catalog_brands_client_active_idx
  on public.catalog_brands (client_id, active, sort_order asc);

create index if not exists catalog_references_brand_active_idx
  on public.catalog_references (brand_id, active, sort_order asc);

create index if not exists catalog_references_petshop_filters_idx
  on public.catalog_references (category, subcategory, species, life_stage, active);

create index if not exists catalog_presentations_reference_active_idx
  on public.catalog_presentations (reference_id, active, sort_order asc);

create index if not exists training_examples_client_active_priority_idx
  on public.training_examples (client_id, active, priority desc, created_at desc);

create index if not exists client_prompts_client_active_priority_idx
  on public.client_prompts (client_id, active, priority desc);

create index if not exists client_delivery_rules_client_active_priority_idx
  on public.client_delivery_rules (client_id, active, priority desc);

alter table public.aivance_clients enable row level security;
alter table public.client_channels enable row level security;
alter table public.client_prompts enable row level security;
alter table public.client_delivery_rules enable row level security;
alter table public.catalog_brands enable row level security;
alter table public.catalog_references enable row level security;
alter table public.catalog_presentations enable row level security;

drop trigger if exists set_aivance_clients_updated_at on public.aivance_clients;
create trigger set_aivance_clients_updated_at
before update on public.aivance_clients
for each row
execute function public.set_updated_at();

drop trigger if exists set_client_channels_updated_at on public.client_channels;
create trigger set_client_channels_updated_at
before update on public.client_channels
for each row
execute function public.set_updated_at();

drop trigger if exists set_client_prompts_updated_at on public.client_prompts;
create trigger set_client_prompts_updated_at
before update on public.client_prompts
for each row
execute function public.set_updated_at();

drop trigger if exists set_client_delivery_rules_updated_at on public.client_delivery_rules;
create trigger set_client_delivery_rules_updated_at
before update on public.client_delivery_rules
for each row
execute function public.set_updated_at();

drop trigger if exists set_catalog_brands_updated_at on public.catalog_brands;
create trigger set_catalog_brands_updated_at
before update on public.catalog_brands
for each row
execute function public.set_updated_at();

drop trigger if exists set_catalog_references_updated_at on public.catalog_references;
create trigger set_catalog_references_updated_at
before update on public.catalog_references
for each row
execute function public.set_updated_at();

drop trigger if exists set_catalog_presentations_updated_at on public.catalog_presentations;
create trigger set_catalog_presentations_updated_at
before update on public.catalog_presentations
for each row
execute function public.set_updated_at();
