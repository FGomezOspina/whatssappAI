const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { _internals: { normalizarInterpretacion } } = require('../src/services/aiInterpreter');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
const alimento = { marca: 'PRO PLAN', referencias: [
  { nombre: 'PRO PLAN FELINE EN', especie: 'perro', categoria: 'comida', presentaciones: [{ peso: '1.5g', precio: 113600 }] },
  { nombre: 'PRO PLAN GATO ADULT', especie: 'gato', categoria: 'comida', presentaciones: [{ peso: '3kg', precio: 175600 }] },
] };
const arena = { marca: 'SINTETICA', referencias: [{ nombre: 'ARENA MAIZ', categoria: 'arena_sustrato', presentaciones: [{ peso: '20kg', precio: 80000 }] }] };
const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'pedido' };

test('conserva sigla de referencia y reconoce especie en nombre pese a metadatos inconsistentes', () => {
  const resultado = validarCoincidenciaProducto({ mensaje: 'proplan para gatos EN', catalogo: [alimento], catalogoCandidatos: [alimento], clasificacion });
  assert.equal(resultado.nivel, 'alta');
  assert.equal(resultado.coincidencia.referenciaCatalogo, 'PRO PLAN FELINE EN');
  assert.equal(resultado.coincidencia.presentaciones[0].peso, '1.5g'); // no inventar una unidad corregida
  const sinLinea = validarCoincidenciaProducto({ mensaje: 'proplan gatos EN', catalogo: [{ ...alimento, referencias: [alimento.referencias[1]] }], clasificacion });
  assert.equal(sinLinea.nivel, 'baja');
  assert.equal(sinLinea.alternativas.length, 0);
});

test('cotiza ambas solicitudes con candidatos separados y sin mezclar sus pesos', async () => {
  const archivo = require.resolve('../src/services/conversationService');
  const localRequire = createRequire(archivo);
  const estado = crearEstadoInicial();
  const solicitudes = [
    { marca: 'PRO PLAN', textoVisible: 'proplan gatos EN', especie: 'gato', linea: 'EN' },
    { textoVisible: 'arena maiz 20kg', categoria: 'arena_sustrato', presentacion: '20kg' },
  ];
  let sinArena = false;
  let decisionResidual = undefined;
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'synthetic', vertical: 'petshop' }) },
    '../conversation/conversationStore': {
      obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [],
      guardarConversacionPersistida: async () => {},
    },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo: [alimento, arena],
      resultadosPorProducto: [{ catalogo: [alimento] }, { catalogo: sinArena ? [] : [arena] }], metadata: {} }) },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      if (args.clasificacion.decisionHerramientas) return { intencion: 'consulta_producto', accion: 'consultar',
        consultaCatalogo: { necesaria: true, consulta: 'proplan gatos EN y arena maiz 20kg' }, productos: solicitudes };
      const esAlimento = args.mensaje.includes('proplan');
      assert.equal(args.catalogo.length, sinArena && !esAlimento ? 0 : 1);
      return normalizarInterpretacion({ consultaCatalogo: decisionResidual, intencion: 'consulta_producto', accion: 'consultar', confianza: 0.99, producto: esAlimento
        ? { ...solicitudes[0], referencia: 'PRO PLAN FELINE EN' }
        : { ...solicitudes[1], marca: 'SINTETICA', referencia: 'ARENA MAIZ' } });
    } },
    './humanizer': { humanizarRespuesta: async (_mensaje, base) => base },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: name => mocks[name] || localRequire(name), module: modulo, process, console: { log() {}, error() {} } });
  const respuesta = await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text: 'Qué precio tiene el proplan para gatos EN? Y arena de maíz de 20 kilos' });
  assert.match(respuesta, /FELINE EN/);
  assert.doesNotMatch(respuesta, /GATO ADULT|175\.600/);
  assert.match(respuesta, /113\.600/);
  assert.match(respuesta, /ARENA MAIZ/);
  assert.match(respuesta, /80\.000/);
  assert.equal(estado.carrito.length, 0);
  assert.equal(estado.productosConsultados.length, 2, respuesta + JSON.stringify(estado.productosConsultados));
  Object.assign(estado, crearEstadoInicial());
  decisionResidual = { necesaria: false };
  const permisoPreservado = await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic',
    text: 'Precio proplan gatos EN y arena maiz 20kg' });
  assert.match(permisoPreservado, /113\.600/);
  assert.match(permisoPreservado, /80\.000/);
  assert.doesNotMatch(permisoPreservado, /No pude resolver/);
  Object.assign(estado, crearEstadoInicial());
  sinArena = true;
  const parcial = await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic',
    text: 'Precio proplan gatos EN y arena maiz 20kg' });
  assert.match(parcial, /113\.600/);
  assert.match(parcial, /arena maiz 20kg/);
  assert.doesNotMatch(parcial, /80\.000|GATO ADULT/);
  assert.equal(estado.carrito.length, 0);

});


test('normalizar distingue ausencia de decision y decisiones semanticas explicitas', () => {
  assert.equal(normalizarInterpretacion({}).consultaCatalogo.necesaria, null);
  assert.equal(normalizarInterpretacion({ consultaCatalogo: { necesaria: false } }).consultaCatalogo.necesaria, false);
  assert.equal(normalizarInterpretacion({ consultaCatalogo: { necesaria: true } }).consultaCatalogo.necesaria, true);
});
