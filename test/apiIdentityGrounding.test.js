const test=require('node:test'),assert=require('node:assert/strict');
const {validarCoincidenciaProducto:validate,respuestaValidacionProducto:reply}=require('../src/services/productMatchValidator');
const cl={intencion:'busqueda_producto',perfilContexto:'producto',requiereBusquedaProducto:true};
const medicine=weight=>[{marca:'RENOVET',referencias:[{nombre:'RENOVET',categoria:'medicamento',presentaciones:[{peso:weight,precio:1}]}]}];
const food=[{marca:'NUTRALUNA',referencias:[{nombre:'NUTRALUNA GASTROINTESTINAL PERRO',categoria:'comida',subcategoria:'concentrado',especie:'perro',presentaciones:[{peso:'2kg',precio:1}]}]}];
const run=(mensaje,catalogo,interpretacion)=>validate({mensaje,catalogo,interpretacion,clasificacion:cl});
for(const count of [30,60,90])test(`pack x${count} cannot silently become an individual tablet`,()=>{
 const text=`A como tienes el renovet x${count}`;
 for(const interpretation of [null,{accion:'consultar',producto:{marca:'RENOVET',referencia:'RENOVET',textoVisible:`renovet x${count}`,presentacion:`x${count}`}}]){
  const r=run(text,medicine('tableta'),interpretation);assert.notEqual(r.nivel,'alta');assert.equal(r.presentacionSolicitada,`x${count}`);assert.equal(r.presentacionValida,false);
 }
});
test('cataloged pack count can be confirmed without turning it into order quantity',()=>{
 const r=run('renovet x60',medicine('x60'));assert.equal(r.nivel,'alta');assert.equal(r.presentacionValida,true);
});
test('x before a measured size remains a weight, not an item count',()=>{
 const r=run('renovet x 60 ml',medicine('60ml'));assert.equal(r.presentacionSolicitada,'60ml');assert.equal(r.presentacionValida,true);
});
for(const text of ['hola tienes novalux gastrointestinal para perro','novalux gastrointestinal perro'])test(`model substitution cannot erase the requested brand: ${text}`,()=>{
 const r=run(text,food,{accion:'consultar',confianza:.99,producto:{marca:'NUTRALUNA',referencia:'GASTROINTESTINAL',textoVisible:text.replace('hola tienes ',''),especie:'perro',categoria:'comida',subcategoria:'concentrado'}});
 assert.notEqual(r.nivel,'alta');assert.equal(r.coincidencia,null);
});
test('supported interpretation still confirms the catalog identity',()=>{
 const r=run('hola tienes nutraluna gastrointestinal para perro',food,{accion:'consultar',confianza:.99,producto:{marca:'NUTRALUNA',referencia:'GASTROINTESTINAL',textoVisible:'nutraluna gastrointestinal para perro',especie:'perro'}});assert.equal(r.nivel,'alta');
});
test('semantic extraction cannot erase an unknown brand or rely on a hallucinated list item',()=>{
 const r=run('muy buena tarde cómo estas?, tienes Novalux Gastrointestinal para perro?',food,{accion:'consultar',producto:{marca:null,referencia:'GASTROINTESTINAL',textoVisible:'gastrointestinal para perro',especie:'perro'},productos:[{marca:'NUTRALUNA',referencia:'NUTRALUNA GASTROINTESTINAL PERRO',presentacion:'2kg'}]});assert.notEqual(r.nivel,'alta');
});
test('a preserved unknown commercial word also survives model compression with a null brand',()=>{
 const r=run('hola tienes novalux gastrointestinal perro',food,{accion:'consultar',producto:{marca:null,referencia:'GASTROINTESTINAL',textoVisible:'novalux gastrointestinal perro',especie:'perro'}});assert.notEqual(r.nivel,'alta');
});
test('a count contained in the verified catalog name remains commercial identity, not an invented pack',()=>{
 const catalog=[{marca:'NUBE',referencias:[{nombre:'NUBE CARNE X 17 PAG',categoria:'comida',presentaciones:[{peso:'unidad',precio:1}]}]}];
 const r=run('NUBE CARNE X 17 PAG',catalog);assert.equal(r.nivel,'alta');assert.equal(r.coincidencia.referencia,'NUBE CARNE X 17 PAG');assert.equal(r.presentacionSolicitada,null);assert.equal(r.presentacionValida,null);
});
test('pack clarification preserves the requested count and does not offer a single tablet as confirmed',async()=>{
 const facts=run('A como tienes renovet x60',medicine('tableta'),{accion:'consultar',producto:{marca:'RENOVET',textoVisible:'renovet x60',presentacion:'x60'}});
 let usage;const text=await require('../src/services/humanizer').humanizarRespuesta('renovet x60','una tableta',{productoAutonomo:facts,onUsage:r=>usage=r});assert.match(text,/60 unidades/);assert.match(text,/empaque cerrado/);assert.doesNotMatch(text,/presentación validada.*tableta/i);assert.equal(usage.reason,'aclaracion_empaque_sin_verificar');
});
