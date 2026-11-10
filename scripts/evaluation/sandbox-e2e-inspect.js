// Read-only: resolve and verify the configured Sandbox before any send/replay.
require('dotenv').config({quiet:true});const fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'../../docs/reports/sandbox-e2e-2026-10-30/private');
const {kapsoConfigFromEnv,kapsoRequest}=require('../../.agents/skills/observe-whatsapp/scripts/lib/messages/kapso-api');
const {requestSupabase}=require('../../src/repositories/supabaseClient');
const {obtenerClienteActual}=require('../../src/services/clients.service');
async function main(){const label=process.argv[2]||'initial';if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid label');const config=kapsoConfigFromEnv();config.baseUrl=new URL(config.baseUrl).origin;const id=process.env.KAPSO_PHONE_NUMBER_ID;
 const [numbers,messages,webhooks,tunnel]=await Promise.all([kapsoRequest(config,'/platform/v1/whatsapp/phone_numbers?phone_number_id='+id),kapsoRequest(config,'/platform/v1/whatsapp/messages?phone_number_id='+id+'&limit=40'),kapsoRequest(config,'/platform/v1/whatsapp/phone_numbers/'+id+'/webhooks'),fetch('http://127.0.0.1:4040/api/tunnels').then(r=>r.json()).catch(e=>({error:e.message}))]);
 const log=console.log;console.log=()=>{};const client=await obtenerClienteActual({phoneNumberId:id,provider:'kapso',channel:'whatsapp'});console.log=log;
 const output={at:new Date().toISOString(),phoneNumberId:id,numbers,messages,webhooks,tunnel,tenant:{id:client.id,slug:client.slug,resolution:client.resolution}};fs.writeFileSync(path.join(dir,label+'.json'),JSON.stringify(output,null,2),{mode:0o600});
 const data=messages.data||messages.messages||[];log(JSON.stringify({saved:label,tenant:output.tenant,numbers:(numbers.data||[]).map(n=>({id:n.id,name:n.name,phone_number_id:n.phone_number_id,type:n.type,connection_type:n.connection_type})),messageShape:Object.keys(messages),messages:data.slice(0,6).map(m=>({id:m.id,direction:m.direction,text:m.text?.body||m.kapso?.content,at:m.timestamp||m.created_at,status:m.status,keys:Object.keys(m)})),webhookShape:Object.keys(webhooks),tunnel:tunnel.tunnels?.map(t=>({proto:t.proto,public_url:t.public_url,addr:t.config?.addr}))}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
