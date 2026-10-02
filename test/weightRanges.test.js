const test=require('node:test'),assert=require('node:assert/strict');
const { normalizarPeso,extraerPesoTexto }=require('../src/utils/text');
const { presentacionesParaPeso }=require('../src/utils/weightRanges');
const { validarCoincidenciaProducto,aplicarCoincidenciaValidada }=require('../src/services/productMatchValidator');
const { resolverConsultaCatalogo }=require('../src/verticals/petshop/orderLogic');
const { crearEstadoInicial }=require('../src/conversation/conversationStore');
const clasificacion={intencion:'busqueda_producto',perfilContexto:'pedido',requiereBusquedaProducto:true};
const reales=require('../productos.json').filter(m=>m.marca==='ADVOCATE');
const sinteticos=JSON.parse(JSON.stringify(reales).replaceAll('ADVOCATE','PROTECCIONPRUEBA'));
test('rangos conservan separadores y unidades en ambos extremos',()=>{
  for(const t of ['10-25kg','10–25 kg','10 a 25kl','10kg a 25kg']) assert.equal(normalizarPeso(t),'10-25kg');
  assert.equal(extraerPesoTexto('para un perro de 23kl'),'23kg');
  assert.equal(extraerPesoTexto('de 1,4kg a 2,8kg'),'1.4-2.8kg');
  assert.equal(extraerPesoTexto('Advocate 10-25kg'),'10-25kg');
});
for(const catalogo of [reales,sinteticos])test(`identifica por rango sin excepciones de marca: ${catalogo[0].marca}`,()=>{
  const marca=catalogo[0].marca;
  for(const [texto,peso,precio] of [['perro de 10kl','10-25kg',64900],['perro de 23kl','10-25kg',64900],['perro de 28kg','25-40kg',71500],['10-25kg','10-25kg',64900]]) {
    const mensaje=`${marca} pipeta ${texto}`;
    const interpretacion={intencion:'consulta_producto',accion:'consultar',confianza:1,producto:{marca,referencia:`${marca} PERRO PIPETA`,cantidad:1}};
    const v=validarCoincidenciaProducto({mensaje,catalogo,clasificacion,interpretacion});
    assert.equal(v.nivel,'alta',JSON.stringify(v));assert.equal(v.presentacionSolicitada,peso);assert.equal(v.coincidencia.referencia,marca);
    const estado=crearEstadoInicial();const r=resolverConsultaCatalogo(mensaje,estado,catalogo,aplicarCoincidenciaValidada(interpretacion,v));
    assert.equal(estado.productosConsultados[0]?.precio,precio,JSON.stringify({r,estado}));assert.equal(estado.carrito.length,0);
  }
});
test('peso ausente, limite compartido y peso fuera de cobertura piden aclaracion',()=>{
  for(const [texto,motivo] of [['pipeta','falta_peso_mascota'],['perro de 25kg','limite_peso_ambiguo'],['perro 50kg','peso_fuera_de_rangos']]){
    const r=validarCoincidenciaProducto({mensaje:`ADVOCATE ${texto}`,catalogo:reales,clasificacion});
    assert.equal(r.nivel,'media');assert.equal(r.razon,motivo);assert.equal(r.aclaracion.campo,'peso_mascota');
  }
  const r=validarCoincidenciaProducto({mensaje:'ADVOCATE GATO de 5kg',catalogo:reales,clasificacion});
  assert.equal(r.coincidencia?.referencia,'ADVOCATE GATO');assert.equal(r.presentacionSolicitada,'4-8kg');
});
test('rangos no convierten peso de bolsas ni concentraciones en dosis',()=>{
  const comida={nombre:'COMIDA',categoria:'comida',presentaciones:[{peso:'10-25kg',precio:100}]};
  assert.deepEqual(presentacionesParaPeso(comida,'23kg'),[]);
  const medicina={nombre:'PROTECCION 11KG A 22KG',categoria:'medicamento',presentaciones:[{peso:'450mg',precio:54000}]};
  assert.equal(presentacionesParaPeso(medicina,'18kg')[0]?.peso,'450mg');
});

test('el descriptor extraído por la IA no se interpreta como peso ni elimina la aclaración',()=>{
 const r=validarCoincidenciaProducto({mensaje:'ADVOCATE pipeta',catalogo:reales,clasificacion,
  interpretacion:{confianza:1,producto:{marca:'ADVOCATE',referencia:'ADVOCATE',presentacion:'pipeta'}}});
 assert.equal(r.aclaracion?.campo,'peso_mascota');assert.equal(r.presentacionSolicitada,null);
});

test('la selección de rangos utiliza las presentaciones de distintas familias del catálogo',()=>{
 const catalogo=require('../productos.json');
 for(const [marca,peso,rango] of [['BRAVECTO','18kg','10-20kg'],['CREDELIO','18kg','11-22kg'],['NEXGARD','23kg','10-25kg'],['SIMPARICA','28kg','20-40kg']]){
  const ref=catalogo.find(m=>m.marca===marca).referencias.find(r=>r.nombre===marca && r.categoria==='medicamento');
  const opciones=presentacionesParaPeso(ref,peso);
  assert.equal(opciones.length,1);assert.equal(normalizarPeso(opciones[0].peso),rango);
 }
});
