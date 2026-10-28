// Read-only check. Do not print credentials or retrieve conversations/customers.
require('dotenv').config({quiet:true});
const fs=require('node:fs'),path=require('node:path');
const {requestSupabase}=require('../src/repositories/supabaseClient');
const out=path.join(__dirname,'../docs/reports/classification-2026-10-28');
const previous=JSON.parse(fs.readFileSync(path.join(out,'supabase.before.json')));
function canonical(v){if(Array.isArray(v))return v.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
(async()=>{const tenants=await requestSupabase('aivance_clients?slug=eq.distrifinca&select=id,slug');if(tenants.length!==1||tenants[0].id!==previous.tenant.id)throw Error('Tenant mismatch');let refs=[];
for(let offset=0;;offset+=500){const rows=await requestSupabase(`catalog_references?select=*,catalog_brands!inner(id,client_id,name),catalog_presentations(*)&catalog_brands.client_id=eq.${tenants[0].id}&order=id&limit=500&offset=${offset}`);refs.push(...rows);if(rows.length<500)break;}
const old=new Map(previous.refs.map(r=>[r.id,r]));const changed=refs.filter(r=>JSON.stringify(canonical(r))!==JSON.stringify(canonical(old.get(r.id)))).map(r=>r.id);const now=new Set(refs.map(r=>r.id));const missing=previous.refs.filter(r=>!now.has(r.id)).map(r=>r.id);
const report={checked_at:new Date().toISOString(),tenant:tenants[0],read_only:true,remote_references:refs.length,changed_ids:changed,missing_ids:missing,unchanged:changed.length===0&&missing.length===0,supabase_applied:false};
fs.writeFileSync(path.join(out,'remote-recheck.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.unchanged)process.exitCode=2;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
