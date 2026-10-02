const test = require('node:test');
const assert = require('node:assert/strict');
const { crearCoordinador } = require('../src/services/conversationScheduler');
const { contexto } = require('../src/services/pipelineTelemetry');
const micro = async () => { for(let i=0;i<30;i++) await Promise.resolve(); };
const gate = () => { let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject}; };
function preparar(t, opts={}) {
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:1000});
 const batches=[],sent=[],typed=[],stats=[];
 const c=crearCoordinador({ventanaMs:5000,procesar:async es=>{batches.push(es.map(e=>e.messageId));return opts.procesar?opts.procesar(es):es.map(e=>e.text).join(' ');},
 enviar:async e=>{if(opts.enviar)await opts.enviar(e);sent.push(e.text);}, typing:async e=>{typed.push(e.messageId);if(opts.typing)await opts.typing(e);}, guardarEntrada:opts.guardarEntrada,
 dividir:r=>r?[r]:[],onSummary:s=>stats.push(s)});
 let id=0;const recibir=(text,user='A',msg)=>c.recibir({channelUserId:user,phoneNumberId:'canal',recipientId:user,messageId:msg||String(++id),text});
 const tick=async ms=>{t.mock.timers.tick(ms);await micro();};
 t.after(()=>c.cerrar());return {c,batches,sent,typed,stats,recibir,tick};
}
test('mensaje único: una ejecución y una respuesta; typing solo después del buffer',async t=>{
 const x=preparar(t);await x.recibir('Hola');assert.equal(x.typed.length,0);await x.tick(5000);
 assert.deepEqual(x.batches,[['1']]);assert.deepEqual(x.sent,['Hola']);assert.equal(x.typed.length,1);assert.equal(x.c.estados.size,0);
});
test('tres mensajes separados por 3 segundos reinician debounce',async t=>{
 const x=preparar(t);await x.recibir('Hola');await x.tick(3000);await x.recibir('Tienen alimento');await x.tick(3000);await x.recibir('Para gato');await x.tick(4999);assert.equal(x.batches.length,0);await x.tick(1);
 assert.equal(x.batches.length,1);assert.equal(x.batches[0].length,3);assert.equal(x.sent.length,1);
});
for(const stage of ['Supabase','OpenAI','tool_read'])test(`nuevo mensaje durante ${stage}: descarta texto anterior sin replay`,async t=>{
 const g=gate();let runs=0;const x=preparar(t,{procesar:async es=>{if(++runs===1)await g.promise;return es[0].text;}});
 await x.recibir('viejo');await x.tick(5000);await x.recibir('nuevo');await x.tick(5000);assert.equal(x.batches.length,1);
 g.resolve();await micro();assert.deepEqual(x.sent,['nuevo']);assert.deepEqual(x.batches,[['1'],['2']]);assert.equal(x.c.estados.size,0);
});
test('tres mensajes durante procesamiento se acumulan; solo espera debounce restante',async t=>{
 const g=gate();let runs=0,active=0,max=0;const x=preparar(t,{procesar:async es=>{active++;max=Math.max(max,active);if(++runs===1)await g.promise;active--;return es.map(e=>e.text).join(' ');}});
 await x.recibir('viejo');await x.tick(5000);await x.recibir('A');await x.tick(1000);await x.recibir('B');await x.tick(1000);await x.recibir('C');await x.tick(3000);g.resolve();await micro();assert.equal(x.batches.length,1);await x.tick(1999);assert.equal(x.batches.length,1);await x.tick(1);
 assert.equal(max,1);assert.deepEqual(x.sent,['A B C']);assert.deepEqual(x.batches,[['1'],['2','3','4']]);
});
test('lotes que vencieron durante procesamiento se coalescen con el más reciente',async t=>{
 const g=gate();let runs=0;const x=preparar(t,{procesar:async es=>{if(++runs===1)await g.promise;return es.map(e=>e.text).join(' ');}});
 await x.recibir('old');await x.tick(5000);await x.recibir('B');await x.tick(5000);await x.recibir('C');g.resolve();await micro();assert.equal(x.batches.length,1);await x.tick(5000);assert.deepEqual(x.sent,['B C']);
});
test('dos clientes procesan independientemente y respuesta cinco minutos después crea nuevo ciclo',async t=>{
 const g=gate();const x=preparar(t,{procesar:async es=>{if(es[0].text==='slow')await g.promise;return es[0].text;}});
 await x.recibir('slow','A');await x.recibir('fast','B');await x.tick(5000);assert.deepEqual(x.sent,['fast']);g.resolve();await micro();assert.equal(x.c.estados.size,0);await x.tick(300000);await x.recibir('again','A');await x.tick(5000);assert.equal(x.sent.at(-1),'again');
});
for(const stage of ['OpenAI','Supabase','tool_write','Kapso'])test(`error ${stage} libera conversación`,async t=>{
 let first=true;const fail=async()=>{if(first){first=false;throw Error(stage);}};
 const x=preparar(t,stage==='Kapso'?{enviar:fail}:{procesar:async()=>{await fail();return 'ok';}});
 await x.recibir('one');await x.tick(5000);assert.equal(x.c.estados.size,0);await x.recibir('two');await x.tick(5000);assert.equal(x.sent.length,1);assert.equal(x.c.estados.size,0);
});
test('fallo de typing no impide responder ni guardar respuesta entregada',async t=>{
 let committed=0;const x=preparar(t,{typing:async()=>{throw Error('typing');},procesar:async()=>{contexto.getStore().alEnviar=async()=>committed++;return 'ok';}});
 await x.recibir('one');await x.tick(5000);assert.deepEqual(x.sent,['ok']);assert.equal(committed,1);
});
test('write completado en ejecución obsoleta no se repite ni se guarda el texto descartado',async t=>{
 const g=gate();let writes=0,committed=0;const x=preparar(t,{procesar:async es=>{
 if(es[0].text==='comprar'){writes++;await g.promise;}
 contexto.getStore().alEnviar=async()=>committed++;return 'ok';}});
 await x.recibir('comprar');await x.tick(5000);await x.recibir('dirección');await x.tick(5000);g.resolve();await micro();assert.equal(writes,1);assert.equal(committed,1);assert.equal(x.sent.length,1);
});
test('webhook duplicado no invalida un run ni repite efectos',async t=>{
 const g=gate();const x=preparar(t,{procesar:async()=>{await g.promise;return 'ok';}});
 await x.recibir('one','A','id1');await x.tick(5000);await x.recibir('one','A','id1');g.resolve();await micro();assert.equal(x.batches.length,1);assert.deepEqual(x.sent,['ok']);
});
test('nuevo mensaje entre partes impide enviar las restantes',async t=>{
 let coordinator;const sent=[],saved=[];let runs=0;
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:1000});
 coordinator=crearCoordinador({ventanaMs:5000,procesar:async()=>{contexto.getStore().alEnviar=async text=>saved.push(text);return ++runs===1?'a|b':'c';},dividir:r=>r.split('|'),enviar:async e=>{sent.push(e.text);e.alEnviarParte(e.text);if(e.text==='a')await coordinator.recibir({channelUserId:'A',messageId:'2',text:'nuevo'});}});
 t.after(()=>coordinator.cerrar());await coordinator.recibir({channelUserId:'A',messageId:'1',text:'old'});t.mock.timers.tick(5000);await micro();assert.deepEqual(sent,['a']);t.mock.timers.tick(5000);await micro();assert.deepEqual(sent,['a','c']);
 assert.deepEqual(saved,['a','c']);
});
test('persistencia inmediata fallida no ejecuta agente y permite reintentar el evento',async t=>{
 let first=true;const x=preparar(t,{guardarEntrada:async()=>{if(first){first=false;throw Error('Supabase');}}});
 await assert.rejects(x.recibir('one','A','m1'));await x.tick(5000);assert.equal(x.batches.length,0);await x.recibir('one','A','m1');await x.tick(5000);assert.equal(x.sent.length,1);
});
