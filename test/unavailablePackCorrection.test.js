const test=require('node:test');
const assert=require('node:assert/strict');
const {continuarSolicitudProducto}=require('../src/services/conversationService')._internals;
const {validarCoincidenciaProducto}=require('../src/services/productMatchValidator');
function setup(){
 const producto={marca:'NOVA',referencia:'DIGEST',especie:'perro',categoria:'comida',subcategoria:'concentrado',presentacion:'7kg'};
 const state={ultimaConsultaProducto:{nivel:'baja',razon:'sin_coincidencia_confiable',creadoEn:new Date().toISOString(),
  terminos:['nova','digest','perro'],etiqueta:'nova digest perro',presentacion:'7kg',aclaracion:null,sinCoincidenciaInformada:true,
  solicitudOriginal:{intencion:'consulta_producto',accion:'consultar',producto}}};
 const decision={intencion:'consulta_producto',accion:'consultar',seguimientoProducto:'aclaracion',confianza:.98,
  producto:{...producto,presentacion:'2kg',textoVisible:'mismo concentrado para perro de 2 kg'}};
 return {state,decision};
}
test('una presentación no disponible conserva identidad al corregir solo peso, sin menú pendiente',()=>{
 const {state,decision}=setup();const r=continuarSolicitudProducto(decision,state,'Corrijo el tamaño: de 2 kg, el mismo concentrado para perro. Solo consultar el precio.');
 assert.match(r._consultaContinuada,/NOVA DIGEST/);assert.equal(r.producto.presentacion,'2kg');assert.equal(r.accion,'consultar');
 assert.equal(state.ultimaConsultaProducto.presentacion,'7kg');
 const catalogo=[{marca:'NOVA',referencias:[{nombre:'NOVA DIGEST',especie:'perro',categoria:'comida',subcategoria:'concentrado',presentaciones:[{peso:'2kg',precio:100}]}]}];
 const v=validarCoincidenciaProducto({mensaje:r._consultaContinuada,interpretacion:r,catalogo,clasificacion:{perfilContexto:'producto',intencion:'busqueda_producto'}});
 assert.equal(v.nivel,'alta');
});
test('no recupera identidad para marca distinta, nueva consulta, contexto vencido o formato incompatible',()=>{
 for(const change of [d=>d.producto.marca='OTRA',d=>d.seguimientoProducto='nueva',d=>d.producto.subcategoria='comida_humeda',d=>d.confianza=.2]){
  const {state,decision}=setup();change(decision);assert.equal(continuarSolicitudProducto(decision,state,'Corrijo a 2 kg'),decision);
 }
 const {state,decision}=setup();state.ultimaConsultaProducto.creadoEn='2020-01-01';assert.equal(continuarSolicitudProducto(decision,state,'Corrijo a 2 kg'),decision);
});
test('la corrección larga de peso conserva también una referencia validada en una consulta',()=>{
 const {state,decision}=setup();state.ultimaConsultaProducto.nivel='alta';
 const r=continuarSolicitudProducto(decision,state,'Corrijo el tamaño: de 2 kg, el mismo concentrado para perro. Solo consultar el precio.');
 assert.match(r._consultaContinuada,/NOVA DIGEST/);assert.equal(r.producto.presentacion,'2kg');assert.equal(r.accion,'consultar');
});
test('marcas con espacios distintos permiten hallar la línea, sin inventar presentación ni cruzar especie/formato',()=>{
 const catalogo=[{marca:'NOVA PET',referencias:[{nombre:'NOVA PET LATA DIGEST',especie:'perro',categoria:'comida',subcategoria:'comida_humeda',presentaciones:[{peso:'unidad',precio:10}]}]},
 {marca:'NOVAPET',referencias:[{nombre:'NOVAPET DIGEST PERRO',especie:'perro',categoria:'comida',subcategoria:'concentrado',presentaciones:[{peso:'2kg',precio:20}]}]}];
 const run=(mensaje,marca=null)=>validarCoincidenciaProducto({mensaje,catalogo,interpretacion:marca?{producto:{marca,referencia:'DIGEST',especie:'perro'}}:null,clasificacion:{perfilContexto:'producto',intencion:'busqueda_producto'}});
 const found=run('Nova Pet Digest perro concentrado 2kg');assert.equal(found.nivel,'alta');assert.equal(found.coincidencia.referencia,'NOVAPET DIGEST PERRO');assert.equal(found.presentacionValida,true);
 const absent=run('Nova Pet Digest perro concentrado 7kg');assert.equal(absent.presentacionValida,false);
 assert.notEqual(run('Nova Pet Digest gato concentrado 2kg').nivel,'alta');
 // "Otra" alone is also ordinary Spanish prose; provide the same explicit
 // brand evidence the interpreter supplies when it is a commercial name.
 assert.notEqual(run('Otra Pet Digest perro concentrado 2kg','OTRA PET').nivel,'alta');
});
test('consulta cambia formato por contexto; cantidad posterior conserva el formato y peso',()=>{
 const {state,decision}=setup();state.ultimaConsultaProducto.nivel='alta';state.ultimaConsultaProducto.solicitudOriginal.producto.referencia='NOVA DIGEST PERRO';
 decision.producto.referencia='DIGEST';decision.producto.subcategoria='comida_humeda';decision.producto.envase='lata';decision.producto.presentacion=null;
 const r=continuarSolicitudProducto(decision,state,'Ahora cotízame la lata de esa misma línea para perro. Solo consulta.');
 assert.match(r._consultaContinuada,/NOVA DIGEST PERRO/);assert.equal(r.producto.envase,'lata');assert.equal(r.producto.presentacion,null);
 const s=setup();s.state.ultimaConsultaProducto.nivel='alta';s.decision.producto.cantidad=3;
 s.decision.producto.presentacion=null;
 const qty=continuarSolicitudProducto(s.decision,s.state,'Ahora serían tres del mismo concentrado, solo cotización');
 assert.equal(qty.producto.cantidad,3);assert.equal(qty.producto.presentacion,'7kg');assert.equal(qty.accion,'consultar');
});
test('redactor no puede asociar el peso solicitado a un candidato que solo registra otro peso',()=>{
 const {conservaPresentacionCandidato}=require('../src/services/humanizer')._internals;
 const candidatos=[{referencia:'NOVA DIGEST',presentaciones:[{peso:'1kg'},{peso:'2.2kg'}]}];
 assert.equal(conservaPresentacionCandidato('¿Te refieres a NOVA DIGEST en 2 kg?',candidatos),false);
 assert.equal(conservaPresentacionCandidato('¿Te refieres a NOVA DIGEST de 2.2 kg?',candidatos),true);
 assert.equal(conservaPresentacionCandidato('¿Cuál referencia necesitas?',candidatos),true);
});
test('segmentación literal no pierde atributos aportados en mensajes consecutivos',()=>{
 const {mencionProductoRespaldada}=require('../src/services/conversationService')._internals;
 for(const suffix of ['el concentrado de 2 kg','en lata','el sobre de 85 gramos','de 3 kg']) {
  const producto={mencionOriginal:'NOVA DIGEST para perro'};
  assert.equal(mencionProductoRespaldada(producto,`Solo consultar: NOVA DIGEST para perro\n${suffix}`),null);
 }
 assert.equal(mencionProductoRespaldada({textoVisible:'NOVA DIGEST concentrado 2kg'},'Cotízame NOVA DIGEST concentrado 2kg por favor'),'NOVA DIGEST concentrado 2kg');
});
test('anáfora explícita sobrevive a etiqueta nueva del router sin aceptar otra identidad',()=>{
 const {state,decision}=setup();state.ultimaConsultaProducto.nivel='alta';state.ultimaConsultaProducto.solicitudOriginal.producto.presentacionesEquivalentes=[{peso:'7kg',precio:100}];decision.seguimientoProducto='nueva';decision.producto.subcategoria='comida_humeda';decision.producto.envase='lata';decision.producto.presentacion=null;
 const mensaje='Ahora cotízame la lata de esa misma línea para perro. Solo consulta.';
 const continued=continuarSolicitudProducto(decision,state,mensaje);assert.match(continued._consultaContinuada,/NOVA DIGEST/);assert.equal(continued.producto.presentacionesEquivalentes,undefined);
 decision.producto.marca='OTRA';assert.equal(continuarSolicitudProducto(decision,state,mensaje),decision);
});
test('corrección contextual puede omitir marca sin perder la línea ni aceptar otra',()=>{
 const {state,decision}=setup();state.ultimaConsultaProducto.nivel='alta';decision.producto.marca=null;decision.producto.subcategoria='comida_humeda';decision.producto.envase='lata';decision.producto.presentacion=null;
 const mensaje='Ahora la lata de esa misma línea, solo consulta';
 assert.equal(continuarSolicitudProducto(decision,state,mensaje).producto.marca,'NOVA');
 decision.producto.referencia='OTRA LINEA';assert.equal(continuarSolicitudProducto(decision,state,mensaje),decision);
 decision.producto.referencia='DIGEST';decision.producto.marca='OTRA';assert.equal(continuarSolicitudProducto(decision,state,mensaje),decision);
});
