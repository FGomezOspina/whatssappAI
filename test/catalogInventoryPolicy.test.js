const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHarness } = require('../scripts/evaluation/sales-dialogue-harness');
const { resolverPresentacionesIdentificadas } = require('../src/services/presentationSelectionService');
const { opcionesVerificables } = require('../src/services/catalogRecommendationService');
const { recordarSeleccion, resolverCompraContextual } = require('../src/services/activeProductSelectionService');
const { completarCompraDesdeCotizaciones } = require('../src/services/quotedPurchaseService');
const { serializarContextoComercial, mencionaExistencias } = require('../src/utils/catalogInventoryPolicy');

const stockValues = [true, false, null, undefined];
function fixture(stock) {
  const stockField = stock === undefined ? {} : { stock };
  return [{ marca: 'NUBEX', referencias: [{ nombre: 'NUBEX ADULTO', especie: 'perro', etapa: 'adulto',
    categoria: 'comida', subcategoria: 'concentrado', metadata: { id: 'active-ref' },
    presentaciones: [{ peso: '4kg', precio: 12300, ...stockField }, { peso: '8kg', precio: 22000, ...stockField }] }] }];
}
const producto = { marca: 'NUBEX', referencia: 'NUBEX ADULTO', especie: 'perro', presentacion: '4kg', cantidad: 2 };
function decision(accion, p = producto) {
  return { intencion: accion === 'agregar' ? 'pedido_producto' : 'consulta_producto', accion, confianza: 1,
    producto: structuredClone(p), consultaCatalogo: { necesaria: true, tipo: 'referencia', consulta: [p.marca, p.referencia, p.presentacion].filter(Boolean).join(' ') } };
}
function assertNoInventory(text) { assert.equal(mencionaExistencias(text), false, text); }

for (const stock of stockValues) {
  test(`stock=${stock}: cotiza y toma pedido con identidad, cantidad y precio actual verificados`, async () => {
    const catalogo = fixture(stock);
    const h = createHarness({ catalogo, interpreter: async ({mensaje}) => decision(mensaje.startsWith('Cotiza') ? 'consultar' : 'agregar') });
    const quote = await h.send('Cotiza NUBEX ADULTO de 4kg, 2 unidades');
    assert.equal(quote.state.carrito.length, 0); assert.match(quote.response, /12\.300/); assertNoInventory(quote.response);
    catalogo[0].referencias[0].presentaciones[0].precio = 13000;
    const bought = await h.send('Agrega 2 NUBEX ADULTO de 4kg');
    assert.equal(bought.state.carrito.length, 1, bought.response);
    const item = bought.state.carrito[0];
    assert.equal(item.referencia, 'NUBEX ADULTO'); assert.equal(item.peso, '4kg');
    assert.equal(item.precio, 13000); assert.equal(item.cantidad, 2);
    assert.equal(bought.state.pedidoConfirmado, false); assertNoInventory(bought.response);
  });
  test(`stock=${stock}: todas las presentaciones y recomendaciones siguen siendo elegibles`, () => {
    const catalogo = fixture(stock), r = catalogo[0].referencias[0];
    const validacion = { nivel: 'alta', coincidencia: { marca: 'NUBEX', referencia: r.nombre, referenciaCatalogo: r.nombre, presentaciones: r.presentaciones } };
    const result = resolverPresentacionesIdentificadas({ validacion, catalogo, producto: { intencionPresentaciones: 'todas' } });
    assert.deepEqual(result.seleccionPresentaciones.grupos.map(p=>p.peso), ['4kg', '8kg']);
    const options = opcionesVerificables(catalogo, { especie: 'perro', etapa: 'adulto', categoria: 'comida' });
    assert.equal(options.length, 1); assert.equal(options[0].presentacion.peso, '4kg');
  });
  test(`stock=${stock}: compra contextual y cotización previa no pierden la selección`, () => {
    const quote = { marca: producto.marca, referencia: producto.referencia, peso: '4kg', cantidad: 2, precio: 12300, ...(stock === undefined ? {} : {stock}) };
    const state = { carrito: [], ultimaSolicitudProductos: [], seleccionesProducto: [] };
    recordarSeleccion(state, { ...producto, accion: 'consultar', cotizacion: [quote] });
    assert.equal(state.seleccionesProducto[0].estado, 'cotizado');
    const contextual = resolverCompraContextual('Envíame ese', { accion: 'agregar' }, state);
    assert.equal(contextual.length, 1); assert.equal(contextual[0].presentacion, '4kg');
    const completed = completarCompraDesdeCotizaciones(decision('agregar', { marca: 'NUBEX', cantidad: 2 }), state);
    assert.equal(completed.producto.referencia, 'NUBEX ADULTO'); assert.equal(completed.producto.presentacion, '4kg');
  });
}

test('stock false no impide la presentación correcta por peso de mascota', () => {
  const r = { nombre: 'FICTORA CONTROL', categoria: 'medicamento', especie: 'perro', presentaciones: [
    {peso:'4-10kg',precio:12000,stock:false}, {peso:'10-25kg',precio:17000,stock:true}] };
  const result = resolverPresentacionesIdentificadas({ catalogo: [{marca:'FICTORA',referencias:[r]}],
    validacion: {nivel:'alta',coincidencia:{marca:'FICTORA',referencia:r.nombre,referenciaCatalogo:r.nombre,presentaciones:r.presentaciones}},
    producto:{mascotas:[{nombre:'Mascota',pesoKg:7}]} });
  assert.equal(result.seleccionPresentaciones.grupos[0].peso, '4-10kg');
  assert.equal(result.seleccionPresentaciones.grupos[0].precio, 12000);
});

for (const [name, requested, catalogo] of [
  ['referencia inexistente', {...producto, marca:'ZORVIX',referencia:'ZORVIX INEXISTENTE'}, fixture(false)],
  ['presentación inexistente', {...producto,presentacion:'99kg'}, fixture(false)],
  ['variante ambigua', {...producto,referencia:'NUBEX',presentacion:'4kg'}, [{marca:'NUBEX',referencias:[
    ...fixture(false)[0].referencias, {...fixture(false)[0].referencias[0],nombre:'NUBEX CACHORRO',etapa:'cachorro'}]}]],
]) test(`${name}: no toma pedido ni inventa sustitución`, async () => {
  const h = createHarness({catalogo,interpreter:async()=>decision('agregar',requested)});
  const result = await h.send(`Agrega ${requested.referencia} de ${requested.presentacion}`);
  assert.equal(result.state.carrito.length,0,result.response); assert.equal(result.state.pedidoConfirmado,false);
  assertNoInventory(result.response);
});

test('precio faltante y variante nueva no se completan desde una cotización anterior', () => {
  for (const precio of [null, undefined, 'invalid']) {
    const state = {seleccionesProducto:[]};
    recordarSeleccion(state,{...producto,cotizacion:[{...producto,peso:'4kg',precio,stock:false}]});
    assert.equal(state.seleccionesProducto[0].estado,'pendiente');
    assert.equal(state.seleccionesProducto[0].cotizacion.length,0);
  }
  const state={ultimaSolicitudProductos:[{...producto,accion:'consultar',cotizacion:[{...producto,peso:'4kg',precio:12300,stock:false}]}]};
  const d=decision('agregar',{...producto,referencia:'NUBEX CACHORRO',presentacion:null});
  assert.equal(completarCompraDesdeCotizaciones(d,state),d);
});

test('serialización no expone stock legado ni altera datos, identidad o precios', () => {
  const original={catalogo:fixture(false),estado:{ultimaSeleccion:{...producto,stock:null}}};
  const before=structuredClone(original),out=JSON.parse(serializarContextoComercial(original));
  assert.doesNotMatch(JSON.stringify(out),/"stock"/);assert.deepEqual(original,before);
  assert.equal(out.catalogo[0].referencias[0].presentaciones[0].precio,12300);
  assert.equal(out.estado.ultimaSeleccion.referencia,'NUBEX ADULTO');
});

test('repositorio mantiene filtros activos y aislamiento por empresa; inactiva no entra al pedido', async () => {
  const file=require.resolve('../src/repositories/productRepository'), req=createRequire(file), mod={exports:{}}, queries=[];
  const tenants={a:{brand:'brand-a',ref:'NUBEX ADULTO'},b:{brand:'brand-b',ref:'FICTORA ADULTO'}};
  const requestSupabase=async query=>{
    queries.push(query); const url=new URL('https://offline.test/'+query),q=url.searchParams;
    assert.equal(q.get('active'),'eq.true');assert.equal(q.has('stock'),false);
    if(url.pathname==='/catalog_brands') { const tenant=q.get('client_id').slice(3); return [{id:tenants[tenant].brand,name:tenant==='a'?'NUBEX':'FICTORA'}]; }
    if(url.pathname==='/catalog_references') {
      const tenant=q.get('brand_id').includes('brand-a')?'a':'b';
      return [{id:'ref-'+tenant,brand_id:tenants[tenant].brand,name:tenants[tenant].ref,category:'comida',species:'perro',active:true},
        {id:'retired-'+tenant,brand_id:tenants[tenant].brand,name:'NUBEX RETIRADO',category:'comida',species:'perro',active:false}]
        .filter(row=>q.get('active')!=='eq.true' || row.active);
    }
    const tenant=q.get('reference_id').includes('ref-a')?'a':'b';
    return [{reference_id:'ref-'+tenant,weight:'4kg',price:12300,stock:false}];
  };
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,require:n=>n==='./supabaseClient'
    ? {supabaseConfigurado:()=>true,requestSupabase}:req(n),process,console,__dirname:path.dirname(file),URLSearchParams});
  const a=await mod.exports.cargarCatalogoCliente({id:'a'}),b=await mod.exports.cargarCatalogoCliente({id:'b'});
  assert.equal(a[0].referencias[0].nombre,'NUBEX ADULTO');assert.equal(b[0].referencias[0].nombre,'FICTORA ADULTO');
  assert.equal(queries.length,6);
  for(const requested of [{...producto,referencia:'NUBEX RETIRADO'}, {...producto,marca:'FICTORA',referencia:'FICTORA ADULTO'}]) {
    const h=createHarness({catalogo:a,interpreter:async()=>decision('agregar',requested)});
    const result=await h.send('Agrega '+requested.referencia+' de 4kg');
    assert.equal(result.state.carrito.length,0,result.response);
  }
});

function mockHumanizer(response) {
  const file=require.resolve('../src/services/humanizer'), req=createRequire(file),mod={exports:{}},calls=[];
  class OpenAI { constructor() { this.chat={completions:{create:async args=>{calls.push(args);return {choices:[{message:{content:response}}],usage:null};}}}; } }
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,require:n=>n==='openai'?OpenAI:req(n),
    process:{env:{OPENAI_API_KEY:'offline-placeholder'}},console:{log(){},warn(){},error(){}}});
  return {humanizar:mod.exports.humanizarRespuesta,calls};
}
for(const response of ['Las existencias están por confirmar.','Está agotado.','Debo verificar su disponibilidad.','Esa presentación no está disponible.','Primero debo confirmar si lo tenemos.','No hay unidades de esa referencia.']) {
  test(`redactor rechaza aviso legado: ${response}`,async()=>{
    const base='NUBEX ADULTO 4kg: $12.300. ¿Lo agregamos?';
    const x=mockHumanizer(base+' '+response);
    const result=await x.humanizar('precio',base,{clasificacion:{recomendacionCatalogo:true,requiereOpenAI:true},estado:{},cliente:{id:'offline'},vertical:{key:'petshop'}});
    assert.equal(result,base);assert.equal(x.calls.length,1);
    assert.match(x.calls[0].messages[0].content,/No consultes, menciones ni condiciones/);
  });
}


test('el redactor de producto elimina stock del contexto y rechaza negación sin perder cotización',async()=>{
  const base='NUBEX ADULTO 4kg: $12.300.';
  const x=mockHumanizer(base+' Esa presentación no está disponible.');
  const result=await x.humanizar('precio NUBEX ADULTO 4kg',base,{
    clasificacion:{perfilContexto:'producto',requiereOpenAI:true},
    productoAutonomo:{nivel:'alta',coincidencia:{marca:'NUBEX',referencia:'NUBEX ADULTO',presentaciones:[{peso:'4kg',precio:12300,stock:false}]}},
    estado:{carrito:[]},interpretacionIA:{accion:'consultar',producto},cliente:{id:'offline'},vertical:{key:'petshop'}});
  assert.equal(result,base);assert.equal(x.calls.length,2);
  for(const call of x.calls) {
    assert.doesNotMatch(call.messages[1].content,/"stock"/);
    assert.match(call.messages[0].content,/No consultes, menciones ni condiciones/);
  }
});

test('la barrera no confunde identidad o presentación inexistente con inventario',()=>{
  for(const text of ['No hay una presentación del catálogo para ese peso.',
    'No pude identificar esa referencia. ¿Cuál es la marca?', 'No tengo presentación de 99kg en el catálogo.']) {
    assert.equal(mencionaExistencias(text),false);
  }
});

test('erratas y unidades verbales se reconocen contra catálogo aunque stock sea false',()=>{
  const {validarCoincidenciaProducto}=require('../src/services/productMatchValidator');
  const catalogo=[{marca:'ALBORADA',referencias:[
    {nombre:'ALBORADA INDOOR CAT',especie:'gato',categoria:'comida',presentaciones:[{peso:'500gr',precio:12300,stock:false}]},
    {nombre:'ALBORADA KITTEN CAT',especie:'gato',categoria:'comida',presentaciones:[{peso:'500gr',precio:14500,stock:true}]},
  ]}];
  const clasificacion={intencion:'busqueda_producto',perfilContexto:'producto'};
  for(const peso of ['medio kilo','500g','quinientos gramos']) {
    const r=validarCoincidenciaProducto({mensaje:`alborad indor gato ${peso}`,catalogo,clasificacion});
    assert.equal(r.nivel,'alta');assert.equal(r.coincidencia.referencia,'ALBORADA INDOOR CAT');
    assert.equal(r.presentacionSolicitada,'500g');
  }
  const nonexistent=validarCoincidenciaProducto({mensaje:'alborad nocturno gato medio kilo',catalogo,clasificacion});
  assert.notEqual(nonexistent.nivel,'alta');
});
