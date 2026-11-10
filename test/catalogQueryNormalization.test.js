const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarMedidasBusqueda, corregirTokensCatalogo } = require('../src/utils/catalogQueryNormalization');
const { normalizar, extraerPesoTexto, codigosReferencia } = require('../src/utils/text');
const { validarCoincidenciaProducto, _internals:{tokensDistintivos} } = require('../src/services/productMatchValidator');
const clasificacion={intencion:'busqueda_producto',perfilContexto:'producto'};
const catalogo=[{marca:'ALBORADA',referencias:[
 {nombre:'ALBORADA INDOOR CAT',especie:'gato',categoria:'comida',presentaciones:[{peso:'500gr',precio:100}]},
 {nombre:'ALBORADA KITTEN CAT',especie:'gato',categoria:'comida',presentaciones:[{peso:'500gr',precio:200}]},
]}];
test('normaliza medidas completas en palabras sin borrar variantes ni códigos',()=>{
 for(const [input,expected] of [['medio kilo','500g'],['quinientos gramos','500g'],['dos kilos y medio','2.5kg'],
  ['un cuarto kilo','un 250g'],['medio litro','500ml'],['MIL GRAMOS','1kg'],['0,5 kg','500g'],
  ['ALBORADA MEDIO ADULTO','ALBORADA MEDIO ADULTO'],['UR 2kg','UR 2kg']])
  assert.equal(normalizarMedidasBusqueda(input),expected);
});
test('errata de variante no permite sustituirla por otra de la misma marca',()=>{
 for(const peso of ['medio kilo','500g','quinientos gramos']){
  const r=validarCoincidenciaProducto({mensaje:`alborad indor gato ${peso}`,catalogo,clasificacion});
  assert.equal(r.nivel,'alta');assert.equal(r.coincidencia.referencia,'ALBORADA INDOOR CAT');
  assert.equal(r.presentacionSolicitada,'500g');
 }
});
test('correcciones ambiguas, códigos cortos y palabras exactas no se reescriben',()=>{
 const cat=[{marca:'ALBORADA',referencias:[{nombre:'ALBORADA SALMON'},{nombre:'ALBORADA SALTON'},{nombre:'ALBORADA AB'}]}];
 const corregir=t=>corregirTokensCatalogo(t,cat,{normalizar,tokensDistintivos});
 assert.equal(corregir('salon'),'salon');
 assert.equal(corregir('SALMON XY'),'SALMON XY');
});
test('variante inexistente y código distinto no se confirman por marca/peso comunes',()=>{
 for(const mensaje of ['alborad nocturno gato medio kilo','alborad XY gato 500g','alborada ZQ88 gato 500g']){
  const r=validarCoincidenciaProducto({mensaje,catalogo,clasificacion});
  assert.notEqual(r.nivel,'alta');
 }
});
test('presentación verbal sirve a la continuidad y códigos alfanuméricos no son medidas',()=>{
 assert.equal(extraerPesoTexto('El de salmón, un kilo'),'1kg');
 assert.equal(extraerPesoTexto('el de dos kilos y medio'),'2.5kg');
 assert.deepEqual(codigosReferencia('ZQ88 x2kg 500gr'),['ZQ88']);
});
test('la misma errata se resuelve solamente contra vocabulario del catálogo recibido',()=>{
 const other=[{marca:'OTRAMARCA',referencias:[{nombre:'OTRAMARCA KITTEN CAT',especie:'gato',presentaciones:[{peso:'500g',precio:300}]}]}];
 assert.equal(corregirTokensCatalogo('alborad indor',other,{normalizar,tokensDistintivos}),'alborad indor');
 assert.notEqual(validarCoincidenciaProducto({mensaje:'alborad indor gato medio kilo',catalogo:other,clasificacion}).nivel,'alta');
});
