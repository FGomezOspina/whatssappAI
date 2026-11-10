// Read-only evidence from the verified Sandbox user observed in this run's log.
const fs=require('node:fs');
require('dotenv').config({quiet:true});
const {kapsoConfigFromEnv,kapsoRequest}=require('../../.agents/skills/observe-whatsapp/scripts/lib/messages/kapso-api');
const {requestSupabase}=require('../../src/repositories/supabaseClient');
const {obtenerClienteActual}=require('../../src/services/clients.service');
const label=process.argv[2];if(!/^[a-z0-9-]+$/.test(label||''))throw Error('label required');
const report=process.argv.find(v=>v.startsWith('--report='))?.slice(9)||'recommendations-2026-10-29';
const since=process.argv.find(v=>v.startsWith('--since='))?.slice(8)||'2026-10-29T20:09:00Z';
if(!/^[a-z0-9-]+$/.test(report)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(since))throw Error('Invalid evidence scope');
const originalLog=console.log;console.log=()=>{};
(async()=>{
 const log=fs.readFileSync('.tmp/recommendations-runtime-20261029.log','utf8');
 const users=[...new Set([...log.matchAll(/Entrada preparada \| cliente=(\d+)/g)].map(m=>m[1]))];
 if(users.length!==1)throw Error('Ambiguous Sandbox participant; stop');
 const user=users[0],params=new URLSearchParams({phone_number:user,phone_number_id:process.env.KAPSO_PHONE_NUMBER_ID,limit:'100'});
 const config=kapsoConfigFromEnv();config.baseUrl=new URL(config.baseUrl).origin;
 const messages=await kapsoRequest(config,'/platform/v1/whatsapp/messages?'+params);
 const tenant=await obtenerClienteActual({phoneNumberId:process.env.KAPSO_PHONE_NUMBER_ID});
 const filter='channel_user_id=eq.'+encodeURIComponent(user)+'&client_id=eq.'+tenant.id;
 const conversation=await requestSupabase('whatsapp_conversations?'+filter+'&select=state,status,last_interaction_at');
 const persisted=await requestSupabase('whatsapp_messages?'+filter+'&created_at=gte.'+since+'&select=id,direction,body,created_at,metadata&order=created_at.asc');
 const orders=await requestSupabase('whatsapp_orders?'+filter+'&created_at=gte.'+since+'&select=id');
 const result={at:new Date().toISOString(),source:'Kapso API + scoped Supabase reads; actual UI-originated Sandbox messages',tenant:{id:tenant.id,slug:tenant.slug,resolution:tenant.resolution},messages,conversation,persisted,orders};
 fs.writeFileSync('docs/reports/'+report+'/'+label+'.json',JSON.stringify(result,null,2));
 originalLog(JSON.stringify({saved:label,kapsoKeys:Object.keys(messages),state:conversation.map(c=>({status:c.status,cart:c.state?.carrito,need:c.state?.recomendacionActiva?.criterios})),persistedCount:persisted.length,latest:persisted.slice(-2).map(m=>({id:m.id,direction:m.direction,body:m.body,at:m.created_at})),orders:orders.length}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
