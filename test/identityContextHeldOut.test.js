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
 './humanizer':{humanizarRespuesta:async(_m,base,options)=>{calls.humanizer=options;return base;}},
 };
 vm.runInNewContext(fs.readFileSync(process.env.PRODUCT_CONTEXT_BASELINE_FILE || file,'utf8'),{module:mod,require:n=>mocks[n]||req(n),process,console:{log(){},error(){}}});
 let seq=0;
 return {calls,states,motor:mod.exports,state:(tenant='tenant-a')=>states.get(tenant+'anon'),send:(text,extra={})=>mod.exports.responderEventosEntrantes([{channelUserId:'anon',phoneNumberId:'test',messageId:String(++seq),text,...extra}])};
}


// Reserved general variants written after the fix, never used to tune thresholds.
// Interpreter outputs are simulated; the conversation engine and validator run.
for(const [brand,line,species,pack] of [['HORIZON','SENSITIVE','gato','3kg'],['MONTE','SENIOR','perro','4kg']]) test(`held-out pipeline: ${brand} correction keeps identity despite foreign candidates`,async()=>{
 const catalog=[{marca:brand,referencias:[{nombre:`${brand} ${line}`,especie:species,categoria:'comida',subcategoria:'concentrado',presentaciones:[{peso:pack,precio:12000}]}]},
 {marca:'OTROFAB',referencias:[{nombre:`OTROFAB ${line}`,especie:species,categoria:'comida',subcategoria:'concentrado',presentaciones:[{peso:pack,precio:8000}]}]}];
 const first=`Solo consultar ${brand} ${line} para ${species}, concentrado de 9kg`;
 const second=`Corrijo el tamaño: de ${pack}, el mismo concentrado para ${species}. Solo consultar el precio.`;
 const c=escenario({catalog,decision:args=>({intencion:'consulta_producto',accion:'consultar',seguimientoProducto:args.mensaje===first?'nueva':'aclaracion',confianza:.98,
  producto:{marca:brand,referencia:`${brand} ${line}`,especie:species,categoria:'comida',subcategoria:'concentrado',presentacion:args.mensaje===first?'9kg':pack,textoVisible:args.mensaje===first?first:`mismo concentrado para ${species} de ${pack}`},
  consultaCatalogo:{necesaria:true,consulta:`${brand} ${line} ${species} ${args.mensaje===first?'9kg':pack}`}})});
 await c.send(first);const reply=String(await c.send(second));assert.match(reply,new RegExp(`${brand} ${line}`));assert.match(reply,new RegExp(pack));assert.doesNotMatch(reply,/OTROFAB/);assert.deepEqual(c.state().carrito,[]);
});
test('held-out pipeline: product focus is scoped to tenant and conversation',async()=>{
 const c=escenario();await c.send('Nube adulto 1kg',{tenant:'tenant-a'});assert.ok(c.state('tenant-a'));assert.equal(c.state('tenant-b'),undefined);
 await c.send('Nube adulto 1kg',{tenant:'tenant-b'});assert.notEqual(c.state('tenant-a'),c.state('tenant-b'));assert.deepEqual(c.state('tenant-a').carrito,[]);assert.deepEqual(c.state('tenant-b').carrito,[]);
});
test('buffer completo conserva formato literal aunque el intérprete segmente solo la identidad',async()=>{
 const catalog=[{marca:'HORIZON',referencias:[{nombre:'HORIZON SENSITIVE',especie:'gato',categoria:'comida',subcategoria:'concentrado',presentaciones:[{peso:'3kg',precio:12000}]},{nombre:'HORIZON LATA SENSITIVE',especie:'gato',categoria:'comida',subcategoria:'comida_humeda',presentaciones:[{peso:'unidad',precio:4000}]}]}];
 const text='Solo consultar: HORIZON SENSITIVE para gato\nel concentrado de 3 kg';
 const c=escenario({catalog,decision:()=>({intencion:'consulta_producto',accion:'consultar',confianza:.98,producto:{marca:'HORIZON',referencia:'HORIZON SENSITIVE',especie:'gato',categoria:'comida',presentacion:'3kg',mencionOriginal:'HORIZON SENSITIVE para gato'},consultaCatalogo:{necesaria:true,consulta:'HORIZON SENSITIVE gato concentrado 3kg'}})});
 const reply=String(await c.send(text));assert.match(reply,/HORIZON SENSITIVE/);assert.match(reply,/3kg/);assert.doesNotMatch(reply,/lata|comida húmeda/i);assert.deepEqual(c.state().carrito,[]);
});
test('cambio contextual de formato no recupera la cotización seca desde selección pendiente',async()=>{
 const catalog=[{marca:'NOVA',referencias:[{nombre:'NOVA DIGEST',especie:'perro',categoria:'comida',subcategoria:'concentrado',presentaciones:[{peso:'2kg',precio:12000}]},{nombre:'NOVA LATA DIGEST',especie:'perro',categoria:'comida',subcategoria:'comida_humeda',presentaciones:[{peso:'unidad',precio:4000}]}]}];
 const c=escenario({catalog,decision:args=>{const wet=args.mensaje.includes('lata');return {intencion:'consulta_producto',accion:'consultar',seguimientoProducto:'nueva',confianza:.98,producto:{marca:'NOVA',referencia:'DIGEST',especie:'perro',categoria:'comida',subcategoria:wet?'comida_humeda':'concentrado',envase:wet?'lata':null,presentacion:wet?null:'2kg',textoVisible:wet?'la lata de esa misma línea para perro':'NOVA DIGEST para perro concentrado de 2 kg'},consultaCatalogo:{necesaria:true,consulta:wet?'NOVA DIGEST lata':'NOVA DIGEST concentrado 2kg'}};}});
 await c.send('Solo consultar NOVA DIGEST para perro concentrado de 2 kg');
 const reply=String(await c.send('Ahora cotízame la lata de esa misma línea para perro. Solo consulta.'));
 assert.match(reply,/NOVA LATA DIGEST/);assert.doesNotMatch(reply,/2\s*kg|12[.,]000|agregar/);assert.deepEqual(c.state().carrito,[]);
});
test('cantidad contextual conserva sobre y peso sin modificar carrito',async()=>{
 const catalog=[{marca:'HORIZON',referencias:[{nombre:'HORIZON POUCH KITTEN',especie:'gato',etapa:'cachorro',categoria:'comida',subcategoria:'comida_humeda',presentaciones:[{peso:'85gr',precio:4000}]}]}];
 const c=escenario({catalog,decision:args=>{const qty=args.mensaje.includes('tres');return {intencion:'consulta_producto',accion:'consultar',seguimientoProducto:qty?'aclaracion':'nueva',confianza:.98,producto:{marca:'HORIZON',referencia:'HORIZON POUCH KITTEN',especie:'gato',etapa:'cachorro',categoria:'comida',subcategoria:'comida_humeda',envase:'sobre',presentacion:qty?null:'85gr',cantidad:qty?3:null},consultaCatalogo:{necesaria:true,consulta:'HORIZON KITTEN sobre 85gr'}};}});
 await c.send('Solo consultar HORIZON kitten para gatito sobre de 85 gramos');
 const reply=String(await c.send('Ahora serían tres sobres del mismo producto, solo cotización.'));
 assert.match(reply,/HORIZON POUCH KITTEN/);assert.match(reply,/85\s*gr/);assert.equal(c.calls.humanizer.interpretacionIA.producto.cantidad,3);assert.deepEqual(c.state().carrito,[]);
});
