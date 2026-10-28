const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { normalizarInterpretacion } = require('../src/services/aiInterpreter')._internals;
const { registrarAclaracion } = require('../src/services/humanHandoffService');
const producto = { marca:'NUBE', referencia:'NUBE ADULTO', especie:'gato', categoria:'comida', presentacion:'1kg' };
const catalogo = [{marca:'NUBE',referencias:[{nombre:'NUBE ADULTO',especie:'gato',categoria:'comida',etapa:'adulto',presentaciones:[{peso:'1kg',precio:10000}]}]}];
const consulta = () => ({intencion:'consulta_producto',accion:'consultar',producto,consultaCatalogo:{necesaria:true,consulta:'NUBE ADULTO gato 1kg'}});
function escenario({decision = consulta, catalog = catalogo, failSave = false, searchError = false, states = new Map()} = {}) {
 const calls={model:0,search:0,media:0,saves:[]};
 const file=require.resolve('../src/services/conversationService'),req=createRequire(file),mod={exports:{}};
 const mocks={
 './clients.service':{obtenerClienteActual:async e=>({id:e.tenant||'tenant-a',vertical:'petshop'})},
 '../conversation/conversationStore':{
  obtenerConversacionPersistida:async (u,c)=>JSON.parse(JSON.stringify(states.get(c.id+u)||crearEstadoInicial())),
  obtenerHistorialRecientePersistido:async()=>[],
  guardarConversacionPersistida:async(u,s,m)=>{if(failSave&&s.atencionHumana)throw Error('Persistence unavailable'); calls.saves.push(m);states.set(m.cliente.id+u,JSON.parse(JSON.stringify(s)));}},
 '../repositories/trainingExampleRepository':{obtenerEjemplosEntrenamiento:async()=>[]},
 './mediaProcessor':{procesarMultimedia:async e=>{calls.media++;return {text:e.text||'',imageUrl:null};}},
 './catalogContextService':{seleccionarCatalogoParaIA:async()=>{calls.search++;return {catalogo:catalog,metadata:{errorBusqueda:searchError}};}},
 './aiInterpreter':{interpretarMensajeCliente:async args=>{calls.model++;return decision(args);}},
 './humanizer':{humanizarRespuesta:async(_m,base)=>base},
 };
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,require:n=>mocks[n]||req(n),process,console:{log(){},error(){}}});
 let seq=0;
 return {calls,states,state:(tenant='tenant-a')=>states.get(tenant+'anon'),send:(text,extra={})=>mod.exports.responderEventosEntrantes([{channelUserId:'anon',phoneNumberId:'test',messageId:String(++seq),text,...extra}])};
}
test('saludo contextual no consulta catálogo; saludo con producto sí', async()=>{
 const c=escenario({decision:args=>args.mensaje==='Hola'?{intencion:'otro',accion:null,consultaCatalogo:{necesaria:false},respuestaConversacional:'¡Hola! ¿En qué te ayudo?'}:consulta()});
 assert.match(await c.send('Hola'),/Hola/);assert.equal(c.calls.search,0);
 const r=await c.send('Hola, qué vale Nube adulto gato 1kg');assert.ok(r);assert.ok(c.calls.search>0);assert.equal(c.state().carrito.length,0);
});
for (const motivo of ['criterio_veterinario','solicitud_asesor']) test(`derivación ${motivo} persiste cola antes de responder y suspende tras reinicio`,async()=>{
 const c=escenario({decision:()=>({derivacionHumana:{necesaria:true,motivo}})});
 assert.match(await c.send('consulta de prueba'),/pendiente de un asesor/);
 assert.equal(c.state().atencionHumana.estado,'pendiente');assert.equal(c.calls.search,0);
 const restarted=escenario({states:c.states});
 assert.equal(await restarted.send('ya puedes continuar',{messageId:'new'}),null);
 assert.deepEqual([restarted.calls.model,restarted.calls.search,restarted.calls.media],[0,0,0]);
 assert.equal(await restarted.send('duplicado',{messageId:'new'}),null);
 assert.equal(c.state().carrito.length,0);
});
test('fallo de persistencia no promete transferencia completada',async()=>{
 const c=escenario({failSave:true,decision:()=>({derivacionHumana:{necesaria:true,motivo:'criterio_veterinario'}})});
 await assert.rejects(c.send('consulta'),/Persistence unavailable/);
 assert.equal(c.state().atencionHumana,null);
});
test('producto sin referencia: una aclaración; si sigue sin resolver pasa a cola',async()=>{
 const c=escenario({catalog:[],decision:args=>({intencion:'consulta_producto',accion:'consultar',producto:{referencia:'referencia desconocida'},
  seguimientoProducto:args.estado.aclaracionIdentidad?'sin_resolver':'nueva',consultaCatalogo:{necesaria:true,consulta:'referencia desconocida'}})});
 await c.send('referencia desconocida');assert.equal(c.state().atencionHumana,null);assert.ok(c.state().aclaracionIdentidad);
 assert.match(await c.send('no conozco más detalles'),/pendiente de un asesor/);assert.equal(c.state().atencionHumana.motivo,'producto_no_resuelto');
});
test('aclaración resuelta valida catálogo y no escala',async()=>{
 let primera=true;const c=escenario({decision:()=>{if(primera){primera=false;return {intencion:'consulta_producto',accion:'consultar',producto:{referencia:'desconocida'},consultaCatalogo:{necesaria:true,consulta:'desconocida'}};}return {...consulta(),seguimientoProducto:'aclaracion'};}});
 await c.send('referencia desconocida');await c.send('Nube adulto gato 1kg');
 assert.equal(c.state().atencionHumana,null);assert.equal(c.state().aclaracionIdentidad,null);
});
test('dos empresas con mismo usuario conservan pausa independiente',async()=>{
 const c=escenario({decision:args=>args.cliente.id==='tenant-a'?{derivacionHumana:{necesaria:true,motivo:'solicitud_asesor'}}:{intencion:'otro',consultaCatalogo:{necesaria:false},respuestaConversacional:'Hola'}});
 await Promise.all([c.send('asesor'),c.send('Hola',{tenant:'tenant-b'})]);
 assert.equal(c.state().atencionHumana.estado,'pendiente');assert.equal(c.state('tenant-b').atencionHumana,null);
});
test('no acepta motivo inventado ni convierte compra comercial de medicamento en clínica',()=>{
 const n=normalizarInterpretacion({intencion:'consulta_producto',producto:{categoria:'medicamento',referencia:'REFERENCIA CATALOGO'},derivacionHumana:{necesaria:true,motivo:'no_existe'}});
 assert.equal(n.derivacionHumana.necesaria,false);assert.equal(n.producto.categoria,'medicamento');
});
test('progreso entre atributos permite aclarar, nueva solicitud reinicia contador',()=>{
 const s={};const reg=(campo,seguimientoProducto)=>registrarAclaracion(s,{mensaje:'consulta',decision:{seguimientoProducto},validacion:{aclaracion:{campo}}});
 assert.equal(reg('especie','nueva'),false);assert.equal(reg('presentacion','aclaracion'),false);
 assert.equal(reg('marca','nueva'),false);assert.equal(s.aclaracionIdentidad.intentos,1);
 assert.equal(reg('marca','sin_resolver'),true);
});
test('cierre explícito del estado por operador permite próximo turno sin perder carrito',async()=>{
 const c=escenario({decision:()=>({derivacionHumana:{necesaria:true,motivo:'solicitud_asesor'}})});
 await c.send('asesor');
 // Future admin UI must persist this explicit transition; customer text cannot do it.
 const resumed=JSON.parse(JSON.stringify(c.state()));
 resumed.atencionHumana={...resumed.atencionHumana,estado:'cerrada'};resumed.aclaracionIdentidad=null;
 c.states.set('tenant-aanon',resumed);
 const restarted=escenario({states:c.states});await restarted.send('precio Nube adulto gato 1kg',{messageId:'next'});
 assert.ok(restarted.calls.model>0);assert.equal(restarted.state().atencionHumana.estado,'cerrada');
 assert.deepEqual(restarted.state().carrito,resumed.carrito);
});

test('mapeo refina identidad sin convertir consulta en operación de carrito',async()=>{
 const {resolverEvidenciaInterpretacion}=require('../src/services/productEvidenceService');
 const mapeo={intencion:'pedido_producto',accion:'agregar',carrito:{operacion:'agregar'},producto:{...producto,accion:'agregar'}};
 const reconciliado=resolverEvidenciaInterpretacion(mapeo,{...consulta(),carrito:{operacion:null}});
 assert.equal(reconciliado.accion,'consultar');assert.equal(reconciliado.producto.accion,'consultar');
 assert.equal(reconciliado.carrito.operacion,null);
 const c=escenario({decision:args=>args.clasificacion.decisionHerramientas?{...consulta(),carrito:{operacion:null}}:mapeo});
 const respuesta=await c.send('Nube adulto gato 1kg');
 assert.doesNotMatch(String(respuesta),/retirar productos|conservar solo/);assert.equal(c.state().carrito.length,0);
});

test('fallo técnico de búsqueda no aprende ausencia ni cuenta aclaración fallida',async()=>{
 const c=escenario({catalog:[],searchError:true});
 for(let i=0;i<2;i++) assert.match(await c.send('Nube adulto gato 1kg'),/problema temporal/);
 assert.equal(c.state().atencionHumana,null);assert.equal(c.state().aclaracionIdentidad,null);
});

test('tras buscar y preguntar, no conocer más detalles escala sin repetir búsqueda',async()=>{
 const c=escenario({catalog:[],decision:args=>args.estado.aclaracionIdentidad
  ? {intencion:'otro',seguimientoProducto:'sin_resolver',consultaCatalogo:{necesaria:false},respuestaConversacional:'Otra pregunta'}
  : {intencion:'consulta_producto',accion:'consultar',producto:{referencia:'desconocida'},consultaCatalogo:{necesaria:true,consulta:'desconocida'}}});
 await c.send('referencia desconocida');const busquedas=c.calls.search;
 assert.match(await c.send('no sé más'),/pendiente de un asesor/);assert.equal(c.calls.search,busquedas);
});
test('recomendación general consulta referencias sin marcar criterio clínico ni comprar',async()=>{
 const c=escenario({decision:()=>({...consulta(),intencion:'recomendacion'})});
 await c.send('Qué alimentos tienes para gato adulto');
 assert.ok(c.calls.search>0);assert.equal(c.state().atencionHumana,null);assert.equal(c.state().carrito.length,0);
});
