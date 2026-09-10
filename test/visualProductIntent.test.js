const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { resolverEvidenciaProducto } = require('../src/services/productEvidenceService');
const { construirSolicitudInterprete } = require('../src/services/aiContextOptimizer');

const catalogo = [{ marca: 'NUTRIVA', referencias: [
  { nombre: 'NUTRIVA ADULTO', especie: 'perro', presentaciones: [
    { peso: '3kg', precio: 31000 }, { peso: '6kg', precio: 58000 },
  ] },
  { nombre: 'NUTRIVA ADULTO RP', especie: 'perro', presentaciones: [{ peso: '3kg', precio: 36000 }] },
  { nombre: 'NUTRIVA CORDERO ADULTO', especie: 'perro', presentaciones: [{ peso: '3kg', precio: 47000 }] },
] }];

function producto(overrides = {}) {
  return { marca: 'NUTRIVA', referencia: 'NUTRIVA ADULTO', etapa: 'adulto', especie: 'perro',
    textoVisible: 'NUTRIVA ADULTO 6kg',
    observado: { nombre: 'NUTRIVA ADULTO', presentacion: '6kg', confianzaIdentidad: 0.98, confianzaPresentacion: 0.98 },
    solicitud: {}, ...overrides };
}

async function conversar(productoInicial, mensaje = '¿Cuánto vale?', opciones = {}) {
  const archivo = require.resolve('../src/services/conversationService');
  const localRequire = createRequire(archivo);
  const estado = crearEstadoInicial();
  const consultas = [];
  let continuacion = false;
  const historial = [{ direction: 'inbound', body: 'Busco la bolsa de 3kg' }];
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'tenant-visual', vertical: 'petshop' }) },
    '../conversation/conversationStore': {
      obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => historial,
      guardarConversacionPersistida: async () => {},
    },
    './mediaProcessor': { procesarMultimedia: async () => ({ text: continuacion ? opciones.continuacion : mensaje, imageUrl: continuacion ? null : 'data:image/png;base64,synthetic' }) },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      assert.equal(args.clasificacion.requiereVision, !continuacion);
      if (args.clasificacion.decisionHerramientas) {
        assert.equal(args.historialReciente, historial);
        assert.equal(args.catalogo.length, 0);
      }
      return { intencion: 'consulta_producto', accion: 'consultar', confianza: 0.98,
        consultaCatalogo: { necesaria: true, consulta: 'NUTRIVA ADULTO 6kg' },
        producto: continuacion ? { marca: 'NUTRIVA', referencia: 'NUTRIVA ADULTO', presentacion: '3kg' }
          : args.clasificacion.decisionHerramientas ? productoInicial : opciones.lectura || productoInicial,
        productos: [] };
    } },
    './catalogContextService': {
      seleccionarCatalogoParaIA: async args => { consultas.push(args); return { catalogo: opciones.catalogo || catalogo, metadata: {} }; },
      seleccionarCatalogoRefinadoVision: () => ({ catalogo: [], metadata: {} }),
    },
    './humanizer': { humanizarRespuesta: async (_mensaje, base) => base },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    require: name => mocks[name] || localRequire(name), module: modulo, process,
    console: { log() {}, error() {} },
  });
  const respuesta = await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text: mensaje });
  let respuestaContinuacion;
  if (opciones.continuacion) {
    continuacion = true;
    respuestaContinuacion = await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text: opciones.continuacion });
  }
  return { respuesta, respuestaContinuacion, estado, consultas };
}

test('texto solicitado gana al peso fotografiado, incluso si el mapeo posterior vuelve al peso visible', async () => {
  const resultado = await conversar(producto({ solicitud: { presentacionTexto: '3kg', cantidadTexto: 2 } }),
    'La foto es de 6 kilos, ¿cuánto cuestan dos bolsas de 3 kilos?', { lectura: producto() });
  assert.match(resultado.consultas[0].mensaje, /3kg/);
  assert.doesNotMatch(resultado.consultas[0].mensaje, /6kg/);
  assert.match(resultado.respuesta, /31\.000/);
  assert.doesNotMatch(resultado.respuesta, /58\.000|36\.000|47\.000|RP|CORDERO/);
  assert.equal(resultado.estado.productosConsultados[0].cantidad, 2);
  assert.equal(resultado.estado.carrito.length, 0);
});

test('imagen completa cotiza solo la identidad y presentacion exactas', async () => {
  const { respuesta, estado } = await conversar(producto());
  assert.match(respuesta, /58\.000/);
  assert.doesNotMatch(respuesta, /31\.000|36\.000|47\.000|RP|CORDERO/);
  assert.equal(estado.productosConsultados.length, 1);
});

test('peso ilegible no cotiza ni infiere la unica presentacion disponible', async () => {
  const { respuesta, estado } = await conversar(producto({
    observado: { nombre: 'NUTRIVA ADULTO', presentacion: '6kg', confianzaIdentidad: 0.98, confianzaPresentacion: 0.2 },
  }), undefined, { catalogo: [{ marca: 'NUTRIVA', referencias: [{ ...catalogo[0].referencias[0], presentaciones: [catalogo[0].referencias[0].presentaciones[0]] }] }] });
  assert.match(respuesta, /Qué presentación necesitas/);
  assert.doesNotMatch(respuesta, /\$|31\.000|58\.000/);
  assert.equal(estado.ultimaSeleccion.referencia, 'NUTRIVA ADULTO');
  assert.equal(estado.ultimaSeleccion.presentacion, null);
  assert.equal(estado.productosConsultados.length, 0);
});

test('contexto vigente gana a la imagen; contexto de otro producto se descarta', async () => {
  const vigente = producto({ solicitud: { contextoVigente: true, presentacionContexto: '3kg' } });
  assert.match((await conversar(vigente)).respuesta, /31\.000/);
  assert.equal(resolverEvidenciaProducto(producto({ solicitud: { contextoVigente: false, presentacionContexto: '3kg' } })).presentacion, '6kg');
  assert.equal(resolverEvidenciaProducto(producto({ solicitud: {
    contextoVigente: true, presentacionContexto: '3kg', presentacionTexto: '9kg',
  } })).presentacion, '9kg');
});

test('ambiguedad visual real pide referencia sin anticipar precios', async () => {
  const incompleto = producto({ referencia: null, textoVisible: 'NUTRIVA', etapa: null,
    observado: { nombre: 'NUTRIVA', presentacion: null, confianzaIdentidad: 0.6, confianzaPresentacion: 0 } });
  const { respuesta, estado } = await conversar(incompleto);
  assert.match(respuesta, /\?/);
  assert.doesNotMatch(respuesta, /\$|31\.000|36\.000|47\.000/);
  assert.equal(estado.carrito.length, 0);
});

test('presentacion solicitada inexistente no se sustituye por la fotografiada', async () => {
  const { respuesta, estado } = await conversar(producto({ solicitud: { presentacionTexto: '9kg' } }), '¿Ese en 9kg?');
  assert.match(respuesta, /no tengo presentación|no.*9kg/i);
  assert.equal(estado.productosConsultados.length, 0);
  assert.equal(estado.carrito.length, 0);
});

test('el router visual recibe instrucciones de evidencia y contexto previo, aunque venga con perfil pedido', () => {
  const solicitud = construirSolicitudInterprete({ mensaje: '¿Cuánto vale?', catalogo: [],
    estado: { ultimaSeleccion: { marca: 'NUTRIVA', referencia: 'NUTRIVA ADULTO', presentacion: '3kg' } },
    clasificacion: { requiereVision: true, decisionHerramientas: true, perfilContexto: 'pedido', limiteHistorial: 12 } });
  assert.match(solicitud.promptBase, /confianzaPresentacion/);
  assert.match(solicitud.promptBase, /texto explicito del cliente > intencion conversacional previa/);
  assert.match(JSON.stringify(solicitud.contexto), /3kg/);
});


test('aclarar presentacion tras foto ilegible conserva consulta sin agregar al carrito', async () => {
  const { respuesta, respuestaContinuacion, estado } = await conversar(producto({
    observado: { nombre: 'NUTRIVA ADULTO', presentacion: null, confianzaIdentidad: 0.98, confianzaPresentacion: 0 },
  }), undefined, { continuacion: 'de 3kg' });
  assert.doesNotMatch(respuesta, /\$/);
  assert.match(respuestaContinuacion, /31\.000/);
  assert.equal(estado.carrito.length, 0);
});

test('respuesta visual sin evidencia de peso no hereda la presentacion elegida del catalogo', async () => {
  const archivo = require.resolve('../src/services/aiInterpreter');
  const localRequire = createRequire(archivo);
  let payload;
  class OpenAI {
    chat = { completions: { create: async args => {
      payload = args;
      return { choices: [{ message: { content: JSON.stringify({
        producto: { marca: 'NUTRIVA', referencia: 'NUTRIVA ADULTO', presentacion: '6kg' },
      }) } }] };
    } } };
  }
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    require: name => name === 'openai' ? OpenAI : localRequire(name), module: modulo,
    process: { env: { OPENAI_API_KEY: 'synthetic' } }, console: { log() {}, warn() {} },
  });
  const resultado = await modulo.exports.interpretarMensajeCliente({ mensaje: 'Precio', estado: {}, catalogo,
    imageUrls: ['data:image/png;base64,synthetic'], clasificacion: { perfilContexto: 'pedido' } });
  assert.match(payload.messages[0].content, /confianzaPresentacion/);
  assert.equal(resultado.producto.presentacion, null);
  assert.equal(resultado.producto.requierePresentacion, true);
});

test('una segunda lectura mejora evidencia visual sin reescribir la solicitud explicita', () => {
  const { resolverEvidenciaInterpretacion } = require('../src/services/productEvidenceService');
  const previa = { producto: producto({ observado: { nombre: 'NUTRIVA ADULTO', confianzaIdentidad: 0.9,
    presentacion: null, confianzaPresentacion: 0 }, solicitud: { presentacionTexto: '3kg' } }) };
  const refinada = { producto: producto() };
  const resultado = resolverEvidenciaInterpretacion(refinada, previa);
  assert.equal(resultado.producto.observado.presentacion, '6kg');
  assert.equal(resultado.producto.presentacion, '3kg');
  assert.equal(resultado.producto.fuentePresentacion, 'texto');
  assert.equal(refinada.producto.solicitud.presentacionTexto, undefined);
});
