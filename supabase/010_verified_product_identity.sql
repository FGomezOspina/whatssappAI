-- PREPARADA, NO APLICADA. Requiere 007/009 y tablas multiempresa.
-- Activar PRODUCT_IDENTITY_EVIDENCE_ENABLED=true solo tras validación staging.
begin;
create or replace function public.product_identity_revision(p_reference_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select md5(jsonb_build_array(b.id,b.name,b.active,r.name,r.species,r.category,
    r.subcategory,r.life_stage,r.description,r.active,r.requires_confirmation,r.metadata,
    coalesce((select jsonb_agg(jsonb_build_array(p.id,p.weight,p.active,p.metadata) order by p.id)
      from public.catalog_presentations p where p.reference_id=r.id),'[]'::jsonb))::text)
  from public.catalog_references r join public.catalog_brands b on b.id=r.brand_id
  where r.id=p_reference_id;
$$;
create table public.product_identity_evidence (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.aivance_clients(id),
  reference_id uuid not null references public.catalog_references(id) on delete cascade,
  source_message_id uuid not null references public.whatsapp_messages(id) on delete cascade,
  alias text not null check(length(alias) between 4 and 300),
  alias_normalized text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected','revoked')),
  reviewed_by text,
  review_reason text,
  identity_revision text,
  source_revision text,
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(client_id,source_message_id,alias_normalized,reference_id)
);
create index product_identity_evidence_lookup on public.product_identity_evidence
  (client_id,alias_normalized) where status='approved';
alter table public.product_identity_evidence enable row level security;
revoke all on public.product_identity_evidence from public,anon,authenticated;
grant select,insert,update,delete on public.product_identity_evidence to service_role;

-- Append-only review log contains IDs/hashes, no chat bodies or contact data.
create table public.product_identity_evidence_audit (
  id bigint generated always as identity primary key,
  evidence_id uuid not null,
  client_id uuid not null,
  old_status text,
  new_status text not null,
  reviewed_by text,
  review_reason text,
  identity_revision text,
  source_revision text,
  changed_at timestamptz not null default now()
);
alter table public.product_identity_evidence_audit enable row level security;
revoke all on public.product_identity_evidence_audit from public,anon,authenticated,service_role;
grant select on public.product_identity_evidence_audit to service_role;

create or replace function public.validate_product_identity_evidence()
returns trigger language plpgsql security definer set search_path=public as $$
declare source_row public.whatsapp_messages; owner_id uuid;
begin
  if TG_OP='INSERT' and new.status<>'pending' then
    raise exception 'New evidence must be pending before independent review';
  end if;
  if TG_OP='UPDATE' and old.status='approved' and new.status='approved' then
    raise exception 'Revoke before re-review; never silently refresh an approval';
  end if;
  if TG_OP='UPDATE' and (new.client_id,new.reference_id,new.source_message_id,new.alias)
    is distinct from (old.client_id,old.reference_id,old.source_message_id,old.alias) then
    raise exception 'Evidence provenance is immutable; create another proposal';
  end if;
  select b.client_id into owner_id from public.catalog_references r
    join public.catalog_brands b on b.id=r.brand_id where r.id=new.reference_id and r.active and b.active;
  select * into source_row from public.whatsapp_messages where id=new.source_message_id;
  if owner_id is distinct from new.client_id or source_row.client_id is distinct from new.client_id
    or source_row.direction is distinct from 'inbound' then
    raise exception 'Evidence must reference an inbound message and active product of the same tenant';
  end if;
  new.alias_normalized := public.catalog_search_normalize(new.alias);
  if length(new.alias_normalized)<4 or position(' '||new.alias_normalized||' ' in
    ' '||public.catalog_search_normalize(source_row.body)||' ')=0 then
    raise exception 'Alias must be a literal product mention in the source message';
  end if;
  if new.alias ~ '[0-9]{7,}|@|https?://' then raise exception 'Remove personal data from product mention'; end if;
  if new.status='approved' then
    if coalesce(length(trim(new.reviewed_by)),0)<3 or coalesce(length(trim(new.review_reason)),0)<20 then
      raise exception 'Approval requires a named reviewer and independent catalog verification rationale';
    end if;
    -- A human catalogs the exact reference/variant; bot answers are never proof.
    new.identity_revision := public.product_identity_revision(new.reference_id);
    new.source_revision := md5(source_row.body);
    new.reviewed_at := now();
    new.expires_at := now()+interval '90 days';
  else
    new.identity_revision := null;
    new.source_revision := null;
    new.expires_at := null;
  end if;
  return new;
end;
$$;
create trigger validate_product_identity_evidence before insert or update on public.product_identity_evidence
  for each row execute function public.validate_product_identity_evidence();
create or replace function public.audit_product_identity_evidence()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.product_identity_evidence_audit
    (evidence_id,client_id,old_status,new_status,reviewed_by,review_reason,identity_revision,source_revision)
  values(new.id,new.client_id,case when TG_OP='UPDATE' then old.status else null end,
    new.status,new.reviewed_by,new.review_reason,new.identity_revision,new.source_revision);
  return new;
end;
$$;
create trigger audit_product_identity_evidence after insert or update on public.product_identity_evidence
  for each row execute function public.audit_product_identity_evidence();

create or replace function public.search_verified_product_identities(p_client_id uuid,p_query text)
returns table(brand_id uuid,reference_id uuid,brand_name text,reference_name text,species text,
  category text,subcategory text,life_stage text,requires_confirmation boolean,description text,
  image_url text,reference_metadata jsonb,presentations jsonb,score numeric,match_reason text)
language sql stable security definer set search_path=public as $$
  with evidence as (
    select e.* from public.product_identity_evidence e
    join public.whatsapp_messages m on m.id=e.source_message_id and m.client_id=e.client_id and m.direction='inbound'
    join public.catalog_references r on r.id=e.reference_id and r.active
    join public.catalog_brands b on b.id=r.brand_id and b.client_id=e.client_id and b.active
    where e.client_id=p_client_id and e.status='approved' and e.expires_at>now()
      and e.alias_normalized=public.catalog_search_normalize(p_query)
      and e.source_revision=md5(m.body)
      and e.identity_revision=public.product_identity_revision(e.reference_id)
      and exists(select 1 from public.catalog_presentations p where p.reference_id=r.id and p.active)
  ), unique_target as (
    select min(reference_id::text)::uuid as id from evidence having count(distinct reference_id)=1
  )
  select b.id,r.id,b.name,r.name,r.species,r.category,r.subcategory,r.life_stage,
    r.requires_confirmation,r.description,r.image_url,
    coalesce(r.metadata,'{}'::jsonb)||jsonb_build_object('aliases',
      (case when jsonb_typeof(r.metadata->'aliases')='array' then r.metadata->'aliases' else '[]'::jsonb end)
        ||(select jsonb_agg(distinct e.alias) from evidence e),
      'verified_evidence_ids',(select jsonb_agg(e.id) from evidence e)),
    (select jsonb_agg(jsonb_build_object('peso',p.weight,'precio',p.price,'stock',p.stock,'metadata',p.metadata)
      order by p.sort_order,p.weight) from public.catalog_presentations p where p.reference_id=r.id and p.active),
    1::numeric,'verified_identity'::text
  from unique_target u join public.catalog_references r on r.id=u.id
    join public.catalog_brands b on b.id=r.brand_id and b.client_id=p_client_id;
$$;
revoke all on function public.product_identity_revision(uuid) from public,anon,authenticated;
revoke all on function public.validate_product_identity_evidence() from public,anon,authenticated;
revoke all on function public.audit_product_identity_evidence() from public,anon,authenticated;
revoke all on function public.search_verified_product_identities(uuid,text) from public,anon,authenticated;
grant execute on function public.search_verified_product_identities(uuid,text) to service_role;
commit;
