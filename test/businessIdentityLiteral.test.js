const test=require('node:test');
const assert=require('node:assert/strict');
const {validarCoincidenciaProducto:validate}=require('../src/services/productMatchValidator');
const cls={intencion:'busqueda_producto',perfilContexto:'producto',requiereBusquedaProducto:true};
// Synthetic controls; commercial cases live in the separately attributed fixture.
const medicine=[{marca:'CALMA',referencias:['D','F','PUPPY'].map(code=>({nombre:`CALMA ${code}`,categoria:'medicamento',presentaciones:[{peso:'5ml',precio:1}]}))}];
const food=[{marca:'LUNA PLAN',referencias:[
 {nombre:'LUNA PLAN FELINE EN',especie:'gato',categoria:'comida',subcategoria:'concentrado',presentaciones:[{peso:'1.5kg',precio:1}]},
 {nombre:'LUNA PLAN FELINE LATA EN',especie:'gato',categoria:'comida',subcategoria:'comida_humeda',presentaciones:[{peso:'85g',precio:1}]},
 {nombre:'LUNA PLAN CANINE EN',especie:'perro',categoria:'comida',subcategoria:'concentrado',presentaciones:[{peso:'2kg',precio:1}]}
]}];
const run=(q,c)=>validate({mensaje:q,catalogo:c,clasificacion:cls});
test('literal single-letter catalog variant precedes brand/pack shortcut',()=>{
 for(const code of ['D','F']) {const r=run(`Calma ${code} de 5ml`,medicine);assert.equal(r.nivel,'alta');assert.equal(r.coincidencia.referencia,`CALMA ${code}`);}
 assert.notEqual(run('Calma de 5ml',medicine).nivel,'alta');
});
test('full named reference survives surrounding request prose and quantity',()=>{
 const r=run('Me podrías enviar tres paquetes del contrato de concentrado Luna Plan feline EN',food);
 assert.equal(r.nivel,'alta');assert.equal(r.coincidencia.referencia,'LUNA PLAN FELINE EN');assert.equal(r.presentacionSolicitada,null);
});
test('explicit literal reference cannot override requested species or incompatible code',()=>{
 for(const q of ['Luna Plan FELINE EN para perro','Luna Plan feline EN UR']) assert.notEqual(run(q,food).nivel,'alta');
});
test('incompatible bulk weight cannot silently establish unrequested wet format',()=>{
 const c=[{marca:'LUNA PLAN',referencias:[{nombre:'LUNA PLAN DOG LATA GASTRO',especie:'perro',categoria:'comida',subcategoria:'comida_humeda',presentaciones:[{peso:'385g',precio:1}]}]}];
 const r=run('Luna Plan perro gastrointestinal de 7 kilos',c);assert.notEqual(r.nivel,'alta');assert.equal(r.coincidencia,null);
 const explicit=run('Luna Plan dog lata gastro 385g',c);assert.equal(explicit.nivel,'alta');assert.equal(explicit.presentacionValida,true);
});
test('literal identity preserves unavailable-pack validation and tenant isolation',()=>{
 const before=JSON.stringify(medicine);
 const r=run('Calma D de 99ml',medicine);assert.equal(r.presentacionValida,false);
 assert.notEqual(run('Calma D de 5ml',[{marca:'OTRA',referencias:[{nombre:'OTRA D',presentaciones:[{peso:'5ml',precio:1}]}]}]).nivel,'alta');
 assert.equal(JSON.stringify(medicine),before);
});
