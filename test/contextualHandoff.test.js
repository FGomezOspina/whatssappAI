const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { normalizarInterpretacion } = require('../src/services/aiInterpreter')._internals;
const { registrarAclaracion } = require('../src/services/humanHandoffService');
const { contexto, crearContexto } = require('../src/services/pipelineTelemetry');
const producto = { marca:'NUBE', referencia:'NUBE ADULTO', especie:'gato', categoria:'comida', presentacion:'1kg' };
const catalogo = [{marca:'NUBE',referencias:[{nombre:'NUBE ADULTO',especie:'gato',categoria:'comida',etapa:'adulto',presentaciones:[{peso:'1kg',precio:10000}]}]}];
const consulta = () => ({intencion:'consulta_producto',accion:'consultar',producto,consultaCatalogo:{necesaria:true,consulta:'NUBE ADULTO gato 1kg'}});
function escenario({decision = consulta, catalog = catalogo, failSave = false, searchError = false, media, states = new Map()} = {}) {
 const calls={model:0,search:0,media:0,saves:[],inputs:[]};
 const file=require.resolve('../src/services/conversationService'),req=createRequire(file),mod={exports:{}};
 const mocks={
 './clients.service':{obtenerClienteActual:async e=>({id:e.tenant||'tenant-a',vertical:'petshop'})},
 '../conversation/conversationStore':{
  obtenerConversacionPersistida:async (u,c)=>JSON.parse(JSON.stringify(states.get(c.id+u)||crearEstadoInicial())),
  obtenerHistorialRecientePersistido:async()=>[],
  guardarConversacionPersistida:async(u,s,m)=>{if(failSave&&s.atencionHumana)throw Error('Persistence unavailable'); calls.saves.push(m);if(m.fase!=='entrada'&&!m.soloEstado)s.mensajesProcesados=[...new Set([...(s.mensajesProcesados||[]),...(m.idsEventos||[])])];states.set(m.cliente.id+u,JSON.parse(JSON.stringify(s)));}},
 '../repositories/trainingExampleRepository':{obtenerEjemplosEntrenamiento:async()=>[]},
 './mediaProcessor':{procesarMultimedia:async e=>{calls.media++;return media?media(e):{text:e.text||'',imageUrl:null};}},
 './catalogContextService':{seleccionarCatalogoRefinadoVision:async()=>{calls.search++;return {catalogo:catalog,metadata:{errorBusqueda:searchError}};},seleccionarCatalogoParaIA:async()=>{calls.search++;return {catalogo:catalog,metadata:{errorBusqueda:searchError}};}},
 './aiInterpreter':{interpretarMensajeCliente:async args=>{calls.model++;calls.inputs.push(args);return decision(args);}},
 './humanizer':{humanizarRespuesta:async(_m,base)=>base},
 };
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,require:n=>mocks[n]||req(n),process,console:{log(){},error(){}}});
 let seq=0;
 return {calls,states,motor:mod.exports,state:(tenant='tenant-a')=>states.get(tenant+'anon'),send:(text,extra={})=>mod.exports.responderEventosEntrantes([{channelUserId:'anon',phoneNumberId:'test',messageId:String(++seq),text,...extra}])};
}
test('saludo contextual no consulta catálogo; saludo con producto sí', async()=>{
 const c=escenario({decision:args=>args.mensaje==='Hola'?{intencion:'otro',accion:null,consultaCatalogo:{necesaria:false},respuestaConversacional:'¡Hola! ¿En qué te ayudo?'}:consulta()});
 assert.match(await c.send('Hola'),/Hola/);assert.equal(c.calls.search,0);
 const r=await c.send('Hola, qué vale Nube adulto gato 1kg');assert.ok(r);assert.ok(c.calls.search>0);assert.equal(c.state().carrito.length,0);
});
for (const motivo of ['criterio_veterinario','solicitud_asesor']) test(`derivación ${motivo} persiste cola y respeta alcance tras reinicio`,async()=>{
 const c=escenario({decision:()=>({derivacionHumana:{necesaria:true,motivo}})});
 assert.match(await c.send('consulta de prueba'),/pendiente de un asesor/);
 assert.equal(c.state().atencionHumana.estado,'pendiente');assert.equal(c.calls.search,0);
 const restarted=escenario({states:c.states});
 const respuesta = await restarted.send('Nube adulto gato 1kg',{messageId:'new'});
 if(motivo==='solicitud_asesor'){assert.equal(respuesta,null);assert.deepEqual([restarted.calls.model,restarted.calls.search,restarted.calls.media],[0,0,0]);}
 else {assert.match(respuesta,/10.000/);assert.ok(restarted.calls.model>0);assert.equal(c.state().atencionHumana.motivo,'criterio_veterinario');}
 assert.equal(await restarted.send('duplicado',{messageId:'new'}),null);
 assert.equal(c.state().carrito.length,0);
});
test('fallo de persistencia no promete transferencia completada',async()=>{
 const c=escenario({failSave:true,decision:()=>({derivacionHumana:{necesaria:true,motivo:'criterio_veterinario'}})});
 await assert.rejects(c.send('consulta'),/Persistence unavailable/);
 assert.equal(c.state().atencionHumana,null);
});
test('producto sin referencia: conserva incertidumbre comercial sin pasar a cola',async()=>{
 const c=escenario({catalog:[],decision:args=>({intencion:'consulta_producto',accion:'consultar',producto:{referencia:'referencia desconocida'},
  seguimientoProducto:args.estado.aclaracionIdentidad?'sin_resolver':'nueva',consultaCatalogo:{necesaria:true,consulta:'referencia desconocida'}})});
 await c.send('referencia desconocida');assert.equal(c.state().atencionHumana,null);assert.ok(c.state().aclaracionIdentidad);
 assert.match(await c.send('no conozco más detalles'),/no puedo confirmar/);assert.equal(c.state().atencionHumana,null);
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

test('tras buscar y preguntar, no conocer más detalles reconoce incertidumbre sin repetir búsqueda',async()=>{
 const c=escenario({catalog:[],decision:args=>args.estado.aclaracionIdentidad
  ? {intencion:'otro',seguimientoProducto:'sin_resolver',consultaCatalogo:{necesaria:false},respuestaConversacional:'Otra pregunta'}
  : {intencion:'consulta_producto',accion:'consultar',producto:{referencia:'desconocida'},consultaCatalogo:{necesaria:true,consulta:'desconocida'}}});
 await c.send('referencia desconocida');const busquedas=c.calls.search;
 assert.match(await c.send('no sé más'),/no puedo confirmar/);assert.equal(c.calls.search,busquedas);assert.equal(c.state().atencionHumana,null);
});
test('recomendación general consulta referencias sin marcar criterio clínico ni comprar',async()=>{
 const c=escenario({decision:()=>({...consulta(),intencion:'recomendacion'})});
 await c.send('Qué alimentos tienes para gato adulto');
 assert.ok(c.calls.search>0);assert.equal(c.state().atencionHumana,null);assert.equal(c.state().carrito.length,0);
});

for (const estadoHumano of ['pendiente', 'en_atencion']) test(`incidente Sandbox: precio tras derivación ${estadoHumano} respeta alcance comercial`, async () => {
 const estado = crearEstadoInicial();
 estado.atencionHumana = { estado: estadoHumano, motivo: 'criterio_veterinario', solicitadaEn: '2026-10-28T21:08:46.570Z' };
 estado.carrito = [{ referencia: 'PRODUCTO CONSERVADO', cantidad: 2, precio: 10000 }];
 const c = escenario({ states: new Map([['tenant-aanon', estado]]),
   catalog:[{marca:'PRO PLAN',referencias:[{nombre:'PRO PLAN UR',especie:'perro',categoria:'comida',presentaciones:[{peso:'1kg',precio:42000}]}]}],
   decision:()=>({intencion:'consulta_producto',accion:'consultar',producto:{marca:'PRO PLAN',referencia:'PRO PLAN UR',mencionOriginal:'pro plan ur',especie:'perro'},consultaCatalogo:{necesaria:true,consulta:'PRO PLAN UR perro'}}) });
 const ctx = crearContexto('sandbox-fixture');
 const texto = 'y el tiene problemas urinarios, me recomendaron pro plan ur, cuanto cuesta?';
 const respuesta = await contexto.run(ctx, () => c.send(texto, { messageId: 'incident-inbound' }));
 if(estadoHumano==='en_atencion'){
   assert.equal(respuesta, null);
   assert.deepEqual(JSON.parse(JSON.stringify(ctx.omisionRespuesta)), { reason: 'human_handoff', handoffState: estadoHumano, handoffReason: 'criterio_veterinario' });
   assert.deepEqual([c.calls.model, c.calls.search, c.calls.media], [0, 0, 0]);
 }else {
   assert.match(respuesta,/42.000/);assert.match(respuesta,/PRO PLAN UR/);
   assert.equal(ctx.omisionRespuesta,undefined);assert.ok(c.calls.search>0);
 }
 assert.deepEqual(c.state().atencionHumana,estado.atencionHumana);
 assert.deepEqual(c.state().carrito, estado.carrito);
 assert.ok(c.calls.saves.some(m => m.fase === 'entrada' && m.mensaje === texto));
 assert.ok(c.state().mensajesProcesados.includes('test:incident-inbound'));
 const repetido = crearContexto('sandbox-fixture');
 await contexto.run(repetido, () => c.send(texto, { messageId: 'incident-inbound' }));
 assert.deepEqual(JSON.parse(JSON.stringify(repetido.omisionRespuesta)), { reason: 'already_processed' });
});

function pendienteClinico() {
 const estado = crearEstadoInicial();
 estado.atencionHumana = { estado:'pendiente', motivo:'criterio_veterinario', solicitadaEn:'2026-10-28T21:08:46.570Z' };
 return estado;
}
const estadosClinicos = () => new Map([['tenant-aanon', pendienteClinico()]]);
const clinica = { derivacionHumana:{necesaria:true,motivo:'criterio_veterinario'}, consultaCatalogo:{necesaria:false} };

test('consulta exclusivamente clínica pendiente responde derivación sin catálogo ni cambios de pedido',async()=>{
 const estado=pendienteClinico();estado.carrito=[{marca:'NUBE',referencia:'NUBE ADULTO',peso:'1kg',cantidad:2,precio:10000}];
 const c=escenario({states:new Map([['tenant-aanon',estado]]),decision:()=>clinica});
 assert.match(await c.send('Sigue igual; ¿qué cantidad debo administrarle?'),/criterio veterinario/);
 assert.equal(c.calls.search,0);assert.equal(c.calls.model,1);
 assert.deepEqual(c.state().carrito,estado.carrito);assert.deepEqual(c.state().atencionHumana,estado.atencionHumana);
});

for(const previa of [false,true])test(`petición mixta ${previa?'con':'sin'} derivación previa cotiza y conserva aviso clínico en historial`,async()=>{
 const c=escenario({states:previa?estadosClinicos():new Map(),decision:()=>({...consulta(),
   producto:{...producto,mencionOriginal:'Nube adulto'},...clinica,
   consultaCatalogo:{necesaria:true,consulta:'NUBE ADULTO gato 1kg'},solicitudComercialIndependiente:true})});
 const texto=await c.send('¿Qué tratamiento necesita? Además, dime el precio de Nube adulto de 1kg.');
 assert.match(texto,/10.000/);assert.match(texto,/orientación clínica sigue pendiente/);
 assert.equal((texto.match(/orientación clínica sigue pendiente/g)||[]).length,1);
 assert.doesNotMatch(texto,/te receto|te asigné|notifiqué/i);
 assert.equal(c.state().atencionHumana.motivo,'criterio_veterinario');assert.equal(c.state().carrito.length,0);
 if(previa)assert.deepEqual(c.state().atencionHumana,pendienteClinico().atencionHumana);
 const guardado=c.calls.saves.filter(m=>m.respuesta).at(-1).respuesta;
 assert.equal(guardado,texto);
 // Un turno comercial posterior no hereda el aviso por accidente.
 const restarted=escenario({states:c.states});
 const siguiente=await restarted.send('Nube adulto gato 1kg',{messageId:'siguiente'});
 assert.match(siguiente,/10.000/);assert.doesNotMatch(siguiente,/orientación clínica sigue pendiente/);
});

test('declarar parte independiente sin acción comercial no habilita recomendación clínica',async()=>{
 const c=escenario({states:estadosClinicos(),decision:()=>({...clinica,solicitudComercialIndependiente:true,intencion:'recomendacion'})});
 assert.match(await c.send('Escoge lo que le cure según estos síntomas'),/criterio veterinario/);
 assert.equal(c.calls.search,0);assert.equal(c.state().carrito.length,0);
});

test('petición explícita de asesor durante pendiente clínica pausa todo conservando antecedente',async()=>{
 const c=escenario({states:estadosClinicos(),decision:()=>({...consulta(),derivacionHumana:{necesaria:true,motivo:'solicitud_asesor'},solicitudComercialIndependiente:true})});
 assert.match(await c.send('Prefiero hablar con una persona; también necesito comprar Nube adulto'),/pendiente de un asesor/);
 assert.equal(c.calls.search,0);assert.equal(c.state().atencionHumana.motivo,'solicitud_asesor');
 assert.deepEqual(c.state().atencionHumana.consultaClinicaPendiente,pendienteClinico().atencionHumana);
 const antes=c.calls.model;assert.equal(await c.send('¿Qué vale Nube adulto de 1kg?'),null);assert.equal(c.calls.model,antes);
});

for(const motivo of ['solicitud_asesor'])test(`no abre otras derivaciones pendientes: ${motivo}`,async()=>{
 const estado=pendienteClinico();estado.atencionHumana.motivo=motivo;
 const c=escenario({states:new Map([['tenant-aanon',estado]])});
 assert.equal(await c.send('precio Nube adulto gato 1kg'),null);
 assert.deepEqual([c.calls.model,c.calls.media,c.calls.search],[0,0,0]);
});

for(const [referencia,mensaje] of [
 ['NUBE RENAL','El veterinario ya eligió NUBE RENAL, ¿a cómo la bolsa de 1kg?'],
 ['FARO GASTROINTESTINAL','k vale FARO GASTROINTESTINAL de 1kg?'],
 ['ORBE URINARY','No estoy pidiendo un diagnóstico: ¿manejan ORBE URINARY de 1kg?'],
 ['LUMEN SOLUCION','Tengo la receta. Necesito cotizar LUMEN SOLUCION de 1kg'],
])test(`vocabulario veterinario no bloquea acción comercial estructurada: ${referencia}`,async()=>{
 const marca=referencia.split(' ')[0];
 const c=escenario({states:estadosClinicos(),catalog:[{marca,referencias:[{nombre:referencia,especie:'gato',categoria:'comida',presentaciones:[{peso:'1kg',precio:31000}]}]}],
   decision:()=>({intencion:'consulta_producto',accion:'consultar',producto:{marca,referencia,especie:'gato',presentacion:'1kg',mencionOriginal:referencia},consultaCatalogo:{necesaria:true,consulta:referencia}})});
 const respuesta=await c.send(mensaje);assert.match(respuesta,/31.000/);assert.ok(respuesta.includes(referencia));
 assert.ok(c.calls.search>0);assert.deepEqual(c.state().atencionHumana,pendienteClinico().atencionHumana);
});

for(const tipo of ['image','audio'])test(`consulta comercial ${tipo} usa procesamiento multimedia existente pese a pendiente clínica`,async()=>{
 const c=escenario({states:estadosClinicos(),media:e=>({text:tipo==='audio'?'¿Qué vale Nube adulto gato 1kg?':e.text,imageUrl:tipo==='image'?'data:image/jpeg;base64,fixture':null}),
   decision:()=>({...consulta(),producto:{...producto,textoVisible:'NUBE ADULTO',observado:{nombre:'NUBE ADULTO',presentacion:'1kg',confianzaIdentidad:0.99}}})});
 const respuesta=await c.send(tipo==='image'?'¿Cuánto vale?':'',{messageType:tipo,media:{type:tipo}});
 assert.match(respuesta,/10.000/);assert.equal(c.calls.media,1);assert.ok(c.calls.search>0);
 assert.deepEqual(c.state().atencionHumana,pendienteClinico().atencionHumana);
 if(tipo==='image')assert.ok(c.calls.inputs[0].imageUrls.length);
 else assert.match(c.calls.inputs[0].mensaje,/Nube adulto/);
});

test('compra y datos completos avanzan checkout conservando derivación clínica e idempotencia',async()=>{
 const c=escenario({states:estadosClinicos(),decision:args=>args.mensaje==='Sí, finalizamos así'
   ? {intencion:'confirmacion',accion:'confirmar',continuarFlujo:true,consultaCatalogo:{necesaria:false}}
   : args.mensaje.includes('Nombre:')
   ? {intencion:'datos_envio',continuarFlujo:true,consultaCatalogo:{necesaria:false},entrega:{tipo:'domicilio'}}
   : {...consulta(),intencion:'pedido_producto',accion:'agregar',producto:{...producto,mencionOriginal:'Nube adulto',cantidad:1}}});
 assert.match(await c.send('Agrega un Nube adulto gato 1kg',{messageId:'compra'}),/10.000/);
 assert.equal(c.state().carrito.length,1);assert.equal(c.state().carrito[0].cantidad,1);
 assert.equal(await c.send('Agrega un Nube adulto gato 1kg',{messageId:'compra'}),null);
 const respuesta=await c.send('Nombre: Ana Prueba\nCelular: 3001234567\nDirección: Calle 10 # 20-30\nContraentrega',{messageId:'datos'});
 assert.match(respuesta,/finalizamos|confirmar/i);assert.doesNotMatch(respuesta,/- cedula|- correo/);
 assert.equal(c.state().datosDomicilio.nombre,'Ana Prueba');assert.equal(c.state().carrito[0].cantidad,1);
 const final = await c.send('Sí, finalizamos así',{messageId:'confirmacion'});
 assert.match(final,/confirmad/i);assert.equal(c.state().pedidoConfirmado,true);
 assert.equal(await c.send('Sí, finalizamos así',{messageId:'confirmacion'}),null);
 assert.deepEqual(c.state().atencionHumana,pendienteClinico().atencionHumana);
});

test('estado clínico de otra empresa no altera pausa de operador del mismo usuario',async()=>{
 const a=pendienteClinico(),b=pendienteClinico();b.atencionHumana.estado='en_atencion';
 const c=escenario({states:new Map([['tenant-aanon',a],['tenant-banon',b]])});
 const [ra,rb]=await Promise.all([c.send('Nube adulto gato 1kg'),c.send('Nube adulto gato 1kg',{tenant:'tenant-b'})]);
 assert.match(ra,/10.000/);assert.equal(rb,null);assert.equal(c.state('tenant-b').atencionHumana.estado,'en_atencion');
});

test('esquema solo acepta booleano explícito para solicitud comercial independiente',()=>{
 for(const valor of [false,'true',1,undefined])assert.equal(normalizarInterpretacion({solicitudComercialIndependiente:valor}).solicitudComercialIndependiente,false);
 assert.equal(normalizarInterpretacion({solicitudComercialIndependiente:true}).solicitudComercialIndependiente,true);
});

test('turno elíptico usa selección cotizada después de recargar conversación clínica pendiente',async()=>{
 const c=escenario({states:estadosClinicos()});
 await c.send('Precio Nube adulto gato 1kg',{messageId:'cotizacion'});
 const reloaded=escenario({states:c.states,decision:()=>({...consulta(),intencion:'pedido_producto',accion:'agregar',
   compraContextual:'foco',continuarFlujo:true,producto:{...producto,cantidad:1}})});
 const respuesta=await reloaded.send('Bueno, envíame ese',{messageId:'aceptacion'});
 assert.match(respuesta,/10.000/);assert.equal(reloaded.state().carrito.length,1);assert.equal(reloaded.state().carrito[0].cantidad,1);
 assert.deepEqual(reloaded.state().atencionHumana,pendienteClinico().atencionHumana);
});

test('buffer real y motor: ráfaga comercial tras pausa clínica produce una respuesta; reentrega no repite',async t=>{
 const {crearCoordinador}=require('../src/services/conversationScheduler');
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:Date.now()});
 const c=escenario({states:estadosClinicos(),decision:()=>({...consulta(),producto:{...producto,mencionOriginal:'Nube adulto'}})});
 const sent=[],batches=[];
 const coord=crearCoordinador({ventanaMs:5000,procesar:async(es,op)=>{batches.push(es.map(e=>e.messageId));return c.motor.responderEventosEntrantes(es,op);},enviar:async e=>sent.push(e.text)});
 t.after(()=>coord.cerrar());
 const event=(messageId,text)=>({messageId,text,phoneNumberId:'test',channelUserId:'anon',recipientId:'test-only'});
 await coord.recibir(event('r1','¿Me cotizas Nube adulto?'));
 t.mock.timers.tick(3000);
 await coord.recibir(event('r2','de 1kg, para gato'));
 await coord.recibir(event('r2','de 1kg, para gato'));
 t.mock.timers.tick(5000);await coord.estados.get('test:anon').promesa;
 assert.deepEqual(batches,[['r1','r2']]);assert.equal(sent.length,1);assert.match(sent[0],/10.000/);
 await coord.recibir(event('r1','¿Me cotizas Nube adulto?'));t.mock.timers.tick(5000);
 assert.equal(sent.length,1);assert.equal(coord.estados.size,0);assert.equal(c.state().carrito.length,0);
});

test('mensaje comercial durante procesamiento clínico pendiente invalida borrador pero no bloquea siguiente respuesta',async t=>{
 const {crearCoordinador}=require('../src/services/conversationScheduler');
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:Date.now()});
 let release,entered;const gate=new Promise(r=>release=r), started=new Promise(r=>entered=r);let first=true;
 const c=escenario({states:estadosClinicos(),decision:async()=>{if(first){first=false;entered();await gate;}return {...consulta(),producto:{...producto,mencionOriginal:'Nube adulto'}};}});
 const sent=[];const coord=crearCoordinador({ventanaMs:5000,procesar:c.motor.responderEventosEntrantes,enviar:async e=>sent.push(e.text)});
 t.after(()=>coord.cerrar());
 const event=(messageId,text)=>({messageId,text,phoneNumberId:'test',channelUserId:'anon',recipientId:'test-only'});
 await coord.recibir(event('p1','¿Precio Nube adulto gato 1kg?'));t.mock.timers.tick(5000);await started;
 const s=coord.estados.get('test:anon'),primera=s.promesa;
 await coord.recibir(event('p2','Nube adulto gato 1kg, ¿está disponible?'));t.mock.timers.tick(5000);
 release();await primera;await s.promesa;
 assert.equal(sent.length,1);assert.match(sent[0],/10.000/);assert.equal(coord.estados.size,0);
 assert.ok(c.state().mensajesProcesados.includes('test:p1'));assert.ok(c.state().mensajesProcesados.includes('test:p2'));
 assert.deepEqual(c.state().atencionHumana,pendienteClinico().atencionHumana);
});

test('fallo guardando derivación mixta no ejecuta pedido ni anuncia notificación',async()=>{
 const c=escenario({failSave:true,decision:()=>({...consulta(),...clinica,consultaCatalogo:{necesaria:true},solicitudComercialIndependiente:true})});
 await assert.rejects(c.send('Consulta clínica y precio independiente'),/Persistence unavailable/);
 assert.equal(c.calls.search,0);assert.equal(c.state().atencionHumana,null);assert.equal(c.state().carrito.length,0);
});

test('prompts de producción conservan política comercial/clínica y tono después de compresión',()=>{
 const {construirSolicitudInterprete,construirPromptHumanizador}=require('../src/services/aiContextOptimizer');
 const vertical={key:'petshop',prompts:require('../src/verticals/petshop/prompt')};
 const router=construirSolicitudInterprete({mensaje:'consulta',estado:pendienteClinico(),vertical,clasificacion:{decisionHerramientas:true,perfilContexto:'pedido'},model:'test'});
 assert.match(router.promptBase,/solicitudComercialIndependiente/);assert.match(router.promptBase,/"estado":"pendiente","motivo":"criterio_veterinario"/);
 assert.match(router.promptBase,/SOLO la parte comercial independiente/);
 const humanizer=construirPromptHumanizador({vertical});
 assert.match(humanizer,/experto en petshop y veterinaria/);assert.match(humanizer,/No diagnostiques/);
 assert.match(humanizer,/tono vendedor, amable, cordial y profesional/);
});

test('aviso clínico de un turno mixto no se filtra a otra empresa concurrente',async()=>{
 const c=escenario({decision:args=>args.cliente.id==='tenant-a'
   ? {...consulta(),derivacionHumana:clinica.derivacionHumana,solicitudComercialIndependiente:true}
   : consulta()});
 const [mixto,comercial]=await Promise.all([c.send('Nube adulto gato 1kg'),c.send('Nube adulto gato 1kg',{tenant:'tenant-b'})]);
 assert.match(mixto,/orientación clínica sigue pendiente/);assert.doesNotMatch(comercial,/orientación clínica sigue pendiente/);
 assert.equal(c.state().atencionHumana.motivo,'criterio_veterinario');assert.equal(c.state('tenant-b').atencionHumana,null);
});

test('compra explícita independiente en turno clínico mixto agrega una sola vez sin sugerir tratamiento',async()=>{
 const c=escenario({states:estadosClinicos(),decision:()=>({...consulta(),intencion:'pedido_producto',accion:'agregar',continuarFlujo:true,
   producto:{...producto,mencionOriginal:'Nube adulto',cantidad:2},derivacionHumana:clinica.derivacionHumana,solicitudComercialIndependiente:true})});
 const texto='¿Qué tratamiento necesitaría? Aparte, agrega dos bolsas de Nube adulto de 1kg para mi otro gato.';
 const respuesta=await c.send(texto,{messageId:'mixta-compra'});
 assert.equal(c.state().carrito.length,1);assert.equal(c.state().carrito[0].cantidad,2);
 assert.match(respuesta,/20.000/);assert.match(respuesta,/orientación clínica sigue pendiente/);
 assert.equal(await c.send(texto,{messageId:'mixta-compra'}),null);assert.equal(c.state().carrito[0].cantidad,2);
});

test('pendiente comercial heredado reanuda consultas sin borrar contexto ni carrito',async()=>{
 const estado=pendienteClinico();estado.atencionHumana.motivo='producto_no_resuelto';
 const previo=structuredClone(estado.carrito);const c=escenario({states:new Map([['tenant-aanon',estado]])});
 assert.match(await c.send('precio Nube adulto gato 1kg'),/10.000/);
 assert.equal(c.state().atencionHumana.estado,'cerrada');assert.equal(c.state().atencionHumana.motivoCierre,'continuidad_comercial');
 assert.deepEqual(c.state().carrito,previo);
});
test('comercial heredado en atención humana no se reabre',async()=>{
 const estado=pendienteClinico();estado.atencionHumana={estado:'en_atencion',motivo:'producto_no_resuelto'};
 const c=escenario({states:new Map([['tenant-aanon',estado]])});assert.equal(await c.send('precio Nube adulto gato 1kg'),null);assert.equal(c.calls.model,0);
});
