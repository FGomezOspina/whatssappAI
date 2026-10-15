const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
const { respuestaParaHistorial } = require('../src/utils/responseMessages');
const { extraerPesoTexto } = require('../src/utils/text');

function familia(marca) {
  return [{ marca, referencias: [{ nombre: `${marca} ADUL FRANGO`, especie: 'gato', categoria: 'comida', etapa: 'adulto',
    presentaciones: [{ peso: '1kg', precio: 27400 }, { peso: '3kg', precio: 67900 }, { peso: '10.1kg', precio: 178600 }] }] }];
}

for (const mensaje of ['x10.1kg', 'x10,1kg', 'la de 10.1kg']) {
  test(`selección pendiente sin interpretación: ${mensaje} nunca elige 1kg`, () => {
    const catalogo = familia('NUBELIA');
    const estado = crearEstadoInicial();
    estado.ultimaSeleccion = { marca: 'NUBELIA', referencia: 'NUBELIA ADUL FRANGO', presentacion: null, cantidad: 1 };
    const respuesta = resolverConsultaCatalogo(mensaje, estado, catalogo);
    assert.equal(estado.carrito.length, 1, respuesta);
    assert.equal(estado.carrito[0].peso, '10.1kg');
    assert.equal(estado.carrito[0].precio, 178600);
  });
}

function escenario(marca, compraFinal, { dosFotos = false, repetirLista = false, deltaEnvio = false } = {}) {
  const catalogo = familia(marca);
  const arena = { marca: 'ARENA KING CAT', referencia: 'ARENA KING CAT', categoria: 'arena_sustrato', especie: 'gato',
    observado: { nombre: 'ARENA KING CAT', presentacion: '25kg', confianzaIdentidad: .99, confianzaPresentacion: .99 }, solicitud: {} };
  if (dosFotos) catalogo.push({ marca: arena.marca, referencias: [{ nombre: arena.referencia, categoria: arena.categoria,
    especie: 'gato', presentaciones: [{ peso: '25kg', precio: 62900 }] }] });
  let estado = crearEstadoInicial();
  const historial = [];
  const base = { marca, referencia: `${marca} ADUL FRANGO`, especie: 'gato', categoria: 'comida', etapa: 'adulto',
    observado: { nombre: `${marca} FRANGO ARROZ ADULTO`, presentacion: null, confianzaIdentidad: .99, confianzaPresentacion: 0 }, solicitud: {} };
  const archivo = require.resolve('../src/services/conversationService');
  const req = createRequire(archivo), modulo = { exports: {} };
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'short-weight-test', vertical: 'petshop' }) },
    '../conversation/conversationStore': {
      obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => historial,
      guardarConversacionPersistida: async (_id, nuevo, meta) => {
        estado = JSON.parse(JSON.stringify(nuevo));
        if (!meta.respuesta) return;
        estado.ultimaPreguntaAsistente = respuestaParaHistorial(meta.respuesta);
        for (const p of estado.historialProductosConsultados || []) p.pendienteRespuesta = false;
        historial.push({ direction: 'inbound', body: meta.mensaje }, { direction: 'outbound', body: estado.ultimaPreguntaAsistente });
      },
    },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './mediaProcessor': { procesarMultimedia: async e => ({ text: e.text, imageUrl: e.media?.url || null }) },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo, metadata: {} }),
      seleccionarCatalogoRefinadoVision: () => ({ catalogo, metadata: {} }) },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      const imagen = args.imageUrls?.length;
      const envio = /me lo[s]? envias/.test(args.mensaje);
      const agregar = envio || compraFinal && args.mensaje === 'x10.1kg';
      if (dosFotos && (imagen || repetirLista && args.clasificacion.decisionHerramientas && !envio)) {
        const productos = imagen === 1
          ? [args.imageUrls[0].includes('arena') ? arena : base] : [arena, base];
        return { accion: 'consultar', intencion: 'consulta_producto', confianza: .99,
          productos: structuredClone(productos), producto: productos.length === 1 ? structuredClone(productos[0]) : null,
          consultaCatalogo: { necesaria: true, consulta: `${marca} adulto frango y arena king cat` } };
      }
      return { accion: agregar ? 'agregar' : 'consultar', intencion: agregar ? 'pedido_producto' : 'consulta_producto', confianza: .99,
        ...(envio ? { carrito: { operacion: 'agregar', cantidadDelta: deltaEnvio ? 1 : null,
          aplicaAlUltimoProducto: true } } : {}),
        // El router puede omitir la identidad de una respuesta corta.
        producto: imagen ? structuredClone(base) : args.clasificacion.decisionHerramientas
          ? { presentacion: extraerPesoTexto(args.mensaje) }
          : { ...structuredClone(base), observado: undefined, presentacion: extraerPesoTexto(args.mensaje) },
        consultaCatalogo: { necesaria: Boolean(imagen || !args.clasificacion.decisionHerramientas),
          consulta: `${marca} adulto frango` } };
    } },
    './humanizer': { humanizarRespuesta: async (_mensaje, respuesta) => respuesta },
  };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { module: modulo, require: n => mocks[n] || req(n), process, console: { log() {}, error() {} } });
  return { estado: () => estado,
    enviarDos: text => modulo.exports.responderEventosEntrantes(['fixture:arena', 'fixture:adult-cat'].map((url, i) => ({
      channelUserId: 'short-weight', text: i ? '' : text, media: { type: 'image', url } }))),
    enviar: (text, imagen = false) => modulo.exports.responderEventoEntrante({
    channelUserId: 'short-weight', text, ...(imagen ? { media: { type: 'image', url: 'fixture:adult-cat' } } : {}),
  }) };
}

for (const repetirLista of [false, true]) test(`dos fotos: x10kg completa solo la pendiente, router repite lista=${repetirLista}`, async () => {
  const c = escenario('MAX CAT', false, { dosFotos: true, repetirLista });
  const primera = respuestaParaHistorial(await c.enviarDos('Para la dirección indicada, ¿puedo pagar con tarjeta?'));
  assert.match(primera, /62\.900/);
  assert.match(primera, /1kg: \$27\.400[\s\S]*3kg: \$67\.900[\s\S]*10\.1kg: \$178\.600/);
  for (const mensaje of ['x10kg', 'x10kg']) {
    const respuesta = respuestaParaHistorial(await c.enviar(mensaje));
    assert.match(respuesta, /10\.1kg.*178\.600/);
    assert.doesNotMatch(respuesta, /Qué presentación|27\.400|67\.900/i);
    assert.equal(c.estado().productosConsultados.length, 2, respuesta);
    assert.ok(c.estado().productosConsultados.some(p => p.peso === '25kg' && p.precio === 62900));
    assert.equal(c.estado().ultimaSolicitudProductos.filter(p => p.estado === 'pendiente').length, 0);
    assert.equal(c.estado().carrito.length, 0);
  }
  const envio = respuestaParaHistorial(await c.enviar('me los envias por favor'));
  assert.equal(c.estado().carrito.length, 2, envio);
  assert.ok(c.estado().carrito.every(p => p.cantidad === 1));
  assert.match(envio, /241\.500/);
});

test('aceptar el envío de una cotización no suma una segunda unidad aunque el router proponga delta=1', async () => {
  const c = escenario('MAX CAT', false, { deltaEnvio: true });
  await c.enviar('Qué precio tiene', true);
  await c.enviar('x10kg');
  const respuesta = respuestaParaHistorial(await c.enviar('me lo envias por favor'));
  assert.equal(c.estado().carrito.length, 1, respuesta);
  assert.equal(c.estado().carrito[0].cantidad, 1);
  assert.equal(c.estado().carrito[0].peso, '10.1kg');
  assert.doesNotMatch(respuesta, /357\.200/);
});

for (const marca of ['MAX CAT', 'NUBELIA']) for (const compra of [false, true]) {
  test(`${marca}: foto → x10kg → x10kg → x10.1kg, compra=${compra}`, async () => {
    const c = escenario(marca, compra);
    const primera = respuestaParaHistorial(await c.enviar('Qué precio tiene', true));
    assert.match(primera, /1kg: \$27\.400[\s\S]*3kg: \$67\.900[\s\S]*10\.1kg: \$178\.600/);
    for (const mensaje of ['x10kg', 'x10kg', 'x10.1kg']) {
      const respuesta = respuestaParaHistorial(await c.enviar(mensaje));
      assert.match(respuesta, /10\.1kg.*178\.600/);
      assert.doesNotMatch(respuesta, /27\.400|67\.900|Qué presentación|opción cercana|no encuentro/i);
      const items = compra && mensaje === 'x10.1kg' ? c.estado().carrito : c.estado().productosConsultados;
      assert.equal(items.length, 1, respuesta);
      assert.equal(items[0].peso, '10.1kg');
      assert.equal(items[0].cantidad, 1);
      assert.equal(items[0].precio, 178600);
    }
    assert.equal(c.estado().carrito.length, compra ? 1 : 0);
  });
}
