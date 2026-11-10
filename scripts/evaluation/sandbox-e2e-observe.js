// Read-only scoped observation, raw evidence private; public IDs hashed.
require('dotenv').config({quiet:true});
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=path.resolve(__dirname,'../../docs/reports/sandbox-e2e-2026-10-30');
const {requestSupabase}=require('../../src/repositories/supabaseClient');
const {kapsoConfigFromEnv,kapsoRequest}=require('../../.agents/skills/observe-whatsapp/scripts/lib/messages/kapso-api');
async function main(){const label=process.argv[2];if(!/^[a-z0-9-]+$/.test(label||''))throw Error('Label required');
 const o=JSON.parse(fs.readFileSync(path.join(dir,'private/original-event.json'))),cfg=kapsoConfigFromEnv();cfg.baseUrl=new URL(cfg.baseUrl).origin;
 const filter='channel_user_id=eq.'+encodeURIComponent(o.channelUserId)+'&client_id=eq.'+o.tenant.id;
 const [conversations,messages,orders,kapso]=await Promise.all([requestSupabase('whatsapp_conversations?'+filter+'&select=state,status,last_interaction_at'),requestSupabase('whatsapp_messages?'+filter+'&select=id,direction,body,created_at,metadata&order=created_at.desc&limit=100'),requestSupabase('whatsapp_orders?'+filter+'&select=id,created_at'),kapsoRequest(cfg,'/platform/v1/whatsapp/messages?phone_number_id='+o.phoneNumberId+'&limit=100')]);
 const raw={at:new Date().toISOString(),conversations,messages,orders,kapso};fs.writeFileSync(path.join(dir,'private',label+'.json'),JSON.stringify(raw,null,2),{mode:0o600});
 const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,12);
 const summary={at:raw.at,originalProcessed:conversations.some(c=>(c.state?.mensajesProcesados||[]).some(v=>String(v).includes(o.original.id))),cart:conversations.map(c=>c.state.carrito),ordersCount:orders.length,messages:messages.filter(m=>m.created_at>'2026-10-30T17:20:00').map(m=>({id:hash(m.id),direction:m.direction,body:m.body,at:m.created_at,metadata:m.metadata?.interpretacion?{interpretacion:m.metadata.interpretacion}:undefined})),kapso:(kapso.data||[]).slice(0,5).map(m=>({id:hash(m.id),direction:m.kapso?.direction,body:m.text?.body,at:new Date(Number(m.timestamp)*1000).toISOString(),status:m.status}))};
 fs.writeFileSync(path.join(dir,label+'.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}main().catch(e=>{console.error(e.message);process.exitCode=1});
