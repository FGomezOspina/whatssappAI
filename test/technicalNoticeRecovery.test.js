const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createRequire}=require('node:module');
const {crearCoordinador}=require('../src/services/conversationScheduler');
const {crearEstadoInicial}=require('../src/conversation/conversationStore');
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function load(file,mocks){const req=createRequire(file),module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),
 {module,require:n=>mocks[n]||req(n),process,console:{log(){},error(){}}});return module.exports;}
function setup({fault='summary-null',barrier=null,transportError=false,reservationError=false,confirmationError=false}={}){
 let state=crearEstadoInicial();state.carrito=[{referencia:'OTRA',cantidad:2}];
 state.ultimaPreguntaAsistente='¿Qué presentación necesitas?';state.memoriaConversacional={resumen:'previo',hasta:{id:'old',created_at:'2020-01-01T00:00:00Z'}};
 const original=structuredClone(state),messages=[],sent=[],stats=[],models=[];let orders=0,learning=0,fail=fault;
 const repo={supabaseConfigurado:()=>true,buscarConversacion:async()=>({state:structuredClone(state)}),
  guardarConversacion:async(_u,s)=>{if((reservationError&&s.avisosTecnicos?.some(a=>a.estado==='reservado'))||(confirmationError&&s.avisosTecnicos?.some(a=>a.estado==='enviado')))throw Error('storage unavailable');state=structuredClone(s);return {id:'conversation'};},
  guardarMensaje:async(_u,d,text,_c,_tenant,metadata)=>{const key=d+metadata?.eventKey;const item={key,d,text,metadata};const i=messages.findIndex(m=>m.key===key);if(i<0)messages.push(item);else messages[i]=item;},
  guardarPedidoConfirmado:async()=>{orders++;},buscarMensajesRecientes:async()=>[]};
 const store=load(require.resolve('../src/conversation/conversationStore'),{
  '../repositories/supabaseConversationRepository':repo,'../repositories/learningRepository':{capturarAprendizaje:async()=>{learning++;}}});
 const service=load(require.resolve('../src/services/conversationService'),{
  './clients.service':{obtenerClienteActual:async()=>({id:'tenant',vertical:'petshop'})},
  '../conversation/conversationStore':{...store,obtenerHistorialRecientePersistido:async(_u,_n,_c,o={})=>{
   if(fail==='history')throw Error('history unavailable');
   if(o.antes){
    if(fail==='summary-second'&&state.memoriaConversacional.hasta.id==='archived')return [{id:'next-page',created_at:'2020-01-02T12:00:00Z',body:'otra pagina'}];
    return state.memoriaConversacional.hasta.id==='archived'?[]:[{id:'archived',created_at:'2020-01-02T00:00:00Z',body:'historia'}];
   }
   return [{id:'recent',created_at:'2020-01-03T00:00:00Z',body:'reciente'}];}},
  './mediaProcessor':{procesarMultimedia:async e=>({text:e.text,imageUrl:null})},
  '../repositories/trainingExampleRepository':{obtenerEjemplosEntrenamiento:async()=>[]},
  './humanizer':{humanizarRespuesta:async(_m,r)=>r},
  './aiInterpreter':{interpretarMensajeCliente:async a=>{models.push(a.clasificacion.resumirHistorial?'summary':'router');
   if(barrier){const b=barrier;barrier=null;await b.promise;}
   if(a.clasificacion.resumirHistorial){
    if(fail==='summary-second'&&state.memoriaConversacional.hasta.id==='archived')throw Error('provider');
    if(fail==='summary-throw')throw Object.assign(Error('credits'),{status:429,code:'credit_balance_exhausted'});
    if(fail==='summary-null')return null;
    return {resumenMemoria:'previo; historia'};
   }
   if(fail==='router-throw')throw Error('provider');if(fail==='router-null')return null;
   return {intencion:'otro',accion:null,consultaCatalogo:{necesaria:false},respuestaConversacional:'Seguimos con tu consulta.'};}},
 });
 function coordinator(){let buffered=[],flush;const c=crearCoordinador({procesar:service.responderEventosEntrantes,
  enviar:async e=>{if(transportError)throw Error('transport outcome unknown');sent.push(e.text);},onSummary:s=>stats.push(s),
  bufferFactory:({alVaciar})=>{flush=()=>{const es=buffered.splice(0);if(es.length)alVaciar(es);};return {agregar:e=>buffered.push(e),cerrar(){}};}});
  return {c,receive:id=>c.recibir({channelUserId:'user',recipientId:'user',phoneNumberId:'channel',messageId:id,text:'consulta'}),
   flush:()=>{flush();return c.estados.get('channel:user')?.promesa;}};
 }
 return {coordinator,state:()=>state,original,messages,sent,stats,models,recover:()=>{fail=null;},effects:()=>({orders,learning})};
}
for(const fault of ['summary-null','summary-throw','history','router-null','router-throw'])test(`${fault}: aviso sin IA, conserva negocio y permite recuperar mismo evento`,async()=>{
 const x=setup({fault});let c=x.coordinator();await c.receive('m1');await c.flush();
 assert.equal(x.sent.length,1);assert.match(x.sent[0],/problema temporal/);
 assert.equal(x.stats[0].outcome.status,'technical_notice');
 assert.equal(x.state().mensajesProcesados.includes('channel:m1'),false);
 assert.equal(x.state().avisosTecnicos[0].estado,'enviado');
 assert.deepEqual(x.state().carrito,x.original.carrito);assert.equal(x.state().ultimaPreguntaAsistente,x.original.ultimaPreguntaAsistente);
 if(!fault.startsWith('router'))assert.deepEqual(x.state().memoriaConversacional,x.original.memoriaConversacional);
 assert.deepEqual(x.effects(),{orders:0,learning:0});
 await c.receive('m1');await c.flush();assert.equal(x.sent.length,1,'same-process redelivery retries processing but not notice');
 c=x.coordinator();await c.receive('m1');await c.flush();assert.equal(x.sent.length,1,'persisted reservation survives coordinator recreation');
 x.recover();await c.receive('m1');await c.flush();assert.equal(x.sent.length,2);
 assert.ok(x.state().mensajesProcesados.includes('channel:m1'));
 const outbound=x.messages.filter(m=>m.d==='outbound');assert.equal(outbound.length,2);
 assert.notEqual(outbound[0].metadata.eventKey,outbound[1].metadata.eventKey);
 await c.receive('m1');await c.flush();assert.equal(x.sent.length,2);
});
test('duplicado concurrente genera un solo aviso y no inicia un bucle de reintentos',async()=>{
 const g=gate(),x=setup({barrier:g}),c=x.coordinator();await c.receive('m1');const running=c.flush();
 await c.receive('m1');g.resolve();await running;
 assert.equal(x.sent.length,1);assert.equal(x.models.length,1);assert.equal(c.c.estados.size,0);
});
test('lote superado no envía ni reserva aviso; el último lote responde una vez',async()=>{
 const g=gate(),x=setup({barrier:g}),c=x.coordinator();await c.receive('m1');const first=c.flush();
 await c.receive('m2');g.resolve();await first;assert.equal(x.sent.length,0);assert.equal(x.state().avisosTecnicos.length,0);
 await c.flush();assert.equal(x.sent.length,1);assert.equal(x.state().avisosTecnicos[0].evento,'channel:m2');
});
test('transporte incierto reserva aviso y no lo repite ni consume el evento',async()=>{
 const x=setup({transportError:true}),c=x.coordinator();await c.receive('m1');await c.flush();
 assert.equal(x.state().avisosTecnicos[0].estado,'reservado');assert.equal(x.messages.filter(m=>m.d==='outbound').length,0);
 await c.receive('m1');await c.flush();assert.equal(x.stats.at(-1).outcome.reason,'technical_notice_already_reserved');
 assert.equal(x.state().mensajesProcesados.length,0);
});
test('si no se puede reservar de forma persistente, no se envía un aviso sin protección',async()=>{
 const x=setup({reservationError:true}),c=x.coordinator();await c.receive('m1');await c.flush();
 assert.equal(x.sent.length,0);assert.equal(x.stats[0].outcome.stage,'response_reservation');
 assert.equal(x.state().mensajesProcesados.length,0);
});
test('éxito normal no crea reserva técnica y conserva flujo de respuesta',async()=>{
 const x=setup({fault:null}),c=x.coordinator();await c.receive('m1');await c.flush();
 assert.equal(x.stats[0].outcome.status,'sent');assert.equal(x.sent.length,1);assert.equal(x.state().avisosTecnicos.length,0);
 assert.deepEqual(x.state().carrito,x.original.carrito);
});
test('fallo en segunda página conserva el último resumen persistido sin retroceder ni saltar cursor',async()=>{
 const x=setup({fault:'summary-second'}),c=x.coordinator();await c.receive('m1');await c.flush();
 assert.equal(x.sent.length,1);assert.equal(x.state().memoriaConversacional.hasta.id,'archived');
 assert.equal(x.state().memoriaConversacional.resumen,'previo; historia');
 assert.equal(x.state().mensajesProcesados.length,0);assert.deepEqual(x.state().carrito,x.original.carrito);
});
test('confirmación persistida falla después del envío: reserva sobrevive y evita repetir aviso',async()=>{
 const x=setup({confirmationError:true});let c=x.coordinator();await c.receive('m1');await c.flush();
 assert.equal(x.sent.length,1);assert.equal(x.stats[0].outcome.stage,'save_response');
 assert.equal(x.state().avisosTecnicos[0].estado,'reservado');
 c=x.coordinator();await c.receive('m1');await c.flush();assert.equal(x.sent.length,1);
 assert.equal(x.state().mensajesProcesados.length,0);
});
