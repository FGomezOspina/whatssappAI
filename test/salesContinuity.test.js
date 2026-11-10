const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { respuestaParaHistorial } = require('../src/utils/responseMessages');
// Synthetic variants of the observed failure. No customer addresses or API calls.
const item = { marca: 'ALFA', referencia: 'ALFA ARENA VEGETAL', peso: '20kg', precio: 98000, cantidad: 1 };
const catalogo = [{ marca: item.marca, referencias: [{ nombre: item.referencia, categoria: 'arena_sustrato',
  presentaciones: [{ peso: '20kg', precio: 98000 }, { peso: '10kg', precio: 50000 }] }] }];
function preparar({ antiguas = false, alternativas = false, sinCotizacion = false } = {}) {
  let estado = crearEstadoInicial();
  estado.productosConsultados = sinCotizacion ? [] : [{ ...item, contextoCreadoEn: new Date().toISOString() }];
  if (alternativas) estado.productosConsultados.push({ ...item, peso: '10kg', precio: 50000 });
  if (antiguas) estado.ultimaSolicitudProductos = [{ estado: 'pendiente', accion: 'consultar',
    pregunta: '¿Qué medicamento?', contextoCreadoEn: '2026-01-01T00:00:00Z' }];
  const archivo = require.resolve('../src/services/conversationService');
  const req = createRequire(archivo), modulo = { exports: {} };
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'sales-test', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async (_id,e,meta) => {
        estado = JSON.parse(JSON.stringify(e)); if (meta.respuesta) estado.ultimaPreguntaAsistente = respuestaParaHistorial(meta.respuesta);
      } },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    '../repositories/orderRepository': { guardarPedido: async () => { throw Error('Real order forbidden'); } },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo, metadata: {} }) },
    './humanizer': { humanizarRespuesta: async (_m,base) => base },
    './aiInterpreter': { interpretarMensajeCliente: async ({mensaje}) => mensaje.includes('ALFA ARENA') ? {
      intencion:'consulta_producto', accion:'consultar', confianza:.99, seguimientoProducto:'nueva',
      producto:{marca:item.marca,referencia:item.referencia,presentacion:'20kg',cantidad:2},
      consultaCatalogo:{necesaria:true,consulta:'ALFA ARENA VEGETAL 20kg'}
    } : ({ intencion: 'otro', accion: null, confianza: .8,
      consultaCatalogo: { necesaria: false }, continuarFlujo: false, producto: null, productos: [],
      respuestaConversacional: '¿Puedes contarme un poco más sobre lo que necesitas?' }) },
  };
  vm.runInNewContext(fs.readFileSync(archivo,'utf8'), { require: n => mocks[n] || req(n), module: modulo, process,
    console: { log() {}, error() {} } });
  return { estado: () => estado, enviar: async text => respuestaParaHistorial(await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text })) };
}
for (const antiguas of [false,true]) test(`direccion tras cotizacion con router otro; pendientes antiguos=${antiguas}`, async () => {
  const c = preparar({ antiguas });
  const r = await c.enviar('Mz 8 casa 22 Conjunto Prueba\nSector de prueba');
  assert.equal(c.estado().carrito.length,1,r);
  assert.equal(c.estado().carrito[0].precio,98000);
  assert.equal(c.estado().carrito[0].cantidad,1);
  assert.equal(c.estado().pedidoConfirmado,false);
  assert.match(c.estado().datosDomicilio.direccion,/Sector de prueba/);
  assert.doesNotMatch(r,/poco más|Qué medicamento/);
  assert.match(r,/98\.000/);
});

test('cotizacion nueva, direccion, correccion y datos completos conservan dos unidades sin duplicar', async () => {
  const c = preparar({sinCotizacion:true});
  await c.enviar('Cotiza 2 ALFA ARENA VEGETAL de 20kg');
  assert.equal(c.estado().carrito.length,0);
  await c.enviar('Calle 10 # 20-30');
  assert.equal(c.estado().carrito[0].cantidad,2);
  await c.enviar('Calle 11 # 21-31');
  assert.equal(c.estado().carrito[0].cantidad,2);
  const r=await c.enviar('Nombre: Ana Prueba; celular: 3000000000; pago: efectivo');
  assert.match(r,/196\.000/); assert.match(r,/Calle 11 # 21-31/);
  assert.equal(c.estado().esperandoConfirmacionPedido,true);
  assert.equal(c.estado().pedidoConfirmado,false);
});
for (const mensaje of ['¿Llegan a Calle 10 # 20-30?', 'No quiero comprar, Calle 10 # 20-30', 'Si compro, Calle 10 # 20-30'])
test(`direccion no equivale a compra: ${mensaje}`, async () => {
  const c=preparar(); await c.enviar(mensaje); assert.equal(c.estado().carrito.length,0);
});
test('pago afirmativo retoma cotizacion; consulta de pago no compra', async () => {
  const c = preparar();
  const consulta = await c.enviar('¿Puedo pagar en efectivo?');
  assert.equal(c.estado().carrito.length,0,consulta);
  assert.equal(c.estado().metodoPago,null);
  const r = await c.enviar('Pago en efectivo');
  assert.equal(c.estado().carrito.length,1,r);
  assert.equal(c.estado().pedidoConfirmado,false);
});
test('direccion entre varias presentaciones aclara sin comprar todas', async () => {
  const c = preparar({ alternativas:true });
  const r = await c.enviar('Calle 10 # 20-30');
  assert.equal(c.estado().carrito.length,0);
  assert.match(r,/presentaci[oó]n/);
  assert.match(r,/20kg/); assert.match(r,/10kg/);
});
test('direccion sin cotizacion conserva dato sin inventar productos', async () => {
  const c = preparar({sinCotizacion:true}); const r = await c.enviar('Calle 10 # 20-30');
  assert.equal(c.estado().carrito.length,0); assert.match(r,/productos y cantidades/);
});

for (const factura of [false,true]) test(`venta completa local hasta confirmacion, factura=${factura}`, async () => {
  const c = preparar({antiguas:true});
  let r = await c.enviar('Mz 8 casa 22 Conjunto Prueba\nSector de prueba');
  assert.match(r,/agregar algo más/);
  r = await c.enviar('Nombre: Ana Prueba; Celular: 3000000000; pago: efectivo');
  assert.equal(c.estado().carrito.length,1);
  assert.equal(c.estado().esperandoConfirmacionPedido,true,r);
  assert.match(r,/Mz 8 casa 22/); assert.match(r,/98\.000/);
  assert.doesNotMatch(r,/cedula|correo/i);
  if (factura) {
    r = await c.enviar('Necesito factura electrónica');
    assert.match(r,/cedula o NIT/); assert.match(r,/correo/);
    assert.doesNotMatch(r,/- nombre completo|- direccion completa|- celular/);
    r = await c.enviar('NIT: 900000001-1; correo: prueba@example.com');
    assert.equal(c.estado().esperandoConfirmacionPedido,true,r);
  }
  assert.equal(c.estado().pedidoConfirmado,false);
  // Pure business engine only: no order repository or WhatsApp can be reached.
  const local = structuredClone(c.estado());
  const respuesta = require('../src/verticals/petshop/orderLogic').resolverConsultaCatalogo('confirmo el pedido',local,[],
    {intencion:'confirmacion',accion:'confirmar',confianza:1,consultaCatalogo:{necesaria:false}});
  assert.equal(local.pedidoConfirmado,true,respuesta);
  assert.equal(c.estado().pedidoConfirmado,false);
});
