// Read-only local aggregation of the final policy's actual Sandbox evidence.
const fs = require('node:fs'), crypto = require('node:crypto');
const dir = 'docs/reports/unresolved-tone-2026-10-29/';
const label = process.argv[2] || 'policy';
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid evidence label');
const evidence = JSON.parse(fs.readFileSync(dir + `e2e-${label}-final.json`));
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0,16);
const groups = new Map();
for (const message of evidence.persisted) {
  const key = message.metadata?.turnId || message.id;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(message);
}
const turns = [...groups.entries()].map(([key, messages]) => {
  const incoming = messages.filter(m => m.direction === 'inbound');
  const outgoing = messages.filter(m => m.direction === 'outbound');
  return {turnHash:hash(key), in:incoming.map(m => ({id:m.id,text:m.body,at:m.created_at})),
    out:outgoing.map(m => ({id:m.id,text:m.body,at:m.created_at})),
    persistedLatencyMs:incoming.length && outgoing.length
      ? Date.parse(outgoing[0].created_at)-Date.parse(incoming[0].created_at) : null};
});
const log = fs.readFileSync('.tmp/unresolved-tone-runtime-20261029.log','utf8');
const runtimes = [...log.matchAll(/^\[Runtime\] (.+)$/gm)].map(m => ({index:m.index,value:JSON.parse(m[1])}));
const firstAt = Date.parse(evidence.persisted.find(m => m.direction === 'inbound')?.created_at || evidence.at);
const chosen = runtimes.findLastIndex(r => Date.parse(r.value.startedAt) <= firstAt);
if (chosen < 0) throw Error('No runtime found for evidence');
const current = log.slice(runtimes[chosen].index, runtimes[chosen+1]?.index);
const runtime = runtimes[chosen].value;
const runs = current.split('\n').filter(l => l.includes('"etapa":"summary"'))
  .map(l => ({run:l.match(/\[run:([^\]]+)/)?.[1],...JSON.parse(l.slice(l.indexOf('{')))}));
const keys = evidence.persisted.map(m => m.metadata?.eventKey).filter(Boolean);
const kapso = evidence.messages.data.filter(m => +m.timestamp*1000 >= Date.parse(runtime.startedAt))
  .map(m => ({messageHash:hash(m.id),direction:m.kapso.direction,status:m.kapso.status,
    text:m.text?.body,at:new Date(+m.timestamp*1000).toISOString()}));
const summary = {at:new Date().toISOString(),runtime,turns,kapso,runs,
  allTurnsAnsweredOnce:turns.every(t => t.in.length && t.out.length === 1),
  duplicateEventKeys:keys.length-new Set(keys).size,ordersCreated:evidence.orders.length,
  finalCart:evidence.conversation[0]?.state?.carrito,
  attention:evidence.conversation[0]?.state?.atencionHumana};
fs.writeFileSync(dir+`e2e-${label}-summary.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify({turns:turns.length,allTurnsAnsweredOnce:summary.allTurnsAnsweredOnce,
  duplicateEventKeys:summary.duplicateEventKeys,ordersCreated:summary.ordersCreated,
  delivered:kapso.filter(m => m.direction === 'outbound' && m.status === 'delivered').length,
  pipelineMs:runs.map(r => r.totalConBufferMs),cart:summary.finalCart}));
