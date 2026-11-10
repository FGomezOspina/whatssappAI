// Explicitly authorized, one-shot redelivery of the captured original Sandbox event.
// No generated inbound event; uncertain attempts must be reconciled manually.
require('dotenv').config({quiet:true});
const fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'../../docs/reports/sandbox-e2e-2026-10-30/private');
const {requestSupabase}=require('../../src/repositories/supabaseClient');
const provider=require('../../src/providers/kapsoMessagingProvider');
async function main(){
 if(process.argv[2]!=='--recover-original-once') throw Error('Explicit one-shot flag required');
 const o=JSON.parse(fs.readFileSync(path.join(dir,'original-event.json'))), e=JSON.parse(fs.readFileSync(path.join(dir,'original-http-envelope.json')));
 const events=provider.extraerEventos(e.payload,e.headers);
 if(events.length!==1||events[0].messageId!==o.original.id||events[0].channelUserId!==o.channelUserId||events[0].phoneNumberId!==o.phoneNumberId||o.phoneNumberId!==process.env.KAPSO_PHONE_NUMBER_ID) throw Error('Original Sandbox identity mismatch');
 if(!provider.verificarFirmaWebhook(Buffer.from(e.body),e.headers['x-webhook-signature'])) throw Error('Original signature invalid');
 const filter='channel_user_id=eq.'+encodeURIComponent(o.channelUserId)+'&client_id=eq.'+o.tenant.id;
 const c=await requestSupabase('whatsapp_conversations?'+filter+'&select=state');
 const m=await requestSupabase('whatsapp_messages?'+filter+'&select=direction,metadata&order=created_at.desc&limit=100');
 if(c.some(x=>(x.state?.mensajesProcesados||[]).some(v=>String(v).includes(o.original.id)))||m.some(x=>['out','outbound'].includes(x.direction)&&JSON.stringify(x.metadata).includes(o.original.id))) throw Error('Already processed or outgoing exists');
 const file=path.join(dir,'original-redelivery-attempt.json');
 const attempt={startedAt:new Date().toISOString(),messageId:o.original.id,status:'uncertain_until_reconciled'};
 fs.writeFileSync(file,JSON.stringify(attempt,null,2),{flag:'wx',mode:0o600});
 const headers={'content-type':'application/json'};for(const k of ['x-webhook-event','x-webhook-signature','x-idempotency-key'])if(e.headers[k])headers[k]=e.headers[k];
 const r=await fetch('http://127.0.0.1:3000/webhooks/kapso/whatsapp',{method:'POST',headers,body:e.body,signal:AbortSignal.timeout(15000)});
 attempt.httpStatus=r.status;attempt.body=await r.text();attempt.returnedAt=new Date().toISOString();attempt.status='http_returned_processing_to_verify';fs.writeFileSync(file,JSON.stringify(attempt,null,2),{mode:0o600});
 console.log({httpStatus:r.status,at:attempt.returnedAt,originalEventRedelivered:true});
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
