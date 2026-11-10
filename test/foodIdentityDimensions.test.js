const test=require('node:test'),assert=require('node:assert/strict');
const {dimensionesAlimento:d,dimensionesReferencia:dr}=require('../src/utils/foodFormat');
const {validarCoincidenciaProducto:v,construirConsultaProductoContextual:context,respuestaValidacionProducto:reply}=require('../src/services/productMatchValidator');
const refs=[['NUBE GATO ADULTO','concentrado','1kg'],['NUBE LATA GATO ADULTO','comida_humeda','85g'],['NUBE POUCH GATO ADULTO','comida_humeda','85g']].map(([nombre,subcategoria,peso])=>({nombre,subcategoria,categoria:'comida',especie:'gato',presentaciones:[{peso,precio:100}]}));
const cat=[{marca:'NUBE',referencias:refs}],cl={intencion:'busqueda_producto',perfilContexto:'producto',requiereBusquedaProducto:true};
const run=(mensaje,extra={})=>v({mensaje,catalogo:cat,clasificacion:cl,...extra});
const ctx=(forma,envase,extra={})=>({creadoEn:new Date().toISOString(),nivel:'alta',terminos:['nube','gato','adulto'],formaAlimento:forma,envaseAlimento:envase,presentacion:'85g',...extra});
test('food form and container remain distinct; weight and bags imply neither',()=>{
 assert.equal(d('7 kilos en bolsa').forma,null);assert.equal(d('sobre').forma,'comida_humeda');assert.equal(d('lata').envase,'lata');assert.equal(d('comida húmeda').envase,null);
 assert.deepEqual(dr({nombre:'MEDICINA SOBRES',categoria:'medicamento'}),{forma:null,envase:null});
});
test('requested dry food, pouch and can exclude each other even at shared weights',()=>{
 for(const [q,name] of [['concentrado Nube gato adulto','NUBE GATO ADULTO'],['sobre Nube gato adulto 85g','NUBE POUCH GATO ADULTO'],['lata Nube gato adulto 85g','NUBE LATA GATO ADULTO']]){
 const r=run(q);assert.equal(r.nivel,'alta',q);assert.equal(r.coincidencia.referencia,name,q);}
});
test('shared identity without food form asks a useful clarification',()=>{
 const r=run('Nube gato adulto');assert.equal(r.nivel,'media');assert.equal(r.aclaracion.campo,'forma_alimento');assert.match(reply(r),/seco.*húmeda/);
});
test('wet food without container retains both can and pouch',()=>{
 const r=run('comida húmeda Nube gato adulto');assert.equal(r.nivel,'media');assert.equal(r.aclaracion.campo,'envase_alimento');assert.match(reply(r),/sobre.*lata/);assert.equal(r.alternativas.length,2);
});
test('weight clarification inherits verified container and never turns it into dry',()=>{
 const r=run('85g',{contextoProducto:ctx('comida_humeda','sobre')});assert.equal(r.nivel,'alta');assert.equal(r.coincidencia.referencia,'NUBE POUCH GATO ADULTO');
});
test('explicit format corrections replace old format and clear inherited pack',()=>{
 for(const [q,name] of [['no en sobre, sino en lata','NUBE LATA GATO ADULTO'],['mejor concentrado','NUBE GATO ADULTO']]){
 const r=run(q,{contextoProducto:ctx('comida_humeda','sobre')});assert.equal(r.nivel,'alta',q);assert.equal(r.coincidencia.referencia,name);assert.equal(r.presentacionSolicitada,null);}
});
test('another named product or expired context does not inherit container',()=>{
 assert.equal(context('Otra marca gato',ctx('comida_humeda','lata')),'Otra marca gato');
 const r=run('85g',{contextoProducto:ctx('comida_humeda','lata',{creadoEn:'2000-01-01'})});assert.notEqual(r.nivel,'alta');
});
test('insufficient catalog format stays unverified',()=>{
 const r=run('sobre Nube gato adulto',{catalogo:[{marca:'NUBE',referencias:[{nombre:'NUBE GATO ADULTO',categoria:'comida',especie:'gato',presentaciones:[{peso:'85g',precio:100}]}]}]});assert.notEqual(r.nivel,'alta');assert.match(r.razon,/formato_catalogo/);
});
test('verified image evidence supplies format; explicit text can correct pictured container',()=>{
 const interpretacion={producto:{marca:'NUBE',categoria:'comida',especie:'gato',observado:{nombre:'NUBE GATO ADULTO',confianzaIdentidad:.98,formaAlimento:'comida_humeda',envase:'lata',confianzaFormato:.98}}};
 const clv={...cl,requiereVision:true};
 assert.equal(run('[imagen]',{clasificacion:clv,interpretacion}).coincidencia?.referencia,'NUBE LATA GATO ADULTO');
 assert.equal(run('lo quiero en sobre',{clasificacion:clv,interpretacion}).coincidencia?.referencia,'NUBE POUCH GATO ADULTO');
});
test('contradictory formats require clarification even with one catalog option',()=>{
 for (const q of ['Nube gato adulto seco y húmedo','Nube gato adulto lata o sobre']) {
  assert.notEqual(run(q,{catalogo:[{marca:'NUBE',referencias:[refs[1]]}]}).nivel,'alta');
 }
});
test('semantic compression and brand-weight shortcut cannot erase requested container',()=>{
 const catalogo=[{marca:'NUBE',referencias:[{nombre:'NUBE ADULTO',categoria:'comida',presentaciones:[{peso:'85g',precio:100}]}]}];
 for (const mensaje of ['3 sobres Nube adulto 85g','Nube lata 85g']) {
  const r=run(mensaje,{catalogo,interpretacion:{accion:'consultar',producto:{marca:'NUBE',textoVisible:'Nube adulto',presentacion:'85g'}}});
  assert.notEqual(r.nivel,'alta');
 }
});
test('normalized visual attributes and conversation state survive format correction without mutating old evidence',()=>{
 const {normalizarInterpretacion}=require('../src/services/aiInterpreter')._internals;
 const {continuarSolicitudProducto}=require('../src/services/conversationService')._internals;
 const observed={nombre:'NUBE GATO ADULTO',formaAlimento:'comida_humeda',envase:'sobre',confianzaFormato:.98,confianzaIdentidad:.99};
 const original=normalizarInterpretacion({intencion:'consulta_producto',accion:'consultar',producto:{marca:'NUBE',referencia:'NUBE POUCH GATO ADULTO',especie:'gato',categoria:'comida',envase:'sobre',subcategoria:'comida_humeda',presentacion:'85g',observado:observed}});
 const estado={ultimaConsultaProducto:ctx('comida_humeda','sobre',{solicitudOriginal:original})};
 const saved=JSON.stringify(estado);
 for (const [mensaje,envase,forma] of [['no en sobre, sino en lata','lata','comida_humeda'],['mejor concentrado',null,'concentrado']]) {
  const r=continuarSolicitudProducto({intencion:'consulta_producto',accion:'consultar',seguimientoProducto:'aclaracion',confianza:.99,producto:{}},estado,mensaje);
  assert.equal(r.producto.envase,envase);assert.equal(r.producto.subcategoria,forma);assert.equal(r.producto.presentacion,null);
  const resolved=run(r._consultaContinuada);assert.equal(resolved.nivel,'alta');assert.equal(resolved.envaseAlimento,envase);
 }
 assert.equal(JSON.stringify(estado),saved);assert.equal(original.producto.observado.envase,'sobre');
});
test('medicine sachets do not become wet food when interpreter category is absent',()=>{
 const catalogo=[{marca:'CALMA',referencias:[{nombre:'CALMA SOBRES',categoria:'medicamento',presentaciones:[{peso:'1g',precio:100}]}]}];
 const r=v({mensaje:'Calma sobres 1g',catalogo,clasificacion:cl});assert.equal(r.nivel,'alta');assert.equal(r.formaAlimento,null);assert.equal(r.envaseAlimento,null);
});
test('asking available sizes cannot promote an unverified food format',()=>{
 const {resolverPresentacionesIdentificadas}=require('../src/services/presentationSelectionService');
 const r=run('Nube gato adulto');const out=resolverPresentacionesIdentificadas({validacion:r,producto:{intencionPresentaciones:'todas'},mensaje:'todos los tamaños',catalogo:cat});
 assert.equal(out.nivel,'media');assert.equal(out.aclaracion.campo,'forma_alimento');
});
