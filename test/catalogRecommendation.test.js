const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createRequire}=require('node:module');
const service=require('../src/services/catalogRecommendationService');
const {resolverConsultaCatalogo}=require('../src/verticals/petshop/orderLogic');
const {crearEstadoInicial}=require('../src/conversation/conversationStore');
const { _internals:{omitirHumanizadorProducto} }=require('../src/services/humanizer');
const d=(p={},query={})=>({intencion:'recomendacion',accion:'consultar',consultaCatalogo:{tipo:'necesidad',presupuestoMaximo:null,...query},
 producto:{categoria:'comida',especie:'gato',etapa:'cachorro',...p}});
test('aclarar una variante comercial pasa a validación con marca y peso, sin carrito ni nueva recomendación',()=>{
 const estado={carrito:[{referencia:'OTRA SALMON',cantidad:2}],recomendacionActiva:{actualizadoEn:new Date().toISOString(),criterios:{marca:'NUBE',especie:'gato',categoria:'comida'}}};
 const antes=JSON.stringify(estado);
 const decision={...d({marca:null,etapa:null,sabores:['salmón'],presentacion:'un kilo'}),seguimientoProducto:'aclaracion'};
 const r=service.concretarRecomendacion(decision,estado,'el de salmón, un kilo');
 assert.equal(r.consultaCatalogo.tipo,'referencia');assert.equal(r.producto.marca,'NUBE');assert.equal(r.producto.presentacion,'1kg');
 assert.match(r._consultaContinuada,/NUBE gato salmón 1kg/);assert.equal(r.accion,'consultar');assert.equal(JSON.stringify(estado),antes);
 for(const cambio of [{seguimientoProducto:'nueva'},{accion:'agregar'},{producto:{marca:null,especie:'perro'}}]){
  const d2={...decision,...cambio};assert.equal(service.concretarRecomendacion(d2,estado,'otra'),d2);
 }
});
const ref=(id,extra={})=>({nombre:'NUBE CRIA '+id,especie:'gato',etapa:'cachorro',categoria:'comida',subcategoria:'concentrado',
 metadata:{id},presentaciones:[{peso:'500gr',precio:15000,stock:null}],...extra});
const catalogo=[{marca:'NUBE',referencias:[ref('good'),ref('adult',{etapa:'adulto'}),ref('dog',{especie:'perro'}),
 ref('snack',{categoria:'snack'}),ref('unknown',{etapa:null}),ref('uncertain',{requiereConfirmacion:true}),
 ref('no-price',{presentaciones:[{peso:'1kg',precio:null}]}),ref('no-stock',{presentaciones:[{peso:'1kg',precio:10000,stock:false}]}),
 ref('expensive',{presentaciones:[{peso:'1kg',precio:50000}]}),ref('unscoped',{metadata:{}})]}];
test('descubrimiento semántico nunca sustituye referencia concreta, compra ni solicitudes múltiples',()=>{
 assert.ok(service.esExploracion(d()));
 for(const decision of [d({referencia:'NUBE CRIA'}),{...d(),accion:'agregar'},{...d(),productos:[{},{}]},
  d({}, {tipo:'referencia'})]) assert.equal(service.esExploracion(decision),false);
});
test('recomendación conserva redacción contextual aunque el perfil inicial sea búsqueda de producto',()=>{
 assert.equal(omitirHumanizadorProducto('Opciones verificadas',{clasificacion:{perfilContexto:'producto',recomendacionCatalogo:true}}),false);
});
test('compatibilidad estricta: especie, etapa, categoría, presupuesto, precio y stock verificados',()=>{
 const opciones=service.opcionesVerificables(catalogo,service.criteriosNecesidad(d({}, {presupuestoMaximo:20000})));
 assert.deepEqual(opciones.map(o=>o.id),['good']);
 assert.equal(service.opcionesVerificables(catalogo,service.criteriosNecesidad(d({presentacion:'3kg'}))).length,0);
});
test('consulta de referencia registrada con stock desconocido no afirma existencias ni cambia carrito',()=>{
 const state=crearEstadoInicial();
 const cat=[{marca:'NUBE',referencias:[ref('CRIA',{nombre:'NUBE CRIA'})]}];
 const decision={...d({marca:'NUBE',referencia:'NUBE CRIA',presentacion:'500gr'}),intencion:'consulta_producto',confianza:1,productos:[],entrega:{},datosCliente:{},carrito:{operacion:null}};
 const reply=resolverConsultaCatalogo('precio NUBE CRIA 500gr',state,cat,decision);
 assert.match(reply,/15\.000/);
 assert.match(reply,/Las existencias están por confirmar\./);
 assert.doesNotMatch(reply,/está disponible|Claro, lo tenemos/);
 assert.equal(state.carrito.length,0);
});
test('selector no puede inventar ID ni atributos ni repetir opciones',()=>{
 const candidates=service.opcionesVerificables(catalogo,service.criteriosNecesidad(d()));
 assert.deepEqual(service.validarSeleccion({recomendaciones:[{id:'other',evidencia:['gato']},{id:'good',evidencia:['cura enfermedades']}]},candidates),[]);
 assert.equal(service.validarSeleccion({recomendaciones:[{id:'good',evidencia:['NUBE CRIA good','cachorro']},{id:'good',evidencia:['gato']}]},candidates).length,1);
 assert.equal(service.validarSeleccion({recomendaciones:[{id:'good',evidencia:['"especie":"gato"','"etapa":"cachorro"']}]},candidates).length,1);
 assert.equal(service.validarSeleccion({recomendaciones:[{id:'good',evidencia:['gato']}]},candidates,{tamano:'pequeno'}).length,0);
});
function load({fail=false,selection=null}={}){
 const file=require.resolve('../src/services/catalogRecommendationService'),req=createRequire(file),mod={exports:{}};let searches=[];
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,AbortSignal,require:n=>n==='../repositories/productRepository'
  ? {explorarProductosCatalogoCliente:async(c,p)=>{searches.push({c,p});if(fail)throw Error('timeout');return {catalogo};}}
  : n==='./aiInterpreter' ? {interpretarMensajeCliente:async()=>selection || {recomendaciones:[{id:'good',evidencia:['NUBE CRIA good']}]}}
  :req(n)});
 return {service:mod.exports,searches};
}
test('estado conserva carrito, checkout y atención humana; necesidad nueva no hereda atributos',async()=>{
 const x=load(),state={carrito:[{referencia:'PREVIA',cantidad:2}],esperandoConfirmacionPedido:true,atencionHumana:{estado:'pendiente',motivo:'criterio_veterinario'},
  recomendacionActiva:{criterios:{especie:'perro',marca:'ANTERIOR',presupuestoMaximo:10}},aclaracionIdentidad:{intentos:2}};
 const protectedState=JSON.stringify([state.carrito,state.esperandoConfirmacionPedido,state.atencionHumana]);
 const result=await x.service.recomendarDesdeCatalogo({decision:d(),mensaje:'necesidad',estado:state,cliente:{id:'a'},vertical:{key:'petshop'}});
 assert.equal(result.opciones[0].id,'good');assert.match(result.respuesta,/15\.000/);
 assert.equal(JSON.stringify([state.carrito,state.esperandoConfirmacionPedido,state.atencionHumana]),protectedState);
 assert.equal(state.recomendacionActiva.criterios.marca,null);assert.equal(state.recomendacionActiva.criterios.presupuestoMaximo,null);
 assert.equal(state.aclaracionIdentidad,null);assert.equal(x.searches[0].c.id,'a');
});
test('solo pregunta el atributo decisivo faltante; no busca ni afirma ausencia tras fallo técnico',async()=>{
 const x=load();const result=await x.service.recomendarDesdeCatalogo({decision:d({especie:null}),mensaje:'comida',estado:{},cliente:{id:'b'}});
 assert.equal(x.searches.length,0);assert.equal(result.motivo,'atributo_faltante');
 const failing=load({fail:true});const failed=await failing.service.recomendarDesdeCatalogo({decision:d(),estado:{},cliente:{id:'a'}});
 assert.equal(failed.motivo,'error_catalogo');assert.doesNotMatch(failed.respuesta,/no existe|nombre completo/i);
});
test('repositorio explora por atributos y tenant con límite y cancelación, sin escritura ni búsqueda literal',async()=>{
 const file=require.resolve('../src/repositories/productRepository'),req=createRequire(file),mod={exports:{}};const calls=[];
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,require:n=>n==='./supabaseClient'?{
  supabaseConfigurado:()=>true,requestSupabase:async(p,o)=>{calls.push({p,o});return [];}}:req(n),process,console,__dirname:require('node:path').dirname(file),URLSearchParams});
 const signal=AbortSignal.timeout(1000);
 await mod.exports.explorarProductosCatalogoCliente({id:'tenant-a'},{categoria:'comida',etapa:'cachorro',especie:'gato'},{signal});
 const url=new URL('https://test/'+calls[0].p);
 assert.equal(url.searchParams.get('brand.client_id'),'eq.tenant-a');assert.equal(url.searchParams.get('category'),'eq.comida');
 assert.equal(url.searchParams.get('life_stage'),'eq.cachorro');assert.equal(url.searchParams.get('limit'),'121');assert.equal(calls[0].o.signal,signal);
 assert.equal(calls[0].o.method,undefined);assert.equal(calls.length,1);
 await assert.rejects(mod.exports.explorarProductosCatalogoCliente(null,{}));
});
