const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=path.resolve(__dirname,'../../docs/reports/sandbox-e2e-2026-10-30');
const raw=JSON.parse(fs.readFileSync(path.join(dir,'private',process.argv[2]||'final.json')));
const lines=fs.readFileSync(path.resolve(__dirname,'../../.tmp/sandbox-e2e-runtime-20261030.log'),'utf8').split('\n');
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,12);
const telemetry=lines.filter(s=>s.includes('[PERF]')).flatMap(s=>{try{const d=JSON.parse(s.slice(s.indexOf('{')));return d.etapa==='summary'?[{run:s.match(/\[run:([^\]]+)/)?.[1],...d}]:[]}catch{return[]}});
const usage=lines.filter(s=>s.includes('[AI Usage]')).map(s=>Object.fromEntries(s.split('|').map(x=>x.trim().split('=')).filter(x=>x.length===2)));
const messages=(raw.kapso.data||[]).filter(m=>Number(m.timestamp)>=Date.parse('2026-10-30T17:20:00Z')/1000).sort((a,b)=>Number(a.timestamp)-Number(b.timestamp)).map(m=>({id:hash(m.id),direction:m.kapso?.direction,text:m.text?.body||null,at:new Date(Number(m.timestamp)*1000).toISOString(),atColombia:new Date(Number(m.timestamp)*1000).toLocaleString('sv-SE',{timeZone:'America/Bogota'}),kapsoStatus:m.kapso?.status,kapsoProcessingStatus:m.kapso?.processing_status,origin:m.kapso?.origin,targetMasked:'Sandbox WhatsApp …3541 / interlocutor …4163',statusEvents:(m.kapso?.statuses||[]).map(s=>({status:s.status,atColombia:new Date(Number(s.timestamp)*1000).toLocaleString('sv-SE',{timeZone:'America/Bogota'})}))}));
let pending=[];const turns=[];for(const m of messages){if(m.direction==='inbound')pending.push(m);else if(m.direction==='outbound'){turns.push({inputs:pending,response:m,providerElapsedMs:pending.length?Date.parse(m.at)-Date.parse(pending[0].at):null});pending=[];}}
const total=k=>usage.reduce((n,u)=>n+(Number(u[k])||0),0);
const summary={generatedAt:new Date().toISOString(),scope:'KapsoSandbox controlled text-only integration',messages,turns,pending,
 orders:raw.orders.length,cart:raw.conversations.map(c=>c.state.carrito),
 sourceRuntimes:lines.filter(s=>s.startsWith('[Runtime]')).map(s=>JSON.parse(s.slice(10))),
 telemetry,usage:{calls:usage.length,promptTokens:total('tokensPrompt'),completionTokens:total('tokensCompletion'),totalTokens:total('tokensTotal'),models:[...new Set(usage.map(u=>u.modelo))],monetaryCost:null},
 note:'First outbound recovers an original Oct29 event; use redelivery elapsed time, not its original message age. New turns include provider transport, 5s buffer, model, catalog and send. No original media tested.'};
fs.writeFileSync(path.join(dir,'private/provider-message-index.json'),JSON.stringify((raw.kapso.data||[]).filter(m=>Number(m.timestamp)>=Date.parse('2026-10-30T17:20:00Z')/1000).map(m=>({publicHash:hash(m.id),providerId:m.id,direction:m.kapso?.direction,status:m.kapso?.status})),null,2),{mode:0o600});
fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(summary,null,2));console.log({turns:turns.length,pending:pending.length,orders:summary.orders,cart:summary.cart,calls:usage.length});
