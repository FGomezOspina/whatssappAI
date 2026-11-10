const test=require('node:test'),assert=require('node:assert/strict');
const {consolidarCatalogo}=require('../src/services/catalogConsolidationService');
const {validarCoincidenciaProducto:validar}=require('../src/services/productMatchValidator');
const make=(n,weight='1.5kg')=>({nombre:`NUTRILINE CAT URINARY ${n}`,especie:'gato',categoria:'comida',subcategoria:'concentrado',metadata:{id:`ref-${n}`},presentaciones:[{peso:weight,precio:100,metadata:{id:`pack-${n}-${weight}`}}]});
const catalogo=()=>consolidarCatalogo([{marca:'NUTRILINE',referencias:[make(1),make(2),make(3)]}]);
const run=(mensaje,catalog=catalogo())=>validar({mensaje,catalogo:catalog,clasificacion:{intencion:'busqueda_producto',perfilContexto:'producto'}});
test('commercial line numbers remain distinct despite identical size, species and price',()=>{
 assert.equal(catalogo()[0].referencias.length,3);
 for(const n of [1,2,3]){const r=run(`NUTRILINE CAT URINARY ${n} 1.5kg`);assert.equal(r.nivel,'alta');assert.equal(r.coincidencia.referencia,`NUTRILINE CAT URINARY ${n}`);assert.equal(r.coincidencia.presentaciones[0].metadata.id,`pack-${n}-1.5kg`);}
});
test('order quantity does not replace the product variant and unknown variant abstains',()=>{
 assert.equal(run('Dame 3 NUTRILINE CAT URINARY 2 1.5kg').coincidencia.referencia,'NUTRILINE CAT URINARY 2');
 assert.notEqual(run('NUTRILINE CAT URINARY 4 1.5kg').nivel,'alta');
 assert.notEqual(run('NUTRILINE CAT URINARY 1.5kg').nivel,'alta');
});
test('a size change can consolidate within the same numbered line',()=>{
 const c=consolidarCatalogo([{marca:'NUTRILINE',referencias:[make(2),make(2,'3kg')]}]);
 assert.equal(c[0].referencias.length,1);assert.equal(c[0].referencias[0].presentaciones.length,2);
 assert.equal(run('NUTRILINE CAT URINARY 2 3kg',c).presentacionValida,true);
});
test('declared equivalence cannot erase conflicting numerical identity',()=>{
 const a=make(1),b=make(2);a.metadata.equivalent_references=[b.nombre];
 assert.equal(consolidarCatalogo([{marca:'NUTRILINE',referencias:[a,b]}])[0].referencias.length,2);
});
