const test=require('node:test'),assert=require('node:assert/strict');
const {validarCoincidenciaProducto:v}=require('../src/services/productMatchValidator');
const {dimensionesAlimento,dimensionesReferencia}=require('../src/utils/foodFormat');
const cl={intencion:'busqueda_producto',perfilContexto:'producto',requiereBusquedaProducto:true};
const run=(mensaje,catalogo)=>v({mensaje,catalogo,clasificacion:cl});
test('exact commercial name is not discarded by a category word inside its name',()=>{
 for(const [nombre,categoria] of [['SHAMPOO NUBE','medicamento'],['TRAILLA Y ARENA FLORAL','accesorio'],['COLLAR NUBE','medicamento']]){
  const c=[{marca:nombre.split(' ')[0],referencias:[{nombre,categoria,presentaciones:[{peso:'unidad',precio:1}]}]}];
  assert.equal(run(nombre,c).coincidencia?.referencia,nombre);
  assert.notEqual(run('comida '+nombre,c).nivel,'alta');
 }
});
test('dry grooming and canine abbreviation do not establish food form or can',()=>{
 assert.equal(dimensionesAlimento('CAN ADULTO').envase,null);
 assert.equal(dimensionesReferencia({nombre:'NUBE CAN ADULTO',categoria:'comida',subcategoria:'concentrado'}).forma,'concentrado');
 const c=[{marca:'NUBE',referencias:[{nombre:'NUBE BAÑO SECO PERRO',categoria:'higiene',presentaciones:[{peso:'200ml',precio:1}]}]}];
 const r=run('NUBE BAÑO SECO PERRO',c);assert.equal(r.nivel,'alta');assert.equal(r.formaAlimento,null);
});
test('commercial strength and volume are never described as animal body weight',()=>{
 for(const dose of ['16MG','0.25ML']){
  const c=[{marca:'NUBE',referencias:[{nombre:'NUBE '+dose,categoria:'medicamento',presentaciones:[{peso:'2-8kg',precio:1}]}]}];
  const r=run('NUBE '+dose,c);assert.equal(r.razon,'falta_peso_mascota');assert.equal(r.aclaracion.pesoSolicitado,null);assert.notEqual(r.nivel,'alta');
 }
});
test('manual Feline EN context reconstruction resolves dry identity without changing frozen raw case',()=>{
 const c=require('../docs/reports/real-conversations-2026-10-29/catalog.json').filter(m=>m.marca==='PRO PLAN');
 const raw='Me podrías enviar tres paquetes del contrato de proplan feline EN';
 const ambiguous=run(raw,c);assert.equal(ambiguous.aclaracion.campo,'forma_alimento');
 // Auditor reconstruction, NOT a claim that the runtime retrieved October10 history.
 const reconstructed=run('concentrado '+raw,c);assert.equal(reconstructed.nivel,'alta');assert.equal(reconstructed.coincidencia.referencia,'PRO PLAN FELINE EN');
 assert.equal(reconstructed.presentacionSolicitada,null);
});
test('catalog-declared dry food can have a can without becoming wet food',()=>{
 const c=[{marca:'NUBE',referencias:[{nombre:'NUBE COLOR LATA',categoria:'comida',subcategoria:'concentrado',presentaciones:[{peso:'unidad',precio:1}]}]}];
 const r=run('NUBE COLOR LATA',c);assert.equal(r.nivel,'alta');assert.equal(r.formaAlimento,'concentrado');assert.equal(r.envaseAlimento,'lata');
 assert.notEqual(run('comida humeda NUBE COLOR LATA',c).nivel,'alta');
});
test('explicit dry correction does not inherit a can from old visual evidence',()=>{
 const c=[{marca:'NUBE',referencias:[{nombre:'NUBE ADULTO',categoria:'comida',subcategoria:'concentrado',presentaciones:[{peso:'1kg',precio:1}]},{nombre:'NUBE LATA ADULTO',categoria:'comida',subcategoria:'comida_humeda',presentaciones:[{peso:'85g',precio:1}]}]}];
 const r=v({mensaje:'NUBE ADULTO concentrado',catalogo:c,clasificacion:{...cl,requiereVision:true},interpretacion:{producto:{marca:'NUBE',observado:{nombre:'NUBE ADULTO',formaAlimento:'comida_humeda',envase:'lata',confianzaIdentidad:.99,confianzaFormato:.99}}}});
 assert.equal(r.nivel,'alta');assert.equal(r.coincidencia.referencia,'NUBE ADULTO');assert.equal(r.envaseAlimento,null);
});
