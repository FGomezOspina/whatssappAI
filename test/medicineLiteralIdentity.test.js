const test=require('node:test'),assert=require('node:assert/strict');
const {validarCoincidenciaProducto:validate}=require('../src/services/productMatchValidator');
const cl={intencion:'busqueda_producto',perfilContexto:'producto'};
const catalog=[{marca:'DERMONOVA',referencias:[{nombre:'DERMONOVA',categoria:'medicamento',presentaciones:[{peso:'50ml',precio:1}]}]},{marca:'DERMOLUNA',referencias:[{nombre:'DERMOLUNA SPRAY',categoria:'medicamento',presentaciones:[{peso:'30ml',precio:1}]}]}];
const run=(message,c=catalog)=>validate({mensaje:message,catalogo:c,clasificacion:cl});
test('a skin-related exact brand cannot turn into a different skin-related brand',()=>{
 const r=run('DERMONOVA spray');assert.notEqual(r.nivel,'alta');assert.deepEqual(r.alternativas.map(x=>x.referencia),['DERMONOVA']);
});
test('missing pharmaceutical form retains the literal candidate for verification',()=>{
 const r=run('DERMONOVA crema');assert.equal(r.razon,'forma_farmaceutica_por_confirmar');assert.equal(r.coincidencia,null);assert.equal(r.aclaracion.campo,'referencia');
});
test('catalog-supported spray retains normal identity matching',()=>{
 const r=run('DERMOLUNA SPRAY');assert.equal(r.nivel,'alta');assert.equal(r.coincidencia.referencia,'DERMOLUNA SPRAY');
});
test('a bare family must not trigger clarification when its requested form is cataloged',()=>{
 const c=[{marca:'DERMONOVA',referencias:[{nombre:'DERMONOVA',categoria:'medicamento',presentaciones:[{peso:'unidad',precio:1}]},{nombre:'DERMONOVA SPRAY',categoria:'medicamento',presentaciones:[{peso:'30ml',precio:1}]}]}];
 const r=run('DERMONOVA SPRAY',c);assert.equal(r.nivel,'alta');assert.equal(r.coincidencia.referencia,'DERMONOVA SPRAY');
});
test('missing form must not erase an additional unknown commercial variant',()=>{
 const r=run('DERMONOVA crema EXTRA');assert.notEqual(r.nivel,'alta');assert.notEqual(r.razon,'forma_farmaceutica_por_confirmar');
});
test('medicine clarification does not enable a food or species conflict',()=>{
 assert.notEqual(run('DERMONOVA comida crema').nivel,'alta');
 const c=[{marca:'DERMONOVA',referencias:[{nombre:'DERMONOVA',categoria:'medicamento',especie:'perro',presentaciones:[{peso:'50ml',precio:1}]}]}];
 assert.notEqual(run('DERMONOVA gato crema',c).razon,'forma_farmaceutica_por_confirmar');
});
