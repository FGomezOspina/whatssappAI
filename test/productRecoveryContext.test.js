const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { normalizarInterpretacion } = require('../src/services/aiInterpreter')._internals;

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
 vm.runInNewContext(fs.readFileSync(process.env.PRODUCT_CONTEXT_BASELINE_FILE || file,'utf8'),{module:mod,require:n=>mocks[n]||req(n),process,console:{log(){},error(){}}});
 let seq=0;
 return {calls,states,motor:mod.exports,state:(tenant='tenant-a')=>states.get(tenant+'anon'),send:(text,extra={})=>mod.exports.responderEventosEntrantes([{channelUserId:'anon',phoneNumberId:'test',messageId:String(++seq),text,...extra}])};
}

const realCatalog=require('../docs/reports/product-context-2026-10-28/catalog-snapshot.json');
const {continuarSolicitudProducto}=require('../src/services/conversationService')._internals;
const {validarCoincidenciaProducto}=require('../src/services/productMatchValidator');
const {solicitudEstructurada,identidadCompatibleAlAclarar}=require('../src/services/productRequestContext');
const {planRecuperacion,recuperarConLimites}=require('../src/services/catalogRecoveryPlan');
const family=realCatalog.filter(m=>m.marca==='PRO PLAN');
const decisionFor=(args)=>{
 const especie=args.mensaje.includes('perrito')?'perro':null;
 const ref=args.mensaje.includes('concentrado')?'CANINE UR':especie?'CANINE UR':'UR';
 return {intencion:'consulta_producto',accion:'consultar',confianza:.99,
 seguimientoProducto:args.mensaje.includes('precio')?'nueva':'aclaracion',
 producto:{marca:'PRO PLAN',referencia:ref,especie,textoVisible:args.mensaje,categoria:'alimento'},
 consultaCatalogo:{necesaria:true,consulta:['PRO PLAN',ref,especie].filter(Boolean).join(' ')}};
};
test('real UR: pregunta especie, recupera variantes caninas, confirma concentrado, conserva carrito',async()=>{
 const c=escenario({catalog:family,decision:decisionFor});
 const initial=crearEstadoInicial();initial.carrito=[{marca:'BR',referencia:'BR CAT SALMON',especie:'gato',peso:'1kg',precio:30500,cantidad:1},{marca:'ARENA KITTEN',referencia:'LAVANDA',especie:'gato',peso:'8kg',precio:23800,cantidad:1}];
 const cart=JSON.parse(JSON.stringify(initial.carrito));c.states.set('tenant-aanon',initial);
 assert.match(await c.send('precio Pro Plan UR'),/perro|gato/);
 assert.equal(c.state().ultimaConsultaProducto.aclaracion.campo,'especie');
 const second=await c.send('Para perrito');
 assert.doesNotMatch(String(second),/pendiente de un asesor/);
 assert.equal(c.state().atencionHumana,null);
 assert.equal(c.state().ultimaConsultaProducto.solicitudOriginal.producto.especie,'perro');
 assert.equal(c.state().ultimaConsultaProducto.aclaracion.campo,'referencia');
 assert.match(String(second),/CANINE UR/);assert.match(String(second),/LATA/);
 const third=await c.send('el concentrado');
 assert.match(String(third),/122[.,]000/);assert.equal(c.state().atencionHumana,null);
 assert.deepEqual(c.state().carrito,cart);
 assert.equal(await c.send('el concentrado',{messageId:'3'}),null);
});
function pending(field='especie',p={marca:'NOVA',referencia:'AB',especie:null}){
 return {ultimaConsultaProducto:{creadoEn:new Date().toISOString(),nivel:'media',terminos:['nova','ab'],
 aclaracion:{campo:field,valores:[]},solicitudOriginal:{intencion:'consulta_producto',accion:'consultar',producto:p}}};
}
test('aclaración de formato sin repetir referencia conserva identidad y especie (salida real del router)', async()=>{
 const c=escenario({catalog:family,decision:args=>args.mensaje==='el concentrado'
  ? {intencion:'consulta_producto',accion:'consultar',confianza:.95,seguimientoProducto:'aclaracion',
    producto:{marca:'PRO PLAN',referencia:null,categoria:'alimento',especie:'perro'},
    consultaCatalogo:{necesaria:false,consulta:null}}
  : decisionFor(args)});
 await c.send('precio Pro Plan UR');await c.send('Para perrito');
 const reply=String(await c.send('el concentrado'));
 assert.match(reply,/122[.,]000/);assert.doesNotMatch(reply,/CAT URINARY|GATO URINARY|1\.5kg/);
 assert.equal(c.state().ultimaConsultaProducto.solicitudOriginal.producto.referencia,'PRO PLAN CANINE UR');
 assert.match(reply,/2\s*kg/i);
});
for(const [campo,valor,text] of [['especie','perro','para mi perrito'],['tamano','grande','el grande'],['sabores',['salmon'],'mejor el de salmón'],['presentacion','3kg','el de 3 kilos'],['cantidad',2,'dos por favor'],['marca','NOVA','la marca que falta es Nova']])test(`contexto general: ${campo} desconocido, aclaración semántica sin nombre repetido`,()=>{
 const p={marca:campo==='marca'?null:'NOVA',referencia:'AB',especie:null};const state=pending(campo,p);
 const d={intencion:'consulta_producto',accion:'consultar',confianza:.99,seguimientoProducto:'aclaracion',producto:{[campo]:valor}};
 const r=continuarSolicitudProducto(d,state,text);assert.ok(r._consultaContinuada);assert.equal(r.producto.referencia,'AB');assert.deepEqual(r.producto[campo],valor);
 assert.equal(p[campo]??null,null);
});
test('identidad: atributo traducido no altera código ni línea; marca ajena y variante nueva se rechazan',()=>{
 const p={marca:'NOVA',referencia:'AB'};
 assert.ok(identidadCompatibleAlAclarar(p,{...p,referencia:'CANINE AB',especie:'perro'},['especie'],true));
 for(const actual of [{marca:'OTRA',referencia:'AB',especie:'perro'},{...p,referencia:'CD',especie:'perro'},{...p,referencia:'LATA AB',especie:'perro'}])assert.equal(identidadCompatibleAlAclarar(p,actual,['especie'],true),false);
});
test('nueva consulta, contexto vencido y pedido confirmado nunca completan la referencia anterior',()=>{
 const d={intencion:'consulta_producto',accion:'consultar',confianza:.99,seguimientoProducto:'nueva',producto:{especie:'gato'}};
 assert.equal(continuarSolicitudProducto(d,pending(),'gato'),d);
 for(const state of [{...pending(),pedidoConfirmado:true},pending()]){
  if(!state.pedidoConfirmado)state.ultimaConsultaProducto.creadoEn='2000-01-01';
  const other={...d,seguimientoProducto:'aclaracion'};assert.equal(continuarSolicitudProducto(other,state,'gato'),other);
 }
});
test('atributos ausentes conservan null, nunca perro ni cantidad uno por defecto',()=>{
 const p=solicitudEstructurada({referencia:'AB'});assert.equal(p.especie,null);assert.equal(p.cantidad,null);assert.equal(p.marca,null);
 const c=require('../src/repositories/productRepository')._internals.construirCatalogoDesdeBusqueda([{brand_name:'NOVA',reference_name:'AB',presentations:[]}]);assert.equal(c[0].referencias[0].especie,null);
});
test('aclaración de peso dentro de una frase reemplaza la selección anterior de todas las presentaciones',()=>{
 const state=pending('presentacion',{marca:'NOVA',referencia:'AB',especie:'perro',
  intencionPresentaciones:'todas',seleccionPresentaciones:{tipo:'alternativas',grupos:[{peso:'1kg'},{peso:'3kg'}]}});
 state.ultimaConsultaProducto.nivel='alta';
 const d={intencion:'consulta_producto',accion:'consultar',confianza:.98,seguimientoProducto:'aclaracion',
  producto:{marca:'NOVA',referencia:'AB',presentacion:'3kg'}};
 const r=continuarSolicitudProducto(d,state,'el de 3 kilos, solo dime su precio');
 assert.equal(r.producto.presentacion,'3kg');assert.equal(r.producto.intencionPresentaciones,'especifica');
 assert.equal(r.producto.seleccionPresentaciones,undefined);
});
test('consulta interrumpida: el peso nuevo usa identidad respaldada en el lote anterior, no palabras sociales',async()=>{
 const cats=realCatalog.filter(m=>m.marca==='DIAMOND');
 const d={intencion:'consulta_producto',accion:'consultar',confianza:.97,seguimientoProducto:'aclaracion',
  producto:{marca:'DIAMOND',referencia:'DIAMOND INDOOR CAT',especie:'gato',presentacion:'500gr',textoVisible:'el de 500 gramos'},
  consultaCatalogo:{necesaria:false,consulta:null}};
 const c=escenario({catalog:cats,decision:()=>d});
 const reply=String(await c.motor.responderEventosEntrantes([{channelUserId:'anon',messageId:'burst',text:'el de 500 gramos, solo precio'}],
  {contextoPendiente:[{contenidos:[{text:'¿Cuánto vale Diamond indoor cat?'}],respuestaGenerada:'Borrador no enviado'}]}));
 assert.match(reply,/DIAMOND INDOOR CAT/);assert.match(reply,/19[.,]500/);assert.doesNotMatch(reply,/SOLO|AGILITY|asesor/);
 const {continuarConsultaDeLote}=require('../src/services/conversationService')._internals;
 assert.equal(continuarConsultaDeLote({...d,producto:{...d.producto,referencia:'DIAMOND KITTEN'}},[{text:'Diamond indoor cat'}],'500 gramos')._consultaContinuada,undefined);
 assert.equal(continuarConsultaDeLote({...d,seguimientoProducto:'nueva'},[{text:'Diamond indoor cat'}],'otro producto')._consultaContinuada,undefined);
});
test('recuperación acotada elimina consultas duplicadas y cancela un proveedor detenido',async()=>{
 const plan=planRecuperacion({literal:'NOVA AB',consulta:'nova ab',solicitud:{marca:'NOVA',referencia:'AB'},variantes:Array.from({length:20},(_,i)=>({query:'variante '+i}))});
 assert.equal(plan.length,6);assert.equal(new Set(plan.map(p=>p.query)).size,6);
 let calls=0,signal;const start=Date.now();const r=await recuperarConLimites({plan,mensaje:'NOVA AB',timeoutMs:60,combinar:(a,b)=>a.concat(b),buscar:(_p,s)=>{calls++;signal=s;return new Promise(()=>{});}});
 assert.equal(calls,1);assert.equal(signal.aborted,true);assert.ok(Date.now()-start<500);assert.equal(r.metadata.recuperacionIncompleta,true);
});
test('recuperación no aprende ausencia por error y alcanza estrategia alternativa tras candidatos incompatibles',async()=>{
 const cat=[{marca:'NOVA',referencias:[{nombre:'NOVA AB',especie:'perro',presentaciones:[{peso:'2kg',precio:100}]}]}];let calls=0;
 const r=await recuperarConLimites({plan:planRecuperacion({literal:'NOVA AB perro',consulta:'ampliada',variantes:[{query:'alternativa'}]}),mensaje:'NOVA AB perro',combinar:(a,b)=>a.concat(b),buscar:async()=>{calls++;if(calls===1)throw Error('network');return {catalogo:calls===2?[]:cat};}});
 assert.equal(calls,3);assert.equal(r.metadata.evaluacion.estado,'confirmada');assert.equal(r.metadata.recuperacionIncompleta,true);
});

for(const text of ['NOVA XY perro','NOVA AB gato','OTRA AB perro','NOVA LATA AB perro'])test(`validador descarta identidad incompatible: ${text}`,()=>{
 const cat=[{marca:'NOVA',referencias:[{nombre:'NOVA CANINE AB',especie:'perro',categoria:'comida',subcategoria:'concentrado',presentaciones:[{peso:'2kg',precio:100}]}]}];
 const v=validarCoincidenciaProducto({mensaje:text,catalogo:cat,clasificacion:{intencion:'busqueda_producto',perfilContexto:'producto'}});
 assert.notEqual(v.nivel,'alta',JSON.stringify(v));
});
test('corrección semántica de especie conserva referencia y no propaga especie negada',()=>{
 const s=pending('especie',{marca:'NOVA',referencia:'AB',especie:'gato'});s.ultimaConsultaProducto.terminos.push('gato');
 const r=continuarSolicitudProducto({intencion:'consulta_producto',accion:'consultar',seguimientoProducto:'aclaracion',confianza:.99,producto:{marca:'NOVA',referencia:'AB',especie:'perro'}},s,'no, no es gato, es perro');
 assert.equal(r.producto.especie,'perro');assert.doesNotMatch(r._consultaContinuada,/gato/);
});
for(const type of ['audio','image'])test(`entrada ${type} utiliza la misma continuidad y conserva estado al recargar`,async()=>{
 const c=escenario({catalog:family,decision:decisionFor,media:e=>({text:e.text || 'Para perrito',imageUrl:null})});
 await c.send('precio Pro Plan UR');
 const fresh=escenario({states:c.states,catalog:family,decision:decisionFor,media:()=>({text:'Para perrito',imageUrl:null})});
 const r=await fresh.send('',{messageId:'new-media',messageType:type,media:{mediaId:'synthetic'}});
 assert.doesNotMatch(String(r),/pendiente de un asesor/);assert.equal(fresh.state().ultimaConsultaProducto.solicitudOriginal.producto.especie,'perro');
 assert.equal(fresh.state('tenant-b'),undefined);
});
test('consultas duplicadas comparten recuperación sin desalinear productos',async()=>{
 const file=require.resolve('../src/services/catalogContextService'),req=createRequire(file),mod={exports:{}};let calls=0;
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,process:{env:{CATALOG_SEARCH_LOGS:'false'}},console,require:n=>n==='../repositories/productRepository'?{buscarProductosCatalogoCliente:async()=>{calls++;return {catalogo:family};}}:req(n)});
 const r=await mod.exports.seleccionarCatalogoParaIA({consultas:['PRO PLAN CANINE UR perro','PRO PLAN CANINE UR perro','PRO PLAN FELINE UR gato'],clasificacion:{requiereBusquedaProducto:true,perfilContexto:'producto'}});
 assert.equal(calls,2);assert.equal(r.resultadosPorProducto.length,3);assert.equal(r.resultadosPorProducto[0],r.resultadosPorProducto[1]);assert.notEqual(r.resultadosPorProducto[0],r.resultadosPorProducto[2]);
});
test('replay de RPC real mantiene selección y aclaraciones sin consultar red',async()=>{
 const fixtures=require('../docs/reports/product-context-2026-10-28/rpc-replay.json');
 const cases=require('../docs/reports/product-context-2026-10-28/live-retrieval.json').rows.filter(r=>r.version==='after'&&r.round===0);
 const file=require.resolve('../src/services/catalogContextService'),req=createRequire(file),mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,process:{env:{CATALOG_SEARCH_LOGS:'false'}},console,require:n=>n==='../repositories/productRepository'?{buscarProductosCatalogoCliente:async(_c,o)=>{const r=fixtures[o.limit+'|'+o.query];assert.ok(r,`uncaptured RPC ${o.query}`);return structuredClone(r);}}:req(n)});
 for(const c of cases){const r=await mod.exports.seleccionarCatalogoParaIA({mensaje:c.mensaje,mensajeOriginal:c.mensaje,clasificacion:{requiereBusquedaProducto:true,perfilContexto:'producto'}});
 const v=validarCoincidenciaProducto({mensaje:c.mensaje,catalogo:r.catalogo,clasificacion:{intencion:'busqueda_producto',perfilContexto:'producto'}});
 assert.equal(v.nivel,c.nivel,c.mensaje);assert.equal(v.coincidencia?.referencia||null,c.match,c.mensaje);assert.deepEqual(v.aclaracion||null,c.clarification,c.mensaje);}
});
