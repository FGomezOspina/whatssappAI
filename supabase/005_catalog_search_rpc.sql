create extension if not exists unaccent;
create extension if not exists pg_trgm;

create or replace function public.catalog_search_normalize(value text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      lower(public.unaccent(coalesce(value, ''))),
      '[^a-z0-9.]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.catalog_search_expand_query(value text)
returns text
language plpgsql
immutable
as $$
declare
  normalized text := public.catalog_search_normalize(value);
  expanded text := normalized;
begin
  if normalized ~ 'dog\s*chow|dogchow|doc\s*chow|dog\s*show' then
    expanded := expanded || ' dog chow';
  end if;

  if normalized ~ 'brabecto|bravecto' then
    expanded := expanded || ' bravecto';
  end if;

  if normalized ~ 'purg|desparas|parasito|antiparas' then
    expanded := expanded || ' desparasitante medicamento purgante antiparasitario';
  end if;

  if normalized ~ 'pulga|garrapata' then
    expanded := expanded || ' antipulgas medicamento pulgas garrapatas';
  end if;

  if normalized ~ 'snack|premio|galleta' then
    expanded := expanded || ' snack premio';
  end if;

  if normalized ~ 'arena|sustrato' then
    expanded := expanded || ' arena sustrato gato';
  end if;

  if normalized ~ 'juguete|pelota|mordedor' then
    expanded := expanded || ' juguete accesorio';
  end if;

  return public.catalog_search_normalize(expanded);
end;
$$;

create or replace function public.catalog_search_tsquery(value text)
returns tsquery
language sql
immutable
as $$
  select coalesce(
    (
      select to_tsquery('spanish', string_agg(token || ':*', ' | '))
      from (
        select distinct regexp_replace(token, '[^a-z0-9]+', '', 'g') as token
        from regexp_split_to_table(public.catalog_search_expand_query(value), '\s+') as token
      ) tokens
      where token <> '' and length(token) > 1
    ),
    ''::tsquery
  );
$$;

create index if not exists catalog_brands_name_trgm_idx
  on public.catalog_brands using gin (public.catalog_search_normalize(name) gin_trgm_ops)
  where active = true;

create index if not exists catalog_references_search_fts_idx
  on public.catalog_references using gin (
    to_tsvector(
      'spanish',
      public.catalog_search_normalize(
        coalesce(name, '') || ' ' ||
        coalesce(species, '') || ' ' ||
        coalesce(category, '') || ' ' ||
        coalesce(subcategory, '') || ' ' ||
        coalesce(life_stage, '') || ' ' ||
        coalesce(description, '') || ' ' ||
        coalesce(metadata::text, '')
      )
    )
  )
  where active = true;

create index if not exists catalog_references_name_trgm_idx
  on public.catalog_references using gin (public.catalog_search_normalize(name) gin_trgm_ops)
  where active = true;

create index if not exists catalog_presentations_weight_trgm_idx
  on public.catalog_presentations using gin (public.catalog_search_normalize(weight) gin_trgm_ops)
  where active = true;

create or replace function public.search_catalog_products(
  p_client_id uuid,
  p_query text,
  p_limit integer default 20
)
returns table (
  brand_id uuid,
  reference_id uuid,
  brand_name text,
  reference_name text,
  species text,
  category text,
  subcategory text,
  life_stage text,
  requires_confirmation boolean,
  description text,
  image_url text,
  reference_metadata jsonb,
  presentations jsonb,
  score numeric,
  match_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      p_client_id as client_id,
      public.catalog_search_expand_query(p_query) as query_text,
      greatest(1, least(coalesce(p_limit, 20), 100)) as result_limit
  ),
  query_values as (
    select
      client_id,
      query_text,
      public.catalog_search_tsquery(query_text) as ts_query,
      result_limit
    from params
  ),
  presentation_agg as (
    select
      cp.reference_id,
      string_agg(cp.weight, ' ') as weights_text,
      jsonb_agg(
        jsonb_build_object(
          'peso', cp.weight,
          'precio', cp.price,
          'stock', cp.stock,
          'metadata', coalesce(cp.metadata, '{}'::jsonb)
        )
        order by cp.sort_order asc, cp.weight asc
      ) as presentations
    from public.catalog_presentations cp
    where cp.active = true
    group by cp.reference_id
  ),
  products as (
    select
      cb.id as brand_id,
      cr.id as reference_id,
      cb.name as brand_name,
      cr.name as reference_name,
      cr.species,
      cr.category,
      cr.subcategory,
      cr.life_stage,
      cr.requires_confirmation,
      cr.description,
      cr.image_url,
      cr.metadata as reference_metadata,
      coalesce(pa.presentations, '[]'::jsonb) as presentations,
      public.catalog_search_normalize(
        concat_ws(
          ' ',
          cb.name,
          cr.name,
          cr.species,
          cr.category,
          cr.subcategory,
          cr.life_stage,
          cr.description,
          cr.metadata::text,
          pa.weights_text
        )
      ) as search_text
    from public.catalog_brands cb
    join public.catalog_references cr on cr.brand_id = cb.id and cr.active = true
    left join presentation_agg pa on pa.reference_id = cr.id
    join query_values q on q.client_id = cb.client_id
    where cb.active = true
  ),
  scored as (
    select
      p.*,
      (
        ts_rank_cd(to_tsvector('spanish', p.search_text), q.ts_query) * 8
        + greatest(similarity(p.search_text, q.query_text), similarity(public.catalog_search_normalize(p.reference_name), q.query_text)) * 4
        + case when p.search_text like '%' || q.query_text || '%' then 4 else 0 end
        + case when public.catalog_search_normalize(p.brand_name) = q.query_text then 3 else 0 end
      )::numeric as score,
      concat_ws(
        ', ',
        case when to_tsvector('spanish', p.search_text) @@ q.ts_query then 'fts' end,
        case when similarity(p.search_text, q.query_text) > 0.12 then 'similarity' end,
        case when p.search_text like '%' || q.query_text || '%' then 'partial' end
      ) as match_reason
    from products p
    cross join query_values q
    where
      q.query_text <> ''
      and (
        to_tsvector('spanish', p.search_text) @@ q.ts_query
        or similarity(p.search_text, q.query_text) > 0.12
        or p.search_text like '%' || q.query_text || '%'
      )
  )
  select
    brand_id,
    reference_id,
    brand_name,
    reference_name,
    species,
    category,
    subcategory,
    life_stage,
    requires_confirmation,
    description,
    image_url,
    reference_metadata,
    presentations,
    score,
    nullif(match_reason, '') as match_reason
  from scored
  order by score desc, brand_name asc, reference_name asc
  limit (select result_limit from query_values);
$$;

comment on function public.search_catalog_products(uuid, text, integer)
  is 'Busca candidatos de catalogo por cliente usando FTS, trigramas y sinonimos. Siempre filtra por client_id.';

revoke all on function public.search_catalog_products(uuid, text, integer) from public;
revoke execute on function public.search_catalog_products(uuid, text, integer) from anon, authenticated;
grant execute on function public.search_catalog_products(uuid, text, integer) to service_role;
