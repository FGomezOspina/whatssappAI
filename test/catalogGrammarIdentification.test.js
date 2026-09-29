const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { normalizarMarcasCatalogo } = require('../src/utils/text');
const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
const { _internals: { seleccionarCatalogoLocal } } = require('../src/services/catalogContextService');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { respuestaParaHistorial } = require('../src/utils/responseMessages');
const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'pedido', requiereBusquedaProducto: true };
const catalogoReal = require('../productos.json').filter(m => ['BR', 'BR CAT'].includes(m.marca));
function catalogoPara(raiz) {
  return [
    { marca: raiz, referencias: [{ nombre: `${raiz} WILD CAT ADULT`, especie: 'gato', presentaciones: [{ peso: '3kg', precio: 99900 }] }] },
    { marca: `${raiz} CAT`, referencias: [
      { nombre: `${raiz} CAT ADUL BOLA PELO`, especie: 'gato', etapa: 'adulto', categoria: 'comida', subcategoria: 'concentrado',
        presentaciones: [{ peso: '1kg', precio: 30500 }, { peso: '3kg', precio: 88900 }] },
      { nombre: `${raiz} CAT ADUL POLLO`, especie: 'gato', etapa: 'adulto', categoria: 'comida',
        presentaciones: [{ peso: '3kg', precio: 70000 }] },
    ] },
  ];
}

for (const raiz of ['BR', 'NUTRIALFA']) test(`marca y caracteristica se resuelven sin aliases de referencia: ${raiz}`, () => {
  const catalogo = raiz === 'BR' ? catalogoReal : catalogoPara(raiz);
  for (const descripcion of ['bola de pelos', 'bolas de pelo', 'bola pelo', 'hairball']) {
    const mensaje = `Una bolsa de 3 kilos de ${raiz} for Cats ${descripcion}`;
    const candidatos = seleccionarCatalogoLocal({ catalogo, mensaje, clasificacion }).catalogo;
    const resultado = validarCoincidenciaProducto({ mensaje, catalogo: candidatos, clasificacion,
      interpretacion: { confianza: .98, producto: { marca: `${raiz} for Cats`, condiciones: ['bola_pelo'], presentacion: '3kg' } } });
    assert.equal(resultado.nivel, 'alta', `${mensaje}: ${JSON.stringify(resultado)}`);
    assert.equal(resultado.coincidencia.referencia, `${raiz} CAT ADUL BOLA PELO`);
    assert.equal(resultado.coincidencia.presentaciones.find(p => /3/.test(p.peso)).precio, 88900);
  }
});

test('la normalizacion de marca depende del catalogo y conserva las variantes restantes', () => {
  assert.equal(normalizarMarcasCatalogo('NOVA for Dogs renal 3kg', [{ marca: 'NOVA DOG' }]), 'NOVA DOG renal 3kg');
  assert.equal(normalizarMarcasCatalogo('NOVA for Dogs renal 3kg', [{ marca: 'OTRA DOG' }]), 'NOVA for Dogs renal 3kg');
  assert.equal(normalizarMarcasCatalogo('BR for Cats Wild 3kg', catalogoReal), 'BR CAT Wild 3kg');
  const sinBola = catalogoPara('NUTRIALFA').map(m => ({ ...m, referencias: m.referencias.filter(r => !r.nombre.includes('BOLA')) }));
  const resultado = validarCoincidenciaProducto({ mensaje: 'NUTRIALFA for Cats bola de pelos 3kg', catalogo: sinBola, clasificacion });
  assert.notEqual(resultado.nivel, 'alta');
  assert.equal(resultado.coincidencia, null);
});

test('lista con otra referencia pendiente agrega la bolsa correcta y conserva entrega', async () => {
  let estado = crearEstadoInicial();
  const catalogo = catalogoPara('NUTRIALFA');
  const solicitudes = [
    { marca: 'NUTRIALFA for Cats', textoVisible: 'NUTRIALFA for Cats bola de pelos', condiciones: ['bola_pelo'], especie: 'gato', presentacion: '3kg', cantidad: 1 },
    { marca: 'NOEXISTE', textoVisible: 'NOEXISTE snack', cantidad: 1 },
  ];
  const archivo = require.resolve('../src/services/conversationService'), req = createRequire(archivo), modulo = { exports: {} };
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'grammar-test', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado, obtenerHistorialRecientePersistido: async () => [],
      guardarConversacionPersistida: async (_id, e) => { estado = JSON.parse(JSON.stringify(e)); } },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo, metadata: {},
      resultadosPorProducto: [{ catalogo }, { catalogo: [] }] }) },
    './humanizer': { humanizarRespuesta: async (_m, base) => base },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      const base = { intencion: 'pedido_producto', accion: 'agregar', confianza: .98,
        entrega: { tipo: 'domicilio', direccion: 'Carrera 10 # 20-30 apartamento 205' }, datosCliente: { cedula: '1000000000' } };
      if (args.clasificacion.decisionHerramientas) return { ...base, productos: solicitudes, consultaCatalogo: { necesaria: true, consulta: 'lista' } };
      const producto = args.mensaje.includes('NUTRIALFA') ? { ...solicitudes[0], marca: 'NUTRIALFA CAT', referencia: 'NUTRIALFA CAT ADUL BOLA PELO' } : solicitudes[1];
      return { ...base, producto };
    } },
  };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || req(n), module: modulo, process, console: { log() {}, error() {} } });
  const respuesta = respuestaParaHistorial(await modulo.exports.responderEventoEntrante({ channelUserId: 'test',
    text: 'Por favor para domicilio una bolsa de 3 kilos de NUTRIALFA for Cats bola de pelos y 1 NOEXISTE snack' }));
  assert.equal(estado.carrito.length, 1, respuesta);
  assert.equal(estado.carrito[0].referencia, 'NUTRIALFA CAT ADUL BOLA PELO');
  assert.equal(estado.carrito[0].precio, 88900);
  assert.equal(estado.carrito[0].cantidad, 1);
  assert.equal(estado.datosDomicilio.direccion, 'Carrera 10 # 20-30 apartamento 205');
  assert.match(respuesta, /88\.900/);
});
