const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');

test('consulta conjunta no niega spray y deja duración pendiente sin cotizar BRAVECTO', async () => {
  const archivo = require.resolve('../src/services/conversationService');
  const req = createRequire(archivo);
  const catalogo = require('../productos.json').filter(m => ['CUTAMYCON', 'BRAVECTO'].includes(m.marca));
  const estado = crearEstadoInicial();
  const solicitudes = [
    { marca: 'CUTAMYCON', referencia: 'CUTAMYCON SPRAY', textoVisible: 'cutamycon spray', presentacion: 'spray', cantidad: 1 },
    { marca: 'BRAVECTO', referencia: 'BRAVECTO', textoVisible: 'bravecto perro 7kg', presentacion: '7kg', especie: 'perro', cantidad: 1 },
  ];
  let contexto;
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'synthetic', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado, obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async () => {} },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo, resultadosPorProducto: solicitudes.map(s => ({ catalogo: catalogo.filter(m => m.marca === s.marca) })), metadata: {} }) },
    './aiInterpreter': { interpretarMensajeCliente: async args => args.clasificacion.decisionHerramientas
      ? { intencion: 'consulta_producto', accion: 'consultar', consultaCatalogo: { necesaria: true, consulta: 'cutamycon spray y bravecto perro 7kg' }, productos: solicitudes }
      : { intencion: 'consulta_producto', accion: 'consultar', confianza: 1, producto: solicitudes.find(s => args.mensaje.toLowerCase().includes(s.marca.toLowerCase())) } },
    './humanizer': { humanizarRespuesta: async (_m, base, opciones) => { contexto = opciones; return base; } },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || req(n), module: modulo, process, console: { log() {}, error() {} } });
  const respuesta = await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text: 'Tiene cutamycon spray y bravecto perro 7kg' });
  assert.doesNotMatch(respuesta, /no tengo.*spray|no.*presentación en spray/i);
  assert.equal(contexto.productoAutonomo.resultados.find(r => r.solicitud.marca === 'CUTAMYCON').solicitud.presentacion, null);
  assert.equal(contexto.productoAutonomo.resultados.find(r => r.solicitud.marca === 'BRAVECTO').aclaracion.campo, 'duracion');
  assert.ok(estado.productosConsultados.every(p => p.marca === 'CUTAMYCON'));
  assert.equal(estado.productosConsultados.length, 2);
  assert.equal(estado.carrito.length, 0);
});
