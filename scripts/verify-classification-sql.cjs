// Offline PostgreSQL validation: no network and no production writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE || '/tmp/veltia-sql-test/node_modules/@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),out=process.env.CLASSIFICATION_REPORT_DIR || path.join(root,'docs/reports/classification-2026-10-28');
const snapshot=JSON.parse(fs.readFileSync(path.join(out,'supabase.before.json')));
const plan=JSON.parse(fs.readFileSync(path.join(out,'remote-plan.json')));
const sql=fs.readFileSync(process.env.CLASSIFICATION_SQL || path.join(out,'apply-supabase.sql'),'utf8');
const schema=fs.readFileSync(path.join(root,'supabase/schema.sql'),'utf8');
const tenant=snapshot.tenant.id;
const strip=x=>{const y={...x}; delete y.updated_at;return y;};
async function setup(){
 const db=new PGlite();
 await db.exec('CREATE TABLE public.aivance_clients(id uuid PRIMARY KEY,slug text);');
 await db.query('INSERT INTO public.aivance_clients VALUES($1,$2)',[tenant,'distrifinca']);
 for(const t of ['catalog_brands','catalog_references','catalog_presentations']){
  const ddl=schema.match(new RegExp('create table if not exists public\\.'+t+' \\([\\s\\S]*?\\n\\);','i'))[0];await db.exec(ddl);
 }
 await db.exec(schema.match(/create or replace function public.set_updated_at\(\)[\s\S]*?\$\$ language plpgsql;/i)[0]);
 await db.exec('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.catalog_references FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();');
 const brands=[...new Map(snapshot.refs.map(r=>[r.catalog_brands.id,r.catalog_brands])).values()];
 await db.query('INSERT INTO catalog_brands(id,client_id,name) SELECT id,client_id,name FROM jsonb_to_recordset($1) AS b(id uuid,client_id uuid,name text)',[JSON.stringify(brands)]);
 const refs=snapshot.refs.map(({catalog_brands,catalog_presentations,...r})=>r);
 await db.query('INSERT INTO catalog_references SELECT * FROM jsonb_populate_recordset(NULL::catalog_references,$1)',[JSON.stringify(refs)]);
 await db.query('INSERT INTO catalog_presentations SELECT * FROM jsonb_populate_recordset(NULL::catalog_presentations,$1)',[JSON.stringify(snapshot.refs.flatMap(r=>r.catalog_presentations))]);
 await db.exec("INSERT INTO aivance_clients VALUES('00000000-0000-0000-0000-000000000001','other'); INSERT INTO catalog_brands(id,client_id,name) VALUES('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','other'); INSERT INTO catalog_references(id,brand_id,name,species) VALUES('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','Protected other tenant','otro');");
 return db;
}
async function state(db){return (await db.query(`SELECT (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM catalog_references r) AS refs,(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM catalog_presentations p) AS presentations`)).rows[0];}
async function rejected(db,statement){let failed=false;try{await db.exec(statement);}catch(e){failed=true;await db.exec('ROLLBACK');}assert(failed,'Expected rejection');}
(async()=>{
 let db=await setup();const before=await state(db);const result=await db.exec(sql);const after=await state(db);
 const expected=new Map(plan.map(p=>[p.remote_id,p.remote_delta]));let count=0;
 for(const r of before.refs){const actual=after.refs.find(x=>x.id===r.id),delta=expected.get(r.id);const wanted={...r};if(delta){count++;for(const [k,v] of Object.entries(delta))wanted[k]=v.after;}assert.deepEqual(strip(actual),strip(wanted));}
 assert.equal(count,plan.length);assert.deepEqual(after.presentations,before.presentations);
 const rollback=result.flatMap(r=>r.rows||[]).find(r=>r.rollback_sql)?.rollback_sql;assert(rollback?.startsWith('-- VERSION: clasificacion-20261028-r4'));
 console.log(`PASS apply: ${count} exact references, all other fields/references/presentations/other tenant unchanged`);
 await rejected(db,sql);assert.deepEqual(await state(db),after);console.log('PASS second execution refuses without partial writes');
 await db.exec(rollback);const restored=await state(db);assert.deepEqual(restored.refs.map(strip),before.refs.map(strip));assert.deepEqual(restored.presentations,before.presentations);console.log('PASS generated rollback restores original classifications');await db.close();
 const id=plan[0].remote_id; const r=snapshot.refs.find(r=>r.id===id);
 const mutations=[
 ['concurrent category',`UPDATE catalog_references SET category='concurrent' WHERE id='${id}'`],
 ['concurrent timestamp only',`UPDATE catalog_references SET updated_at=now() WHERE id='${id}'`],
 ['concurrent name',`UPDATE catalog_references SET name=name||' changed' WHERE id='${id}'`],
 ['concurrent metadata',`UPDATE catalog_references SET metadata=metadata||'{"concurrent":true}'::jsonb WHERE id='${id}'`],
 ['wrong tenant',`UPDATE catalog_brands SET client_id='00000000-0000-0000-0000-000000000001' WHERE id='${r.brand_id}'`],
 ['missing reference',`DELETE FROM catalog_references WHERE id='${id}'`],
 ['changed price',`UPDATE catalog_presentations SET price=price+1 WHERE reference_id='${id}'`],
 ['new presentation',`INSERT INTO catalog_presentations(reference_id,weight,price) VALUES('${id}','new-variant',1)`]
 ];
 for(const [name,mutation] of mutations){db=await setup();await db.exec(mutation);const stable=await state(db);await rejected(db,sql);assert.deepEqual(await state(db),stable);console.log('PASS guard: '+name+' aborts entire batch');await db.close();}
 db=await setup();const res=await db.exec(sql);const undo=res.flatMap(r=>r.rows||[]).find(r=>r.rollback_sql)?.rollback_sql;await db.exec(`UPDATE catalog_references SET description=description||' concurrent' WHERE id='${id}'`);const stable=await state(db);await rejected(db,undo);assert.deepEqual(await state(db),stable);console.log('PASS rollback rejects concurrent edits');await db.close();
 db=await setup();const unchanged=await state(db);
 const marker='-- Bloqueo determinista;';
 const tampered=sql.replace(marker,`UPDATE classification_apply SET after_row=jsonb_set(after_row,'{metadata,unrelated}', 'true'::jsonb);\n${marker}`);
 assert.notEqual(tampered,sql);await rejected(db,tampered);assert.deepEqual(await state(db),unchanged);await db.close();
 console.log('PASS protected metadata keys cannot be changed even by a tampered plan');
 console.log('13 SQL integration scenarios passed. Production unchanged.');
})().catch(e=>{console.error(e);process.exitCode=1;});
