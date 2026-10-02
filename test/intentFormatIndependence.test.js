const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { _internals: { normalizarInterpretacion } } = require('../src/services/aiInterpreter');
const productos = ['ALFAPRUEBA', 'BETAPRUEBA'].map(marca => ({ marca, referencia: marca, presentacion: '1kg', cantidad: 1 }));
const catalogo = productos.map((p, i) => ({ marca: p.marca, referencias: [{ nombre: p.referencia,
  categoria: 'comida', especie: 'perro', presentaciones: [{ peso: p.presentacion, precio: 10000 + i * 1000 }] }] }));

async function ejecutar({ mensaje, decision, revision, estado = crearEstadoInicial() }) {
  const archivo = require.resolve('../src/services/conversationService');
  const req = createRequire(archivo);
  let revisiones = 0, consultas = 0;
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'synthetic', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado, obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async () => {} },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => { consultas++; return { catalogo, metadata: {} }; } },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      if (args.clasificacion.revisionLista) { revisiones++; return revision || decision; }
      if (args.clasificacion.decisionHerramientas) return decision;
      return { ...decision, producto: productos.find(p => args.mensaje.includes(p.marca)) || productos[0], productos: [] };
    } },
    './humanizer': { humanizarRespuesta: async (_m, base) => base },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || req(n), module: modulo, process, console: { log() {}, error() {} } });
  const respuesta = await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text: mensaje });
  return { respuesta, estado, revisiones, consultas };
}
const consultar = { intencion: 'consulta_producto', accion: 'consultar', confianza: 1,
  consultaCatalogo: { necesaria: true, consulta: 'ALFAPRUEBA 1kg y BETAPRUEBA 1kg' } };
for (const mensaje of [
  '¿Cuánto valen ALFAPRUEBA 1kg y BETAPRUEBA 1kg?',
  'Buenas tardes\nMe cotizas por favor\nALFAPRUEBA 1kg\nY BETAPRUEBA 1kg\nGracias',
  'El otro día mi perro jugó toda la tarde y luego se quedó dormido. Mi mamá me pidió preguntar cuánto valen ALFAPRUEBA 1kg y BETAPRUEBA 1kg, solo estamos comparando precios por ahora.',
]) test(`cotización múltiple completa independiente del formato: ${mensaje.slice(0, 35)}`, async () => {
  const r = await ejecutar({ mensaje, decision: { ...consultar, solicitudesProductoDetectadas: 2, producto: productos[0], productos: [productos[0]] },
    revision: { ...consultar, solicitudesProductoDetectadas: 2, productos } });
  assert.equal(r.revisiones, 1);
  assert.equal(r.estado.carrito.length, 0);
  assert.equal(r.estado.ultimaSolicitudProductos.length, 2, r.respuesta);
  assert.ok(r.estado.ultimaSolicitudProductos.every(p => p.estado === 'identificado'));
});

test('un solo producto en muchas líneas no provoca una revisión de lista', async () => {
  const r = await ejecutar({ mensaje: 'Buenas tardes\nMi perro come ALFAPRUEBA\n¿cuánto cuesta el de 1kg?\nMuchas gracias',
    decision: { ...consultar, solicitudesProductoDetectadas: 1, producto: productos[0], productos: [productos[0]] } });
  assert.equal(r.revisiones, 0);
  assert.equal(r.estado.carrito.length, 0);
  assert.match(r.respuesta, /10[.,]000/);
});

for (const [mensaje, intencion, respuesta] of [
  ['Ayer compré ALFAPRUEBA en otra tienda.\nMi perro tiró el plato.\nNos hizo reír mucho, solo quería contártelo.', 'otro', '¡Vaya travesura!'],
  ['Mi perro se aburre de la comida y me gustaría una recomendación, ¿qué datos necesitas?', 'recomendacion', '¿Qué edad tiene y qué tipo de alimento buscas?'],
  ['Gracias por la ayuda, por ahora no necesito comprar nada.', 'agradecimiento', 'Con mucho gusto.'],
]) test(`intención conversacional conserva el pedido: ${intencion}`, async () => {
  const estado = crearEstadoInicial();
  estado.carrito = [{ marca: 'RESUELTO', referencia: 'RESUELTO', peso: '1kg', precio: 20000, cantidad: 2 }];
  const anterior = JSON.stringify(estado.carrito);
  const r = await ejecutar({ mensaje, estado, decision: { intencion, accion: intencion === 'recomendacion' ? 'consultar' : null,
    confianza: 1, solicitudesProductoDetectadas: intencion === 'recomendacion' ? 1 : 0,
    consultaCatalogo: { necesaria: false }, continuarFlujo: false, respuestaConversacional: respuesta } });
  assert.equal(r.consultas, 0);
  assert.equal(r.respuesta, respuesta);
  assert.equal(JSON.stringify(r.estado.carrito), anterior);
});

test('una extracción que sigue incompleta no ejecuta una compra parcial silenciosa', async () => {
  const r = await ejecutar({ mensaje: 'Quiero ALFAPRUEBA y BETAPRUEBA de 1kg',
    decision: { ...consultar, intencion: 'pedido_producto', accion: 'agregar', solicitudesProductoDetectadas: 2,
      producto: productos[0], productos: [productos[0]] } });
  assert.equal(r.revisiones, 1);
  assert.equal(r.consultas, 0);
  assert.equal(r.estado.carrito.length, 0);
  assert.match(r.respuesta, /todos los productos/);
});

test('el contador semántico conserva cero y rechaza conteos inválidos', () => {
  for (const n of [0, 1, 3]) assert.equal(normalizarInterpretacion({ solicitudesProductoDetectadas: n }).solicitudesProductoDetectadas, n);
  for (const n of [undefined, -1, 1.5, 'dos']) assert.equal(normalizarInterpretacion({ solicitudesProductoDetectadas: n }).solicitudesProductoDetectadas, null);
});

test('revisar productos omitidos no convierte una cotización en compra', async () => {
  const r = await ejecutar({ mensaje: 'Solo quiero saber cuánto valen ALFAPRUEBA y BETAPRUEBA de 1kg',
    decision: { ...consultar, solicitudesProductoDetectadas: 2, producto: productos[0], productos: [productos[0]] },
    revision: { ...consultar, intencion: 'pedido_producto', accion: 'agregar', solicitudesProductoDetectadas: 2, productos } });
  assert.equal(r.estado.carrito.length, 0);
  assert.equal(r.estado.ultimaSolicitudProductos.length, 2);
  assert.ok(r.estado.ultimaSolicitudProductos.every(p => p.accion === 'consultar'));
});
