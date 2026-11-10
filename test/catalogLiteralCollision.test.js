const test=require('node:test'),assert=require('node:assert/strict');
const {validarCoincidenciaProducto:validar}=require('../src/services/productMatchValidator');
const catalogo=[{marca:'NOVA-TABS',referencias:[{nombre:'NOVA-TABS',categoria:'medicamento',presentaciones:[{peso:'0.5mg',precio:1}]}]},{marca:'NOVA',referencias:[{nombre:'NOVA TABS',categoria:'medicamento',presentaciones:[{peso:'0.2mg',precio:2}]}]}];
test('bare names differing only by punctuation retain different catalog presentations',()=>{
 for(const mensaje of ['NOVA-TABS','NOVA TABS']){const r=validar({mensaje,catalogo,clasificacion:{intencion:'busqueda_producto',perfilContexto:'producto'}});assert.equal(r.nivel,'media');assert.equal(r.coincidencia,null);assert.equal(r.alternativas.length,2);assert.deepEqual(r.aclaracion.valores.sort(),['0.2mg','0.5mg']);}
});
