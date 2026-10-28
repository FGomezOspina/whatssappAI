#!/usr/bin/env python3
"""Generate guarded transactional SQL. Never connects or writes to the database."""
import json,pathlib,sys,os
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(os.environ.get('CLASSIFICATION_REPORT_DIR',ROOT/'docs/reports/classification-2026-10-28'))
s=json.loads((OUT/'supabase.before.json').read_text());plan=json.loads((OUT/'remote-plan.json').read_text())
byid={r['id']:r for r in s['refs']};tenant=s['tenant']['id']; payload=[]
for p in plan:
 r=byid[p['remote_id']]
 before={k:v for k,v in r.items() if k not in ['catalog_brands','catalog_presentations']}
 after={**before,**{k:v['after'] for k,v in p['remote_delta'].items()}}
 payload.append(dict(id=r['id'],before_row=before,after_row=after,brand=r['catalog_brands'],presentations=r['catalog_presentations']))
def quote(x):return "'"+x.replace("'","''")+"'"
def transaction(payload_sql,prefix):
 return f'''-- VERSION: clasificacion-20261028-r4
-- Distrifinca: revisión puntual de clasificación. Sin cambios de esquema/RLS.
-- Ejecutar completo en SQL Editor con rol autorizado. Ante error: ROLLBACK; no eliminar guardas.
-- Un cambio concurrente incluso en precio, stock o updated_at aborta todo el lote.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TEMP TABLE {prefix} (id uuid PRIMARY KEY,before_row jsonb NOT NULL,after_row jsonb NOT NULL,brand jsonb NOT NULL,presentations jsonb NOT NULL) ON COMMIT PRESERVE ROWS;
INSERT INTO {prefix} SELECT * FROM jsonb_to_recordset({payload_sql}::jsonb)
 AS x(id uuid,before_row jsonb,after_row jsonb,brand jsonb,presentations jsonb);
-- Bloqueo determinista; FOR UPDATE de padre impide insertar variantes concurrentemente.
SELECT b.id FROM public.catalog_brands b WHERE b.id IN (SELECT (brand->>'id')::uuid FROM {prefix}) ORDER BY b.id FOR SHARE;
SELECT r.id FROM public.catalog_references r JOIN {prefix} p ON p.id=r.id ORDER BY r.id FOR UPDATE OF r;
SELECT v.id FROM public.catalog_presentations v JOIN {prefix} p ON p.id=v.reference_id ORDER BY v.id FOR UPDATE OF v;
DO $classification$
DECLARE n integer;
BEGIN
 IF (SELECT count(*) FROM {prefix}) <> {len(payload)} THEN RAISE EXCEPTION 'Conteo de plan incorrecto'; END IF;
 IF (SELECT count(*) FROM public.aivance_clients WHERE id='{tenant}'::uuid AND slug='distrifinca') <> 1 THEN RAISE EXCEPTION 'Tenant incorrecto'; END IF;
 IF EXISTS (SELECT 1 FROM {prefix} p LEFT JOIN public.catalog_references r ON r.id=p.id LEFT JOIN public.catalog_brands b ON b.id=r.brand_id
   WHERE r.id IS NULL OR b.client_id IS DISTINCT FROM '{tenant}'::uuid
   OR jsonb_build_object('id',b.id,'client_id',b.client_id,'name',b.name) IS DISTINCT FROM p.brand
   OR to_jsonb(r) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::public.catalog_references,p.before_row)))
 THEN RAISE EXCEPTION 'Referencia/tenant/estado previo divergente: cancelar y volver a auditar'; END IF;
 IF EXISTS (SELECT 1 FROM {prefix} p WHERE
  COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM public.catalog_presentations v WHERE v.reference_id=p.id),'[]'::jsonb)
  IS DISTINCT FROM COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM jsonb_populate_recordset(NULL::public.catalog_presentations,p.presentations) v),'[]'::jsonb))
 THEN RAISE EXCEPTION 'Presentaciones divergentes: no sobrescribir datos concurrentes'; END IF;
 IF EXISTS (SELECT 1 FROM {prefix} WHERE before_row - ARRAY['species','category','subcategory','life_stage','updated_at','metadata']
   IS DISTINCT FROM after_row - ARRAY['species','category','subcategory','life_stage','updated_at','metadata']
   OR (before_row->'metadata')-'especies' IS DISTINCT FROM (after_row->'metadata')-'especies')
 THEN RAISE EXCEPTION 'Plan modifica campos protegidos'; END IF;
 UPDATE public.catalog_references r SET
   species=p.after_row->>'species', category=p.after_row->>'category',
   subcategory=p.after_row->>'subcategory', life_stage=p.after_row->>'life_stage', metadata=p.after_row->'metadata'
 FROM {prefix} p WHERE r.id=p.id
   AND to_jsonb(r)=to_jsonb(jsonb_populate_record(NULL::public.catalog_references,p.before_row));
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> {len(payload)} THEN RAISE EXCEPTION 'Conteo actualizado incorrecto: %',n; END IF;
 IF EXISTS (SELECT 1 FROM {prefix} p JOIN public.catalog_references r ON r.id=p.id
   WHERE to_jsonb(r)-'updated_at' IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::public.catalog_references,p.after_row))-'updated_at')
 THEN RAISE EXCEPTION 'Verificación posterior de campos falló'; END IF;
 IF EXISTS (SELECT 1 FROM {prefix} p WHERE
  COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM public.catalog_presentations v WHERE v.reference_id=p.id),'[]'::jsonb)
  IS DISTINCT FROM COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM jsonb_populate_recordset(NULL::public.catalog_presentations,p.presentations) v),'[]'::jsonb))
 THEN RAISE EXCEPTION 'Se alteraron presentaciones: cancelar'; END IF;
 -- Retener imagen posterior real, incluido updated_at, para reversión segura.
 UPDATE {prefix} p SET after_row=to_jsonb(r) FROM public.catalog_references r WHERE r.id=p.id;
END $classification$;
COMMIT;
SELECT count(*) AS referencias_verificadas FROM {prefix};
'''
apply=transaction(quote(json.dumps(payload,ensure_ascii=False,separators=(',',':'))),'classification_apply')
rollback=transaction('__PAYLOAD_LITERAL__','classification_undo')
apply+='''-- GUARDAR la celda rollback_sql completa. Es la reversión ejecutable con timestamps reales.
-- La reversión abortará si cualquiera de las referencias o sus presentaciones cambió después.
SELECT count(*) AS referencias_verificadas,
 jsonb_agg(jsonb_build_object('id',id,'nombre',after_row->>'name','especie',after_row->>'species',
 'categoria',after_row->>'category','subcategoria',after_row->>'subcategory','etapa',after_row->>'life_stage',
 'especies_declaradas',after_row->'metadata'->'especies','updated_at',after_row->>'updated_at') ORDER BY id) AS lectura_posterior,
 replace($rollback_template$'''+rollback+'''$rollback_template$, '__PAYLOAD_LITERAL__',
 quote_literal(jsonb_agg(jsonb_build_object('id',id,'before_row',after_row,'after_row',before_row,'brand',brand,'presentations',presentations) ORDER BY id)::text)) AS rollback_sql
FROM classification_apply;
'''
if '--candidate' in sys.argv:
 apply='-- CANDIDATO R4 PARA PRUEBAS OFFLINE. NO EJECUTAR EN PRODUCCION: REVISION ABIERTA.\n'+apply
(OUT/('apply-supabase.candidate.sql' if '--candidate' in sys.argv else 'apply-supabase.sql')).write_text(apply)
print(json.dumps({'references':len(payload),'fields':sum(len(p['remote_delta']) for p in plan),'sql_bytes':len(apply.encode()),'supabase_applied':False}))
