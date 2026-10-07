-- Ejecutar con rol administrativo en SQL Editor después de la migración 009.
-- Crea datos sintéticos dentro de una transacción y siempre termina en ROLLBACK.
begin;
do $$
declare
  cliente uuid := gen_random_uuid();
  otro_cliente uuid := gen_random_uuid();
  marca uuid := gen_random_uuid();
  referencia uuid := gen_random_uuid();
  identidad text := 'prueba' || replace(gen_random_uuid()::text, '-', '');
  encontrados integer;
begin
  insert into public.aivance_clients(id, slug, name)
    values (cliente, cliente::text, 'Prueba de identidad'),
           (otro_cliente, otro_cliente::text, 'Prueba de aislamiento');
  insert into public.catalog_brands(id, client_id, name)
    values (marca, cliente, 'Inventario sintético');
  insert into public.catalog_references(id, brand_id, name, species, category)
    values (referencia, marca, 'Referencia sin nombre comercial', 'gato', 'arena_sustrato');
  insert into public.catalog_presentations(reference_id, weight, price, metadata)
    values (referencia, '5kg', 12000, jsonb_build_object('nombre_original', identidad || ' x 5 kl'));

  select count(*) into encontrados
    from public.search_catalog_products(cliente, identidad, 20) r
    where r.reference_id = referencia and r.presentations->0->>'precio' = '12000';
  if encontrados <> 1 then
    raise exception 'La identidad exclusiva de metadata de presentación no se recuperó';
  end if;

  select count(*) into encontrados
    from public.search_catalog_products(otro_cliente, identidad, 20);
  if encontrados <> 0 then
    raise exception 'La búsqueda cruzó catálogos de clientes';
  end if;

  update public.catalog_presentations set active = false where reference_id = referencia;
  select count(*) into encontrados
    from public.search_catalog_products(cliente, identidad, 20) r where r.reference_id = referencia;
  if encontrados <> 0 then
    raise exception 'La identidad de una presentación inactiva sigue siendo buscable';
  end if;
  raise notice 'OK: metadata de presentación, precio, aislamiento e inactividad';
end $$;
rollback;
