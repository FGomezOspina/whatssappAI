const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { construirSolicitudInterprete } = require('../src/services/aiContextOptimizer');

test('la decision semantica precede al catalogo y una duda nunca abre herramientas', async () => {
  const archivo = require.resolve('../src/services/conversationService');
  const localRequire = createRequire(archivo);
  const estado = crearEstadoInicial();
  const historial = [{ direction: 'outbound', body: '¿Cómo quieres recibir tu compra?' }];
  const consultas = [];
  let decision;
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'tenant-semantic', vertical: 'petshop' }) },
    '../conversation/conversationStore': {
      obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => historial,
      guardarConversacionPersistida: async () => {},
    },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      assert.equal(args.catalogo.length, 0);
      assert.equal(args.historialReciente, historial);
      if (!args.clasificacion.decisionHerramientas) return null;
      return decision;
    } },
    './catalogContextService': { seleccionarCatalogoParaIA: async args => {
      consultas.push(args);
      return { catalogo: [], metadata: {} };
    } },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './humanizer': { humanizarRespuesta: async (_mensaje, base) => base },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    require: name => mocks[name] || localRequire(name), module: modulo, process,
    console: { log() {}, error() {} },
  });
  for (const mensaje of ['Necesito un domicilio', 'Quiero hacer un pedido', 'Gracias, son muy amables', 'Mándamelo para Cuba', 'No logro explicarme']) {
    decision = { consultaCatalogo: { necesaria: false }, continuarFlujo: false,
      respuestaConversacional: 'Respuesta contextual de prueba', producto: { marca: 'RESIDUAL' } };
    estado.carrito = [{ referencia: 'RESIDUAL', precio: 1000, cantidad: 1 }];
    const respuesta = await modulo.exports.responderEventoEntrante({ channelUserId: 'test', text: mensaje });
    assert.equal(respuesta, decision.respuestaConversacional);
    assert.equal(consultas.length, 0);
    assert.equal(estado.carrito.length, 1);
  }
  // Regresion real: el modelo puede continuar un servicio sin necesitar productos.
  for (const mensaje of ['Para solicitar un domicilio por favor', 'Deseo coordinar una entrega', 'Quiero iniciar una compra']) {
    Object.assign(estado, crearEstadoInicial());
    estado.esperandoMarca = true; // Estado residual de la respuesta defectuosa.
    decision = { consultaCatalogo: { necesaria: false }, continuarFlujo: true,
      intencion: 'datos_envio', entrega: { tipo: 'domicilio' },
      respuestaConversacional: 'Cuéntame qué necesitas y te ayudo con tu pedido.' };
    const respuesta = await modulo.exports.responderEventoEntrante({ channelUserId: 'test', text: mensaje });
    assert.equal(respuesta, decision.respuestaConversacional);
    assert.doesNotMatch(respuesta, /no manejamos|marcas|llama.*atenci[oó]n/i);
    assert.equal(consultas.length, 0);
    assert.equal(estado.entrega.tipo, 'domicilio');
  }
  for (decision of [null, {}, { consultaCatalogo: { necesaria: true, consulta: '' } }]) {
    const respuestaFallo = await modulo.exports.responderEventoEntrante({ channelUserId: 'test', text: 'mensaje ambiguo' });
    if (decision === null) {
      assert.match(respuestaFallo, /problema temporal/);
      assert.doesNotMatch(respuestaFallo, /detalle|confirmes|contarme/);
    }
    assert.equal(consultas.length, 0);
  }
  decision = { consultaCatalogo: { necesaria: true, consulta: 'PRODUCTO SINTETICO 3kg' } };
  estado.carrito = [];
  const sinResultados = await modulo.exports.responderEventoEntrante({ channelUserId: 'test', text: '¿Cuánto vale el producto que mencioné?' });
  assert.equal(consultas.length, 1);
  assert.equal(consultas[0].mensaje, 'PRODUCTO SINTETICO 3kg');
  assert.equal(consultas[0].catalogo.length, 0);
  assert.equal(Object.keys(consultas[0].estado).length, 0);
  assert.doesNotMatch(sinResultados, /RESIDUAL/);

});

test('el prompt de herramientas conserva contexto y no aporta catalogo ni clasificacion heuristica', () => {
  const solicitud = construirSolicitudInterprete({ mensaje: 'continúa', estado: {
    esperandoConfirmacionPedido: true, carrito: [{ referencia: 'TEST', cantidad: 1 }],
  }, historialReciente: [{ direction: 'outbound', body: '¿Confirmas el pedido?' }],
  clasificacion: { decisionHerramientas: true, perfilContexto: 'pedido', limiteHistorial: 12 }, model: 'test' });
  assert.match(solicitud.promptBase, /consultaCatalogo/);
  assert.match(solicitud.promptBase, /continuarFlujo/);
  assert.match(solicitud.promptBase, /No copies todo el historial ni productos residuales/);
});

test('recupera cada producto con una consulta independiente sin fusionar atributos', async () => {
  const archivo = require.resolve('../src/services/catalogContextService');
  const localRequire = createRequire(archivo);
  const queries = [];
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    require: name => name === '../repositories/productRepository' ? {
      buscarProductosCatalogoCliente: async (_cliente, { query }) => {
        queries.push(query);
        return { catalogo: [], metadata: {} };
      },
    } : localRequire(name), module: modulo, process, console: { log() {} },
  });
  await modulo.exports.seleccionarCatalogoParaIA({ consultas: ['alimento perro adulto', 'arena maiz 20kg'],
    clasificacion: { requiereBusquedaProducto: true }, cliente: { id: 'synthetic' } });
  assert.equal(queries.length, 2);
  assert.match(queries[0], /alimento/);
  assert.doesNotMatch(queries[0], /arena|20kg/);
  assert.match(queries[1], /arena/);
  assert.doesNotMatch(queries[1], /adulto/);
});
