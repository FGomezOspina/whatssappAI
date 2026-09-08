const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
const { resolverSeleccionProductoPendiente } = require('../src/services/pendingProductMatchService');
const catalogo = [{ marca: 'MARCA TEST', referencias: [{ nombre: 'SNACK TEST', especie: 'gato', presentaciones: [{ peso: '75gr', precio: 7800 }] }] }];

test('el selector no intercepta una accion operativa aunque quede una cotizacion residual', () => {
  for (const campo of ['esperandoConfirmacionPedido', 'esperandoDatosDomicilio', 'esperandoMetodoPago', 'esperandoTipoEntrega', 'esperandoCambioDireccion', 'esperandoConfirmacionRepetirPedido']) {
    const estado = { ...crearEstadoInicial(), [campo]: true,
      productosConsultados: [{ marca: 'MARCA TEST', referencia: 'SNACK TEST', peso: '75gr', precio: 7800 }] };
    assert.equal(resolverSeleccionProductoPendiente({ mensaje: 'Si', estado, catalogo }), null, campo);
  }
});

test('resumen, confirmacion semantica y repeticion conservan un solo pedido por empresa', async () => {
  const estado = { ...crearEstadoInicial(), carrito: [{ marca: 'MARCA TEST', referencia: 'SNACK TEST', peso: '75gr', precio: 7800, cantidad: 1 }],
    entrega: { tipo: 'domicilio' }, metodoPago: 'efectivo', esperandoDatosDomicilio: true,
    datosDomicilio: { nombre: 'Cliente Prueba', cedula: '000000', celular: '0000000000', correo: 'prueba@example.com', direccion: 'Calle de prueba 1' },
    productosConsultados: [{ marca: 'MARCA TEST', referencia: 'SNACK TEST', peso: '75gr', precio: 7800 }],
    ultimaConsultaProducto: { terminos: ['marca', 'test'], aclaracion: { campo: 'especie', valores: ['perro', 'gato'] }, creadoEn: new Date().toISOString() },
  };
  const resumen = resolverConsultaCatalogo('Datos de entrega completos', estado, catalogo, { intencion: 'datos_envio', accion: null });
  assert.match(resumen, /confirmar el pedido/);
  assert.equal(estado.esperandoConfirmacionPedido, true);
  assert.deepEqual(estado.productosConsultados, []);
  assert.equal(estado.ultimaConsultaProducto, null);
  assert.ok(estado.confirmacionPedidoId);
  const clave = estado.confirmacionPedidoId;
  // Simula recuperar el JSON de Supabase despues de un reinicio, incluyendo
  // contexto residual de una version anterior del servidor.
  const recuperado = JSON.parse(JSON.stringify(estado));
  recuperado.productosConsultados = [{ marca: 'MARCA TEST', referencia: 'SNACK TEST', peso: '75gr', precio: 7800 }];
  const archivo = require.resolve('../src/services/conversationService');
  const localRequire = createRequire(archivo);
  let interpretaciones = 0;
  const pedidos = new Set();
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'empresa-test', slug: 'empresa-test', vertical: 'petshop', prompts: {} }) },
    '../repositories/productRepository': { cargarCatalogoCliente: async () => catalogo },
    '../conversation/conversationStore': {
      obtenerConversacionPersistida: async () => recuperado,
      obtenerHistorialRecientePersistido: async () => [{ direction: 'outbound', body: resumen }],
      guardarConversacionPersistida: async (_usuario, state, metadata) => {
        state.mensajesProcesados = [...new Set([...(state.mensajesProcesados || []), ...(metadata.idsEventos || [])])];
        if (state.pedidoConfirmadoPendienteGuardar) {
          pedidos.add(state.confirmacionPedidoId);
          state.pedidoConfirmadoPendienteGuardar = false;
        }
      },
    },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo: [], metadata: {} }) },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './aiInterpreter': { interpretarMensajeCliente: async () => {
      interpretaciones++;
      // La intencion es semantica. El producto residual no debe reabrir catalogo.
      return { intencion: 'confirmacion', accion: 'confirmar', confianza: 0.99,
        producto: { marca: 'MARCA TEST', referencia: 'SNACK TEST', presentacion: '75gr' } };
    } },
    './humanizer': { humanizarRespuesta: async (_mensaje, base) => base },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: name => mocks[name] || localRequire(name), module: modulo, process, console: { log() {}, error() {} } });
  const evento = { channelUserId: 'usuario-test', phoneNumberId: 'canal-test', messageId: 'confirmacion-test', text: 'De acuerdo con lo revisado, adelante' };
  const respuesta = await modulo.exports.responderEventoEntrante(evento);
  assert.match(respuesta, /pedido queda confirmado/);
  assert.doesNotMatch(respuesta, /encontr[eé]|presentaciones|quieres agregar/i);
  assert.equal(recuperado.esperandoConfirmacionPedido, false);
  assert.equal(recuperado.pedidoConfirmado, true);
  assert.equal(recuperado.confirmacionPedidoId, clave);
  assert.equal(recuperado.carrito[0].cantidad, 1);
  const repetida = await modulo.exports.responderEventoEntrante(evento);
  assert.equal(repetida, null);
  assert.equal(interpretaciones, 1);
  assert.equal(pedidos.size, 1);
  const nuevoAcuse = await modulo.exports.responderEventoEntrante({ ...evento, messageId: 'acuse-test' });
  assert.match(nuevoAcuse, /pedido.*confirmado/i);
  assert.doesNotMatch(nuevoAcuse, /encontr[eé]|presentaciones|marcas/i);
  assert.equal(pedidos.size, 1);
  assert.equal(recuperado.confirmacionPedidoId, clave);

});

test('respuesta no resuelta mantiene la confirmacion y permite corregir datos semanticamente', () => {
  const estado = { ...crearEstadoInicial(), esperandoConfirmacionPedido: true, confirmacionPedidoId: 'estable',
    carrito: [{ marca: 'Prueba', referencia: 'Producto', peso: '1kg', precio: 1000, cantidad: 1 }],
    datosDomicilio: { nombre: 'Anterior', cedula: '0000', celular: '0000', correo: 'prueba@example.com', direccion: 'Calle de prueba 1' }, metodoPago: 'efectivo', entrega: { tipo: 'domicilio' } };
  const noResuelta = resolverConsultaCatalogo('...', estado, [], null);
  assert.match(noResuelta, /confirmar el pedido/);
  assert.equal(estado.esperandoConfirmacionPedido, true);
  const corregida = resolverConsultaCatalogo('debe figurar otra persona', estado, [], {
    intencion: 'datos_envio', confianza: 0.99, datosCliente: { nombre: 'Cliente Prueba' },
  });
  assert.equal(estado.datosDomicilio.nombre, 'Cliente Prueba');
  assert.equal(estado.confirmacionPedidoId, 'estable');
  assert.match(corregida, /confirmar el pedido/);
  assert.equal(estado.pedidoConfirmado, false);
});
