const test = require('node:test');
const assert = require('node:assert/strict');
const { precioPorCantidad, normalizarVentaUnitaria } = require('../src/utils/catalogCommercialRules');
const { resolverConsultaCatalogo, resumenCarrito } = require('../src/verticals/petshop/orderLogic');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
const { consolidarCatalogo } = require('../src/services/catalogConsolidationService');
const original = require('../productos.json').filter(m => m.marca === 'CHURU');
const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'pedido', requiereBusquedaProducto: true };
const catalogo = consolidarCatalogo(original);
function interpretacion(cantidad, extra = {}) {
  return { intencion: 'pedido_producto', accion: 'agregar', confianza: 1,
    producto: { marca: 'CHURU', referencia: 'CHURU', presentacion: '14gr', cantidad, especie: 'gato' }, ...extra };
}

test('precio unitario depende de cantidad y de datos del catálogo', () => {
  const p = catalogo[0].referencias.find(r => r.nombre === 'CHURU').presentaciones[0];
  for (const [cantidad, precio] of [[1,3200],[2,3200],[3,3200],[4,3000],[5,3000],[12,3000]]) assert.equal(precioPorCantidad(p,cantidad),precio);
  assert.equal(precioPorCantidad({ precio: 9000 }, 4), 9000);
  assert.equal(precioPorCantidad({precio:500,metadata:{precios_por_cantidad:[{desde:6,precio:450}]}},6),450);
});

test('venta individual para ambas especies no elige una caja ni cambia otras variantes', () => {
  for (const especie of ['perro','gato']) {
    const i = interpretacion(4); i.producto.especie = especie;
    const v = validarCoincidenciaProducto({ mensaje: `4 churu para ${especie}`, catalogo, interpretacion: i, clasificacion });
    assert.equal(v.nivel,'alta'); assert.equal(v.coincidencia.referencia,'CHURU');
  }
  const v = validarCoincidenciaProducto({ mensaje:'CHURU 20TUBES 14gr', catalogo, interpretacion: interpretacion(1),clasificacion });
  assert.equal(v.coincidencia?.referencia,'CHURU 20TUBES');
  const ficticio = JSON.parse(JSON.stringify(catalogo).replaceAll('CHURU','SNACKPRUEBA'));
  const i=interpretacion(4); i.producto.marca='SNACKPRUEBA'; i.producto.referencia='SNACKPRUEBA';
  const r=validarCoincidenciaProducto({mensaje:'4 SNACKPRUEBA para gato',catalogo:ficticio,interpretacion:i,clasificacion});
  assert.equal(r.coincidencia?.referencia,'SNACKPRUEBA');
});

test('paquetes de unidades se convierten solamente para venta individual declarada', () => {
  for(const [texto,cantidad] of [['1 paquete de churo de 4 paquetitos gato de salmón o atún',4],['2 paquetes de churu de 4 tubitos',8]]) {
    const i=interpretacion(1);i.producto.presentacion='4 unidades';
    assert.equal(normalizarVentaUnitaria(i,catalogo,texto),true);assert.equal(i.producto.cantidad,cantidad);assert.equal(i.producto.presentacion,'14gr');
  }
  const i=interpretacion(1);i.producto.referencia='CHURU 20TUBES';i.producto.presentacion='20 unidades';
  assert.equal(normalizarVentaUnitaria(i,catalogo,'1 paquete de churu de 20 tubos'),false);
});

test('el carrito recalcula el descuento al sumar, bajar y volver a sumar unidades', () => {
  let estado=crearEstadoInicial();
  resolverConsultaCatalogo('agrega 3 churu de 14gr para gato',estado,catalogo,interpretacion(3));
  assert.equal(estado.carrito.length,1);assert.equal(estado.carrito[0].precio,3200);assert.match(resumenCarrito(estado),/9\.600/);
  estado=JSON.parse(JSON.stringify(estado));
  resolverConsultaCatalogo('agrega 1 churu de 14gr',estado,catalogo,interpretacion(1));
  assert.equal(estado.carrito.length,1);assert.equal(estado.carrito[0].cantidad,4);assert.equal(estado.carrito[0].precio,3000);assert.match(resumenCarrito(estado),/12\.000/);
  resolverConsultaCatalogo('deja solo 2 churu',estado,[],interpretacion(2,{accion:'modificar_cantidad',carrito:{operacion:'modificar_cantidad',cantidadObjetivo:2,aplicaAlUltimoProducto:true}}));
  assert.equal(estado.carrito[0].precio,3200);assert.match(resumenCarrito(estado),/6\.400/);
  resolverConsultaCatalogo('agrega 3 churu de 14gr',estado,catalogo,interpretacion(3));
  assert.equal(estado.carrito.length,1);assert.equal(estado.carrito[0].cantidad,5);assert.equal(estado.carrito[0].precio,3000);assert.match(resumenCarrito(estado),/15\.000/);
});

test('cotizar cuatro unidades usa la tarifa correcta sin agregar al carrito', () => {
  const estado=crearEstadoInicial();
  const respuesta=resolverConsultaCatalogo('cuánto valen 4 churu de 14gr',estado,catalogo,interpretacion(4,{intencion:'consulta_producto',accion:'consultar'}));
  assert.equal(estado.carrito.length,0);
  assert.equal(estado.productosConsultados[0]?.precio,3000,JSON.stringify({respuesta,consultados:estado.productosConsultados}));
  assert.match(respuesta,/3\.000/);
});

test('la recuperación aproximada compara marcas del cliente y conserva reglas de precio', async () => {
  const fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module');
  const file=require.resolve('../src/repositories/productRepository'),req=createRequire(file),modulo={exports:{}};
  const consultas=[];
  const referencia={brand_id:'brand',reference_id:'ref',brand_name:'NUTRIALFA',reference_name:'NUTRIALFA',species:'perro y gato',
    category:'snack',reference_metadata:{especies:['perro','gato'],venta_por_unidad:true},presentations:[{peso:'14gr',precio:3200,metadata:{precios_por_cantidad:[{desde:4,precio:3000}]}}]};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n==='./supabaseClient'?{supabaseConfigurado:()=>true,requestSupabase:async(route,options)=>{
    consultas.push({route,options});
    if(route.startsWith('catalog_brands?')) {assert.match(route,/client_id=eq.tenant-a&active=eq.true/);return [{name:'NUTRIALFA'},{name:'OTRAMARCA'}];}
    const query=JSON.parse(options.body);assert.equal(query.p_client_id,'tenant-a');
    return query.p_query==='NUTRIALFA'?[referencia]:[];
  }}:req(n),module:modulo,process,console,__dirname:require('node:path').dirname(file)});
  const r=await modulo.exports.buscarProductosCatalogoCliente({id:'tenant-a'},{query:'nutrialfo',limit:8,recuperarMarcaAproximada:true});
  assert.equal(r.catalogo[0].referencias[0].nombre,'NUTRIALFA');
  assert.equal(precioPorCantidad(r.catalogo[0].referencias[0].presentaciones[0],4),3000);
  assert.equal(consultas.filter(c=>c.route.startsWith('rpc/')).length,2);
});

test('cambiar un item sin consultar catálogo nunca redirige la operación al último del carrito', () => {
  const estado=crearEstadoInicial();
  estado.carrito=[{marca:'ALFA',referencia:'ALFA ADULTO',peso:'3kg',cantidad:2,precio:80000,especie:'gato',categoria:'comida'},
    {marca:'CHURU',referencia:'CHURU',peso:'14gr',cantidad:4,precio:3000,precioBase:3200,preciosPorCantidad:[{desde:4,precio:3000}],especie:'perro y gato',categoria:'snack'}];
  const i={intencion:'pedido_producto',accion:'modificar_cantidad',confianza:1,consultaCatalogo:{necesaria:false},
    producto:{marca:'ALFA',referencia:'ALFA ADULTO',presentacion:'3kg',especie:'gato',cantidad:1},
    carrito:{operacion:'modificar_cantidad',cantidadObjetivo:1,aplicaAlUltimoProducto:true}};
  resolverConsultaCatalogo('deja 1 ALFA ADULTO 3kg',estado,[],i);
  assert.equal(estado.carrito[0].cantidad,1);assert.equal(estado.carrito[1].cantidad,4);assert.equal(estado.carrito[1].precio,3000);
  i.producto={marca:'OTRO',referencia:'NO EXISTE',cantidad:1};
  resolverConsultaCatalogo('deja 1 NO EXISTE',estado,[],i);
  assert.equal(estado.carrito[1].cantidad,4);
});

test('el redactor usa el precio vigente por cantidad y no exige el precio base', async () => {
  const fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module');
  const file=require.resolve('../src/services/humanizer'),req=createRequire(file),modulo={exports:{}};
  let texto, contexto;
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n==='openai'?class {
    chat={completions:{create:async args=>{contexto=JSON.parse(args.messages[1].content);return {choices:[{message:{content:texto}}]};}}};
  }:req(n),module:modulo,process:{env:{OPENAI_API_KEY:'synthetic'}},console});
  for (const [accion,cantidad,precio,carritoCantidad] of [['consultar',4,3000,0],['agregar',1,3000,4],['modificar_cantidad',3,3200,3]]) {
    const estado=crearEstadoInicial();
    if(carritoCantidad) estado.carrito=[{marca:'NUTRIALFA',referencia:'NUTRIALFA',peso:'14gr',precio,precioBase:3200,preciosPorCantidad:[{desde:4,precio:3000}],cantidad:carritoCantidad}];
    texto=`NUTRIALFA 14gr a $${precio===3000?'3.000':'3.200'} cada uno${accion==='consultar'?', total $12.000':''}. ¿Seguimos con la entrega?`;
    const salida=await modulo.exports.humanizarRespuesta('solicitud de producto',texto,{
      estado,interpretacionIA:{accion,producto:{cantidad}},
      productoAutonomo:{nivel:'alta',presentacionSolicitada:'14gr',coincidencia:{marca:'NUTRIALFA',referencia:'NUTRIALFA',
        presentaciones:[{peso:'14gr',precio:3200,metadata:{precios_por_cantidad:[{desde:4,precio:3000}]}}]}}
    });
    assert.equal(salida,texto);assert.equal(contexto.resultado.coincidencia.presentaciones[0].precio,precio);
    if(carritoCantidad) assert.equal(contexto.carrito[0].precioBase,undefined);
  }
});
