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
  business_type text,
  owner_platform text not null default 'AIVANCE',
  status text not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.aivance_clients (slug, name, vertical, business_type, owner_platform, status)
values ('distrifinca', 'Distrifinca', 'petshop', 'petshop', 'AIVANCE', 'active')
on conflict (slug) do update
set
  name = excluded.name,
  vertical = excluded.vertical,
  business_type = excluded.business_type,
  owner_platform = excluded.owner_platform,
  status = excluded.status,
  updated_at = now();

insert into public.aivance_clients (slug, name, vertical, business_type, owner_platform, status, settings)
values (
  'sanmarcospetsclub',
  'San Marcos Pets Club',
  'guarderia',
  'guarderia',
  'AIVANCE',
  'setup_pending',
  '{"vertical_status": "placeholder"}'::jsonb
)
on conflict (slug) do update
set
  name = excluded.name,
  vertical = excluded.vertical,
  business_type = excluded.business_type,
  owner_platform = excluded.owner_platform,
  settings = public.aivance_clients.settings || excluded.settings,
  updated_at = now();

create table if not exists public.client_channels (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.aivance_clients(id) on delete cascade,
  provider text not null,
  channel text not null,
  phone_number_id text,
  workspace_id text,
  integration_id text,
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

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.aivance_clients(id) on delete restrict,
  channel_user_id text not null,
  customer jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  status text not null default 'conversacion_abierta',
  last_message text,
  last_response text,
  last_interaction_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, channel_user_id)
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.aivance_clients(id) on delete restrict,
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  channel_user_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.aivance_clients(id) on delete restrict,
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  channel_user_id text not null,
  order_key text not null,
  order_snapshot jsonb not null default '{}'::jsonb,
  total integer not null default 0,
  status text not null default 'confirmado',
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, channel_user_id, order_key)
);

create table if not exists public.training_examples (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.aivance_clients(id) on delete cascade,
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

create index if not exists whatsapp_messages_client_channel_user_id_created_at_idx
  on public.whatsapp_messages (client_id, channel_user_id, created_at desc);

create index if not exists whatsapp_messages_conversation_id_created_at_idx
  on public.whatsapp_messages (conversation_id, created_at asc);

create index if not exists whatsapp_conversations_status_idx
  on public.whatsapp_conversations (status);

create index if not exists whatsapp_orders_client_id_confirmed_at_idx
  on public.whatsapp_orders (client_id, confirmed_at desc);

create index if not exists whatsapp_orders_conversation_id_idx
  on public.whatsapp_orders (conversation_id);

create index if not exists training_examples_active_priority_idx
  on public.training_examples (active, priority desc, created_at desc);

create index if not exists training_examples_client_active_priority_idx
  on public.training_examples (client_id, active, priority desc, created_at desc);

create index if not exists client_prompts_client_active_priority_idx
  on public.client_prompts (client_id, active, priority desc);

create index if not exists client_delivery_rules_client_active_priority_idx
  on public.client_delivery_rules (client_id, active, priority desc);

create unique index if not exists client_channels_provider_channel_phone_number_active_idx
  on public.client_channels (provider, channel, phone_number_id)
  where active = true and phone_number_id is not null;

create index if not exists client_channels_provider_channel_workspace_active_idx
  on public.client_channels (provider, channel, workspace_id)
  where active = true and workspace_id is not null;

create index if not exists client_channels_provider_channel_integration_active_idx
  on public.client_channels (provider, channel, integration_id)
  where active = true and integration_id is not null;

create index if not exists catalog_brands_client_active_idx
  on public.catalog_brands (client_id, active, sort_order asc);

create index if not exists catalog_references_brand_active_idx
  on public.catalog_references (brand_id, active, sort_order asc);

create index if not exists catalog_references_petshop_filters_idx
  on public.catalog_references (category, subcategory, species, life_stage, active);

create index if not exists catalog_presentations_reference_active_idx
  on public.catalog_presentations (reference_id, active, sort_order asc);

alter table public.aivance_clients enable row level security;
alter table public.client_channels enable row level security;
alter table public.client_prompts enable row level security;
alter table public.client_delivery_rules enable row level security;
alter table public.catalog_brands enable row level security;
alter table public.catalog_references enable row level security;
alter table public.catalog_presentations enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_orders enable row level security;
alter table public.training_examples enable row level security;

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
