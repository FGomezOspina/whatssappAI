const fs=require('node:fs'),crypto=require('node:crypto');
const dir='docs/reports/recommendations-2026-10-29/';
const x=JSON.parse(fs.readFileSync(dir+'e2e-final.json'));
const groups=new Map();for(const m of x.persisted){const key=m.metadata?.turnId||m.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);}
const turns=[...groups.entries()].map(([key,rows])=>{
 const incoming=rows.filter(r=>r.direction==='inbound'),outgoing=rows.filter(r=>r.direction==='outbound');
 return {turnHash:crypto.createHash('sha256').update(key).digest('hex').slice(0,16),
  in:incoming.map(r=>({id:r.id,text:r.body,at:r.created_at})),out:outgoing.map(r=>({id:r.id,text:r.body,at:r.created_at})),
  persistedLatencyMs:incoming.length&&outgoing.length?Date.parse(outgoing[0].created_at)-Date.parse(incoming[0].created_at):null};
});
const msgs=x.messages.data.filter(m=>Number(m.timestamp)*1000>=Date.parse('2026-10-29T20:09:00Z'));
const logs=fs.readFileSync('.tmp/recommendations-runtime-20261029.log','utf8').split('\n');
const summaries=logs.filter(l=>l.includes('"etapa":"summary"')).map(l=>{const data=JSON.parse(l.slice(l.indexOf('{')));return {run:l.match(/\[run:([^\]]+)/)?.[1],...data};});
const eventKeys=x.persisted.map(m=>m.metadata?.eventKey).filter(Boolean),times=summaries.map(s=>s.totalConBufferMs).sort((a,b)=>a-b);
const n=times.length,median=n%2?times[Math.floor(n/2)]:(times[n/2-1]+times[n/2])/2;
const result={at:new Date().toISOString(),turns,inbound:x.persisted.filter(m=>m.direction==='inbound').length,outbound:x.persisted.filter(m=>m.direction==='outbound').length,
 allTurnsAnsweredOnce:turns.every(t=>t.in.length>0&&t.out.length===1),duplicateEventKeys:eventKeys.length-new Set(eventKeys).size,
 ordersCreated:x.orders.length,finalCart:x.conversation[0]?.state.carrito,
 kapso:msgs.map(m=>({id:m.id,at:new Date(Number(m.timestamp)*1000).toISOString(),direction:m.kapso.direction,status:m.kapso.status,text:m.text?.body})),
 pipeline:{runs:n,statuses:summaries.map(s=>s.outcome),medianMs:median,minMs:times[0],maxMs:times.at(-1)},summaries};
fs.writeFileSync(dir+'e2e-summary.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({turns:turns.length,inbound:result.inbound,outbound:result.outbound,allTurnsAnsweredOnce:result.allTurnsAnsweredOnce,duplicateEventKeys:result.duplicateEventKeys,orders:result.ordersCreated,cart:result.finalCart,pipeline:result.pipeline}));
