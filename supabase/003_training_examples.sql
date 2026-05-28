create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

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

alter table public.training_examples enable row level security;

drop trigger if exists set_training_examples_updated_at on public.training_examples;

create trigger set_training_examples_updated_at
before update on public.training_examples
for each row
execute function public.set_updated_at();

insert into public.training_examples (intent, customer_message, ideal_response, notes, tags, priority)
values
  (
    'nuevo_pedido_producto_exacto',
    'Cliente: hola para hacer otro pedido. Agente: muestra pedido anterior y pregunta si desea repetirlo. Cliente: para un dog chow a.rp 4kg',
    'Perfecto, te agrego el Dog Chow Adulto Mini y Pequeño 4kg al pedido. Luego confirmo si va para la misma direccion o si cambiamos datos de envio.',
    'Cuando el cliente responde con producto, referencia y presentacion exacta despues de preguntar si repite pedido anterior, no se debe sumar el pedido viejo ni pedir presentacion otra vez.',
    array['nuevo pedido', 'producto exacto', 'no preguntar de mas'],
    100
  ),
  (
    'pedir_un_solo_dato',
    'Cliente confirma un producto pero falta direccion de envio.',
    'Pedir solo la direccion, sin repetir marcas, precios ni datos que ya estan claros.',
    'Si falta un unico dato para avanzar, pedir solo ese dato.',
    array['dato faltante', 'directo', 'domicilio'],
    90
  ),
  (
    'varias_preguntas',
    'Cliente pregunta precio y tambien pregunta si hay otra presentacion.',
    'Responder breve y ordenado: precio actual, presentaciones disponibles y una sola pregunta de cierre.',
    'Si el cliente pregunta varias cosas, responder cada una sin extenderse.',
    array['preguntas multiples', 'breve', 'ordenado'],
    70
  )
on conflict do nothing;
