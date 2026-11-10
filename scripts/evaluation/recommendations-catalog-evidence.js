const fs=require('node:fs');require('dotenv').config({quiet:true});
const {requestSupabase}=require('../../src/repositories/supabaseClient');
const {obtenerClienteActual}=require('../../src/services/clients.service');
console.log=()=>{};
(async()=>{
 const tenant=await obtenerClienteActual({phoneNumberId:process.env.KAPSO_PHONE_NUMBER_ID});
 const traces=fs.readFileSync('.tmp/recommendations-runtime-20261029.log','utf8').split('\n')
  .filter(l=>l.startsWith('[PRODUCT_TRACE] ')).map(l=>JSON.parse(l.slice(16)))
  .filter(t=>t.etapa==='recomendacion_catalogo');
 const ids=[...new Set(traces.flatMap(t=>t.opciones.map(o=>o.id)))];
 const params=new URLSearchParams({select:'id,name,species,category,subcategory,life_stage,brand:catalog_brands!inner(client_id),presentations:catalog_presentations(id,weight,price,stock,active)',
  id:'in.('+ids.join(',')+')','brand.client_id':'eq.'+tenant.id});
 const references=await requestSupabase('catalog_references?'+params);
 const comparisons=traces.map(t=>({run:t.run,criteria:t.criterios,options:t.opciones.map(o=>{
  const r=references.find(r=>r.id===o.id),p=r?.presentations.find(p=>p.active&&p.weight===o.peso&&Number(p.price)===o.precio);
  return {...o,verified:!!p,catalogSpecies:r?.species,catalogStage:r?.life_stage,catalogCategory:r?.category,stock:p?.stock};
 })}));
 fs.writeFileSync('docs/reports/recommendations-2026-10-29/e2e-catalog-verification.json',JSON.stringify({at:new Date().toISOString(),references,comparisons},null,2));
 process.stdout.write(JSON.stringify({runs:comparisons.length,options:comparisons.flatMap(x=>x.options).length,unverified:comparisons.flatMap(x=>x.options).filter(o=>!o.verified).length})+'\n');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
