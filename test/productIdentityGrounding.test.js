const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'pedido', requiereBusquedaProducto: true };
const mensaje = 'Buenos dias, Para pedir un bulto de cat show delimix adultos de 10 kg';
const catalogo = require('../productos.json').filter(m => ['CAT CHOW', 'BR CAT'].includes(m.marca));
const equivocada = { intencion: 'pedido_producto', accion: 'agregar', confianza: 0.99,
  consultaCatalogo: { necesaria: true, consulta: 'br cat br cat adulto pollo 10kg' },
  producto: { marca: 'BR CAT', referencia: 'BR CAT ADUL POLLO', etapa: 'adulto', presentacion: '10kg', cantidad: 1 } };
function cargar(nombre, mocks) {
  const archivo = require.resolve(nombre);
  const req = createRequire(archivo), modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || req(n),
    module: modulo, process, console: { log() {}, error() {} } });
  return modulo.exports;
}

test('la busqueda del modelo no excluye candidatos respaldados por el mensaje original', async () => {
  const selector = cargar('../src/services/catalogContextService', {
    '../repositories/productRepository': { buscarProductosCatalogoCliente: async (_cliente, { query }) => ({
      catalogo: query.includes('delimix') ? catalogo : catalogo.filter(m => m.marca === 'BR CAT'), metadata: {},
    }) },
  });
  const seleccion = await selector.seleccionarCatalogoParaIA({ mensaje: equivocada.consultaCatalogo.consulta,
    mensajeOriginal: mensaje, clasificacion });
  assert.ok(seleccion.catalogo.some(m => m.marca === 'CAT CHOW' && m.referencias.some(r => r.nombre === 'CAT CHOW DELIMIX')));
  const estado = crearEstadoInicial();
  const servicio = cargar('../src/services/conversationService', {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'test', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async () => {} },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './aiInterpreter': { interpretarMensajeCliente: async () => structuredClone(equivocada) },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => seleccion },
    './humanizer': { humanizarRespuesta: async (_m, base) => base },
  });
  const respuesta = await servicio.responderEventoEntrante({ channelUserId: 'test', text: mensaje });
  assert.equal(estado.carrito.length, 1, respuesta);
  assert.equal(estado.carrito[0].referencia, 'CAT CHOW DELIMIX');
  assert.equal(estado.carrito[0].precio, 164900);
  assert.doesNotMatch(respuesta, /BR CAT|264\.000/);
});

test('un candidato equivocado no alcanza confianza alta aunque el modelo lo afirme', () => {
  const resultado = validarCoincidenciaProducto({ mensaje, catalogo: catalogo.filter(m => m.marca === 'BR CAT'),
    clasificacion, interpretacion: equivocada });
  assert.notEqual(resultado.nivel, 'alta');
  assert.equal(resultado.coincidencia, null);
});

test('la identidad original prevalece tambien para nombres arbitrarios', () => {
  const productos = [
    { marca: 'NUTRIALFA', referencias: [{ nombre: 'NUTRIALFA BOSQUE', especie: 'gato',
      presentaciones: [{ peso: '10kg', precio: 150000 }] }] },
    { marca: 'OTRAMARCA', referencias: [{ nombre: 'OTRAMARCA ADULTO POLLO', especie: 'gato', etapa: 'adulto',
      presentaciones: [{ peso: '10kg', precio: 250000 }] }] },
  ];
  const resultado = validarCoincidenciaProducto({ mensaje: 'Necesito NUTRIALFA BOSQUE para adultos 10kg',
    catalogo: productos, clasificacion, interpretacion: { confianza: 1,
      producto: { marca: 'OTRAMARCA', referencia: 'OTRAMARCA ADULTO POLLO', sabores: ['pollo'], presentacion: '10kg' } } });
  assert.equal(resultado.nivel, 'alta');
  assert.equal(resultado.coincidencia.referencia, 'NUTRIALFA BOSQUE');
});
