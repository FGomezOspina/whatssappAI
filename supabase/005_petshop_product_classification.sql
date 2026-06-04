alter table public.catalog_references
  add column if not exists category text,
  add column if not exists subcategory text,
  add column if not exists life_stage text,
  add column if not exists requires_confirmation boolean not null default false;

alter table public.catalog_presentations
  add column if not exists stock boolean;

update public.catalog_references
set category = 'comida'
where category is null
  and (
    lower(coalesce(name, '') || ' ' || coalesce(description, '')) like '%alimento%'
    or lower(coalesce(name, '') || ' ' || coalesce(description, '')) like '%concentrado%'
    or exists (
      select 1
      from public.catalog_brands brand
      where brand.id = catalog_references.brand_id
        and lower(brand.name) in ('dog chow', 'chunky')
    )
  );

update public.catalog_references
set subcategory = 'concentrado'
where category = 'comida'
  and subcategory is null;

update public.catalog_references
set life_stage = case
  when lower(coalesce(name, '') || ' ' || coalesce(description, '')) ~ '(cachorro|cachorros|puppy|gatito|gatita)' then 'cachorro'
  when lower(coalesce(name, '') || ' ' || coalesce(description, '')) ~ '(senior|mayor|mayores)' then 'senior'
  when lower(coalesce(name, '') || ' ' || coalesce(description, '')) ~ '(adulto|adultos)' then 'adulto'
  else life_stage
end
where life_stage is null;

create index if not exists catalog_references_petshop_filters_idx
  on public.catalog_references (category, subcategory, species, life_stage, active);

create index if not exists catalog_references_requires_confirmation_idx
  on public.catalog_references (requires_confirmation)
  where requires_confirmation = true;
