const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { respuestaParaHistorial } = require('../src/utils/responseMessages');
const catalogo = [
  { marca: 'ALFA', referencias: [{ nombre: 'ALFA WILD ADULT', especie: 'gato', categoria: 'comida', etapa: 'adulto',
    presentaciones: [{ peso: '1kg', precio: 35900 }] }] },
  { marca: 'BETA', referencias: [{ nombre: 'BETA POUCH FELINO ADULT', especie: 'gato', categoria: 'comida', subcategoria: 'comida_humeda', etapa: 'adulto',
    presentaciones: [{ peso: '85g', precio: 6200 }] }] },
];
const items = [{ marca: 'BETA', referencia: 'BETA POUCH FELINO ADULT', peso: '85g', precio: 6200, cantidad: 3 },
  { marca: 'ALFA', referencia: 'ALFA WILD ADULT', peso: '1kg', precio: 35900, cantidad: 1 }];
const direccion = 'Calle 10 # 20-30 apartamento 301';
const datosCliente = { nombre: 'Cliente Prueba', cedula: '1000000000', celular: '3000000000', correo: 'cliente@example.com' };

function preparar({ carrito = false, sinCotizacion = false } = {}) {
  let estado = crearEstadoInicial();
  if (carrito) estado.carrito = structuredClone(items);
  else if (!sinCotizacion) {
    estado.productosConsultados = structuredClone(items);
    estado.ultimaSolicitudProductos = items.map(item => ({ ...item, presentacion: item.peso, accion: 'consultar',
      estado: 'identificado', cotizacion: [structuredClone(item)] }));
  }
  const archivo = require.resolve('../src/services/conversationService'), req = createRequire(archivo), modulo = { exports: {} };
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'continuity-test', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async (_id, e, meta) => {
        estado = JSON.parse(JSON.stringify(e)); if (meta.respuesta) estado.ultimaPreguntaAsistente = respuestaParaHistorial(meta.respuesta);
      } },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo, metadata: {} }) },
    './humanizer': { humanizarRespuesta: async (_m, base) => base },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      if (args.mensaje.includes('3kg')) return { intencion: 'consulta_producto', accion: 'consultar', confianza: .99,
        producto: { marca: 'ALFA', referencia: 'ALFA WILD ADULT', presentacion: '3kg', cantidad: 1 },
        consultaCatalogo: { necesaria: true, consulta: 'ALFA WILD ADULT 3kg' } };
      if (args.mensaje.includes('otro')) return { intencion: 'pedido_producto', accion: 'agregar', confianza: .99,
        producto: { marca: 'BETA', referencia: 'BETA POUCH FELINO ADULT', presentacion: '85g', cantidad: 1 },
        consultaCatalogo: { necesaria: true, consulta: 'BETA POUCH FELINO ADULT 85g' } };
      return { intencion: 'datos_envio', accion: null, confianza: .99, continuarFlujo: false,
        consultaCatalogo: { necesaria: false }, entrega: args.mensaje.includes('Calle')
          ? { tipo: 'domicilio', direccion } : { metodoPago: 'efectivo' },
        datosCliente: args.mensaje.includes('Calle') ? {} : datosCliente,
        respuestaConversacional: 'Perfecto, continuamos con tu pedido.' };
    } },
  };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || req(n), module: modulo, process,
    console: { log() {}, error() {} } });
  return { estado: () => estado, enviar: async text => respuestaParaHistorial(await modulo.exports.responderEventoEntrante({ channelUserId: 'test', text })) };
}

for (const carrito of [false, true]) test(`consulta de otro peso conserva seleccion y checkout completo; carrito=${carrito}`, async () => {
  const caso = preparar({ carrito });
  const consulta = await caso.enviar('tienes ALFA WILD ADULT 3kg?');
  assert.match(consulta, /no tengo.*3kg/i);
  assert.equal(caso.estado().carrito.length, carrito ? 2 : 0);
  const inicio = await caso.enviar(direccion);
  assert.equal(caso.estado().carrito.length, 2, inicio);
  assert.deepEqual(caso.estado().carrito.map(p => [p.referencia, p.peso, p.cantidad]), items.map(p => [p.referencia, p.peso, p.cantidad]));
  assert.equal(caso.estado().datosDomicilio.direccion, direccion);
  assert.match(inicio, /54\.500/);
  assert.doesNotMatch(inicio, /- direccion completa/);
  const cierre = await caso.enviar('Cliente Prueba\n1000000000\n3000000000\ncliente@example.com\nefectivo');
  assert.match(cierre, /54\.500/);
  assert.match(cierre, /Calle 10 # 20-30 apartamento 301/);
  assert.match(cierre, /finalizamos el pedido así/);
  assert.equal(caso.estado().esperandoConfirmacionPedido, true);
  assert.equal(caso.estado().pedidoConfirmado, false);
  assert.equal(caso.estado().metodoPago, 'efectivo');
  // Otra consulta durante el cierre no borra productos ni datos.
  await caso.enviar('tienes ALFA WILD ADULT 3kg?');
  const resumen = await caso.enviar(direccion);
  assert.match(resumen, /54\.500/);
  assert.equal(caso.estado().carrito.length, 2);
  assert.equal(caso.estado().datosDomicilio.correo, datosCliente.correo);
});

test('dar direccion sin seleccion no inventa un carrito ni afirma que el pedido avanza', async () => {
  const caso = preparar({ sinCotizacion: true });
  const respuesta = await caso.enviar(direccion);
  assert.equal(caso.estado().carrito.length, 0);
  assert.equal(caso.estado().datosDomicilio.direccion, direccion);
  assert.match(respuesta, /productos y cantidades/);
});

test('agregar otro producto despues de consultar no borra las lineas ni datos del pedido', async () => {
  const caso = preparar({ carrito: true });
  await caso.enviar(direccion);
  await caso.enviar('Cliente Prueba\n1000000000\n3000000000\ncliente@example.com\nefectivo');
  await caso.enviar('tienes ALFA WILD ADULT 3kg?');
  const respuesta = await caso.enviar('agrega otro BETA POUCH FELINO ADULT 85g');
  assert.equal(caso.estado().carrito.find(item => item.marca === 'BETA').cantidad, 4, respuesta);
  assert.equal(caso.estado().carrito.find(item => item.marca === 'ALFA').cantidad, 1);
  assert.equal(caso.estado().datosDomicilio.direccion, direccion);
  assert.equal(caso.estado().metodoPago, 'efectivo');
  assert.match(respuesta, /60\.700/);
  assert.equal(caso.estado().pedidoConfirmado, false);
});
