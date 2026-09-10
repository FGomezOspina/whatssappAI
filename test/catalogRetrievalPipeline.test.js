const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createRequire} = require('node:module');

test('la lectura visual conserva candidatos aunque el texto sea una pregunta de disponibilidad', async () => {
  const archivo=require.resolve('../src/services/catalogContextService');
  const localRequire=createRequire(archivo);
  const catalogo=[{marca:'MARCA SINTETICA',referencias:[{nombre:'MARCA SINTETICA PEQ AD',especie:'perro',presentaciones:[{peso:'1.5kg',precio:1000}]}]}];
  let errores = false;
  let primeraFalla = false;
  let llamadas = 0;
  const modulo={exports:{}};
  vm.runInNewContext(fs.readFileSync(archivo,'utf8'),{require:name=>name==='../repositories/productRepository'?{
    buscarProductosCatalogoCliente:async()=>{
      llamadas++;
      if (errores || (primeraFalla && llamadas === 1)) throw new Error('Fallo de prueba');
      return {catalogo,metadata:{}};
    }
  }:localRequire(name),module:modulo,process,console:{log(){}}});
  const resultado=await modulo.exports.seleccionarCatalogoParaIA({catalogo:[],mensaje:'MARCA SINTETICA pequeños adultos 1.5kg',mensajeOriginal:'Tienes disponible este producto?',cliente:{id:'test'},clasificacion:{requiereVision:true,requiereBusquedaProducto:true,perfilContexto:'pedido'}});
  assert.equal(resultado.catalogo.length,1);
  assert.equal(resultado.catalogo[0].referencias[0].nombre,'MARCA SINTETICA PEQ AD');
  primeraFalla = true;
  llamadas = 0;
  const parcial = await modulo.exports.seleccionarCatalogoParaIA({ mensaje:'MARCA SINTETICA pequeños adultos 1.5kg',
    clasificacion:{requiereVision:true,requiereBusquedaProducto:true,perfilContexto:'pedido'} });
  assert.ok(llamadas > 1);
  assert.equal(parcial.catalogo.length,1);
  errores = true;
  const fallida = await modulo.exports.seleccionarCatalogoParaIA({ mensaje:'MARCA SINTETICA',
    clasificacion:{requiereBusquedaProducto:true,perfilContexto:'pedido'} });
  assert.equal(fallida.metadata.errorBusqueda,true);

});


test('la imagen usa el modelo visual aunque el perfil sea pedido', () => {
  const {modeloInterprete}=require('../src/services/modelRouter');
  assert.equal(modeloInterprete({requiereVision:true,perfilContexto:'pedido'}),
    process.env.OPENAI_VISION_MODEL || process.env.OPENAI_INTERPRETER_MODEL_COMPLEX ||
    process.env.OPENAI_INTERPRETER_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1');
});
