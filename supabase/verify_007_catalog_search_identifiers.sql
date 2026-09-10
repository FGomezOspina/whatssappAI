-- Solo lectura. Ejecutar en SQL Editor despues de la migracion 007.
select
  position('''simple''' in pg_get_functiondef(
    'public.catalog_search_tsquery(text)'::regprocedure)) > 0
    as consulta_conserva_siglas,
  position('''simple''' in pg_get_functiondef(
    'public.search_catalog_products(uuid,text,integer)'::regprocedure)) > 0
    and position('''spanish''' in pg_get_functiondef(
      'public.search_catalog_products(uuid,text,integer)'::regprocedure)) = 0
    as busqueda_conserva_siglas,
  public.catalog_search_tsquery('EN')::text as prueba_sigla;
-- Esperado: true | true | 'en':*
