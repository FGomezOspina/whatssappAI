// Independently verify expected identities/prices against this tenant; read only.
const fs=require('node:fs');require('dotenv').config({quiet:true});
const {requestSupabase}=require('../../src/repositories/supabaseClient');
const {obtenerClienteActual}=require('../../src/services/clients.service');
console.log=()=>{};
(async()=>{
 const client=await obtenerClienteActual({phoneNumberId:process.env.KAPSO_PHONE_NUMBER_ID});
 const names=['DIAMOND INDOOR CAT','MONELLO CAT SALMON','CAT CHOW DELICARNE','AGILITY GATITO','NUTRECAN ADULTO RP'];
 const params=new URLSearchParams({select:'id,name,species,category,life_stage,brand:catalog_brands!inner(name,client_id),presentations:catalog_presentations(id,weight,price,stock,active)',
  name:'in.('+names.map(n=>'"'+n+'"').join(',')+')','brand.client_id':'eq.'+client.id,active:'eq.true'});
 const references=await requestSupabase('catalog_references?'+params);
 if(references.length!==names.length)throw Error('Expected references not all found');
 fs.writeFileSync('docs/reports/identity-language-2026-10-29/catalog-expected.json',JSON.stringify({at:new Date().toISOString(),source:'Read-only tenant-scoped Supabase catalog_references/catalog_presentations/catalog_brands',references},null,2));
 process.stdout.write(JSON.stringify({verified:references.length})+'\n');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
