-- Multi-tenant / multi-vertical hardening.
-- Run after supabase/004_multiempresa_catalog.sql in existing databases.

alter table public.aivance_clients
  add column if not exists business_type text;

update public.aivance_clients
set business_type = vertical
where business_type is null;

alter table public.client_channels
  add column if not exists workspace_id text,
  add column if not exists integration_id text;

create unique index if not exists client_channels_provider_channel_phone_number_active_idx
  on public.client_channels (provider, channel, phone_number_id)
  where active = true and phone_number_id is not null;

create index if not exists client_channels_provider_channel_workspace_active_idx
  on public.client_channels (provider, channel, workspace_id)
  where active = true and workspace_id is not null;

create index if not exists client_channels_provider_channel_integration_active_idx
  on public.client_channels (provider, channel, integration_id)
  where active = true and integration_id is not null;

insert into public.aivance_clients
  (slug, name, vertical, business_type, owner_platform, status, settings)
values
  (
    'sanmarcospetsclub',
    'San Marcos Pets Club',
    'guarderia',
    'guarderia',
    'AIVANCE',
    'setup_pending',
    '{
      "vertical_status": "placeholder",
      "notes": "Cliente preparado para conectar cuando se implemente la vertical guarderia.",
      "required_before_activation": [
        "implementar flujo guarderia",
        "registrar canal Kapso",
        "configurar horarios/reglas",
        "probar webhook extremo a extremo"
      ]
    }'::jsonb
  )
on conflict (slug) do update
set
  name = excluded.name,
  vertical = excluded.vertical,
  business_type = excluded.business_type,
  owner_platform = excluded.owner_platform,
  settings = public.aivance_clients.settings || excluded.settings,
  updated_at = now();

insert into public.client_prompts
  (client_id, prompt_key, content, active, priority, metadata)
select
  id,
  'humanizer',
  'Tono claro, amable y cuidadoso. No confirmar cupos, reservas, precios ni horarios hasta que la vertical guarderia tenga reglas operativas implementadas.',
  true,
  100,
  '{"source": "006_multi_vertical_clients"}'::jsonb
from public.aivance_clients
where slug = 'sanmarcospetsclub'
on conflict (client_id, prompt_key) do update
set
  content = excluded.content,
  active = excluded.active,
  priority = excluded.priority,
  metadata = excluded.metadata,
  updated_at = now();
