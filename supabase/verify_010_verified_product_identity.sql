-- Solo staging/test. Crea datos sintéticos y termina en ROLLBACK.
-- Requiere aplicar previamente 010. Validado en PostgreSQL WASM efímero, nunca en producción.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); brand uuid:=gen_random_uuid();
  ref uuid:=gen_random_uuid(); msg uuid:=gen_random_uuid(); outbound uuid:=gen_random_uuid();
  evidence uuid; evidence2 uuid; ref2 uuid:=gen_random_uuid(); n int; rejected boolean:=false;
begin
  insert into public.aivance_clients(id,slug,name) values(a,'evidence-test-'||a,'Synthetic A'),(b,'evidence-test-'||b,'Synthetic B');
  insert into public.catalog_brands(id,client_id,name) values(brand,a,'SYNTHETIC');
  insert into public.catalog_references(id,brand_id,name,species,category) values(ref,brand,'SYNTHETIC ORIGINAL','perro','comida');
  insert into public.catalog_presentations(reference_id,weight,price) values(ref,'2kg',10);
  insert into public.whatsapp_messages(id,client_id,channel_user_id,direction,body)
    values(msg,a,'synthetic','inbound','nombre coloquial'),(outbound,a,'synthetic','outbound','nombre coloquial');
  begin
    insert into public.product_identity_evidence(client_id,reference_id,source_message_id,alias)
      values(a,ref,outbound,'nombre coloquial');
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Bot output accepted as evidence'; end if;
  rejected:=false;
  begin
    insert into public.product_identity_evidence(client_id,reference_id,source_message_id,alias)
      values(b,ref,msg,'nombre coloquial');
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Cross-tenant evidence accepted'; end if;
  insert into public.product_identity_evidence(client_id,reference_id,source_message_id,alias)
    values(a,ref,msg,'nombre coloquial') returning id into evidence;
  select count(*) into n from public.search_verified_product_identities(a,'nombre coloquial');
  if n<>0 then raise exception 'Pending evidence leaked'; end if;
  update public.product_identity_evidence set status='approved',reviewed_by='synthetic reviewer',
    review_reason='Synthetic independent catalog verification for staging only.' where id=evidence;
  select count(*) into n from public.search_verified_product_identities(a,'nombre coloquial');
  if n<>1 then raise exception 'Approved exact evidence missing'; end if;
  select count(*) into n from public.search_verified_product_identities(b,'nombre coloquial');
  if n<>0 then raise exception 'Cross-tenant retrieval leaked'; end if;
  select count(*) into n from public.search_verified_product_identities(a,'nombre coloquial para gato');
  if n<>0 then raise exception 'Unreviewed expanded identity accepted'; end if;
  update public.catalog_presentations set price=12 where reference_id=ref;
  select count(*) into n from public.search_verified_product_identities(a,'nombre coloquial') where presentations->0->>'precio'='12';
  if n<>1 then raise exception 'Learning froze price or invalidated identity on price change'; end if;
  update public.catalog_references set active=false where id=ref;
  select count(*) into n from public.search_verified_product_identities(a,'nombre coloquial');
  if n<>0 then raise exception 'Inactive reference leaked'; end if;
  update public.catalog_references set active=true where id=ref;
  insert into public.catalog_references(id,brand_id,name,species,category) values(ref2,brand,'SYNTHETIC COMPETING','perro','comida');
  insert into public.catalog_presentations(reference_id,weight,price) values(ref2,'2kg',10);
  insert into public.product_identity_evidence(client_id,reference_id,source_message_id,alias)
    values(a,ref2,msg,'nombre coloquial') returning id into evidence2;
  update public.product_identity_evidence set status='approved',reviewed_by='synthetic reviewer',
    review_reason='Competing synthetic identity for conflict verification only.' where id=evidence2;
  select count(*) into n from public.search_verified_product_identities(a,'nombre coloquial');
  if n<>0 then raise exception 'Conflicting identities accepted'; end if;
  update public.product_identity_evidence set status='revoked',review_reason='Withdraw competing synthetic identity.' where id=evidence2;
  update public.catalog_references set species='gato' where id=ref;
  select count(*) into n from public.search_verified_product_identities(a,'nombre coloquial');
  if n<>0 then raise exception 'Stale identity remained valid'; end if;
  update public.catalog_references set species='perro' where id=ref;
  update public.whatsapp_messages set body='changed source' where id=msg;
  select count(*) into n from public.search_verified_product_identities(a,'nombre coloquial');
  if n<>0 then raise exception 'Changed source remained valid'; end if;
  update public.whatsapp_messages set body='nombre coloquial' where id=msg;
  update public.product_identity_evidence set status='revoked',review_reason='Synthetic withdrawal after review.' where id=evidence;
  select count(*) into n from public.search_verified_product_identities(a,'nombre coloquial');
  if n<>0 then raise exception 'Revoked evidence leaked'; end if;
  select count(*) into n from public.product_identity_evidence_audit where evidence_id=evidence;
  if n<>3 then raise exception 'Review history lost'; end if;
end;
$$;
rollback;
