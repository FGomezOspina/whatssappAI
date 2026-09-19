const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
const catalogo = [{ marca: 'PRUEBA', referencias: [{ nombre: 'PRUEBA ADULTO', especie: 'perro', categoria: 'comida',
  presentaciones: [{ peso: '30kg', precio: 140000 }] }] }];
const producto = { marca: 'PRUEBA', referencia: 'PRUEBA ADULTO', presentacion: '30kg', cantidad: 2 };

function flujo(inicial) {
  let estado = inicial;
  let decision;
  let consultas = 0;
  const archivo = require.resolve('../src/services/conversationService');
  const localRequire = createRequire(archivo);
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'progreso', vertical: 'petshop' }) },
    '../conversation/conversationStore': {
      obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [],
      guardarConversacionPersistida: async (_id, _estado, meta) => {
        if (meta.respuesta) estado.ultimaPreguntaAsistente = meta.respuesta;
      },
    },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => { consultas++; return { catalogo, metadata: {} }; } },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './aiInterpreter': { interpretarMensajeCliente: async args => args.clasificacion.decisionHerramientas ? decision : {
      confianza: 1, intencion: 'consulta_producto', accion: 'consultar', producto,
    } },
    './humanizer': { humanizarRespuesta: async (_m, base) => base },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || localRequire(n),
    module: modulo, process, console: { log() {}, error() {} } });
  return {
    get estado() { return estado; }, get consultas() { return consultas; },
    async turno(text, interpretacion) {
      decision = { confianza: 1, continuarFlujo: false, consultaCatalogo: { necesaria: false },
        respuestaConversacional: 'Perfecto. Te lo muestro enseguida.', ...interpretacion };
      // Reproduce la recarga entre mensajes sin conservar variables temporales.
      estado = JSON.parse(JSON.stringify(estado));
      return modulo.exports.responderEventoEntrante({ channelUserId: 'progreso', text });
    },
  };
}

for (const accion of ['confirmar', 'agregar']) test(`aceptar cotizacion (${accion}) ejecuta carrito, datos, pago y resumen sin depender de continuarFlujo`, async () => {
  const inicial = crearEstadoInicial();
  resolverConsultaCatalogo('PRUEBA ADULTO 30kg', inicial, catalogo,
    { intencion: 'consulta_producto', accion: 'consultar', confianza: 1, producto });
  assert.equal(inicial.carrito.length, 0);
  inicial.ultimaPreguntaAsistente = '¿Lo dejamos en dos PRUEBA ADULTO de 30 kg para tu pedido?';
  inicial.entrega = { tipo: 'domicilio' };
  inicial.datosDomicilio = { direccion: 'Calle 20 # 10-15' };
  const f = flujo(inicial);
  const aceptada = await f.turno('si', { intencion: accion === 'agregar' ? 'pedido_producto' : 'confirmacion', accion });
  assert.equal(f.estado.carrito.length, 1, aceptada);
  assert.equal(f.estado.carrito[0].cantidad, 2);
  assert.match(aceptada, /Total: \$280\.000/);
  assert.match(aceptada, /\?/);
  assert.ok(f.consultas > 0);
  const datos = await f.turno('Cliente Prueba\n1000000000\ncliente@example.com\n3000000000', {
    intencion: 'datos_envio', datosCliente: { nombre: 'Cliente Prueba', cedula: '1000000000',
      correo: 'cliente@example.com', celular: '3000000000' },
  });
  assert.match(datos, /pago/i);
  const pago = await f.turno('efectivo', { intencion: 'metodo_pago', entrega: { metodoPago: 'efectivo' } });
  assert.match(pago, /Total: \$280\.000/);
  assert.match(pago, /Método de pago: efectivo/);
  assert.match(pago, /finalizamos|confirmar/i);
  assert.equal(f.estado.pedidoConfirmado, false);
  const carrito = await f.turno('No, muéstrame el carrito', { intencion: 'otro' });
  assert.match(carrito, /PRUEBA ADULTO/);
  assert.match(carrito, /Total: \$280\.000/);
  assert.equal(f.estado.pedidoConfirmado, false);
  // Consultar el carrito no sustituye la confirmacion pendiente por una compra nueva.
  const cierre = await f.turno('si', { intencion: 'confirmacion', accion: 'confirmar' });
  assert.equal(f.estado.pedidoConfirmado, true, cierre);
  assert.match(cierre, /280\.000/);
  assert.equal(f.estado.carrito.length, 1);
});

test('mostrar carrito vacio da estado real y no promete un resumen inexistente', async () => {
  const f = flujo(crearEstadoInicial());
  const respuesta = await f.turno('muestrame el carrito', { intencion: 'otro' });
  assert.match(respuesta, /carrito está vacío/);
  assert.equal(f.consultas, 0);
});

test('un si ambiguo o una consulta de precio no aceptan automaticamente una cotizacion', async () => {
  const estado = crearEstadoInicial();
  estado.productosConsultados = [{ ...producto, peso: '30kg', precio: 140000 }];
  estado.ultimaPreguntaAsistente = '¿Quieres consultar otra referencia o ver otro peso?';
  const f = flujo(estado);
  await f.turno('si', { intencion: 'otro' });
  await f.turno('cuanto vale?', { intencion: 'consulta_producto', accion: 'consultar' });
  assert.equal(f.estado.carrito.length, 0);
  assert.equal(f.consultas, 0);
});

test('confirmar avance con carrito sin banderas pendientes ejecuta entrega', async () => {
  const estado = crearEstadoInicial();
  estado.carrito = [{ ...producto, peso: '30kg', precio: 140000 }];
  const f = flujo(estado);
  const respuesta = await f.turno('No asi esta bien', { intencion: 'confirmacion', accion: 'confirmar' });
  assert.match(respuesta, /domicilio|recoger/i);
  assert.match(respuesta, /280\.000/);
  assert.equal(f.estado.pedidoConfirmado, false);
});
