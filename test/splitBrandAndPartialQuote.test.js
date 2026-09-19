const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { normalizarMarcasCatalogo } = require('../src/utils/text');
const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
const { _internals: { seleccionarCatalogoLocal } } = require('../src/services/catalogContextService');
const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'pedido', requiereBusquedaProducto: true };

test('marcas separadas conservan la variante con catalogo real y con nombres arbitrarios', () => {
  const real = require('../productos.json');
  for (const variante of ['lavanda', 'citrica']) {
    const mensaje = `free miau ${variante} 10kg`;
    const candidatos = seleccionarCatalogoLocal({ catalogo: real, mensaje, clasificacion }).catalogo;
    const v = validarCoincidenciaProducto({ mensaje, catalogo: candidatos, clasificacion });
    assert.equal(v.nivel, 'alta');
    assert.equal(v.coincidencia.referencia, `FREEMIAU ${variante.toUpperCase()}`);
  }
  const sintetico = [{ marca: 'ARENANUEVA', referencias: ['LAVANDA', 'CITRICA'].map(variante => ({
    nombre: `ARENANUEVA ${variante}`, categoria: 'arena', presentaciones: [{ peso: '10kg', precio: 100 }] })) }];
  const v = validarCoincidenciaProducto({ mensaje: 'arena nueva citrica 10kg', catalogo: sintetico, clasificacion });
  assert.equal(v.coincidencia.referencia, 'ARENANUEVA CITRICA');
  assert.equal(normalizarMarcasCatalogo('otraarenanueva lavanda', sintetico), 'otraarenanueva lavanda');
  assert.equal(normalizarMarcasCatalogo('br AD 10kg', sintetico), 'br AD 10kg');
  assert.equal(normalizarMarcasCatalogo('arena nueva', [...sintetico, { marca: 'ARENA NUEVA' }]), 'arena nueva');
});

for (const accion of ['consultar', 'agregar']) test(`${accion}: aclarar segundo producto conserva primero, cantidades y operacion`, async () => {
  let estado = crearEstadoInicial();
  let turno = 0;
  const p1 = { marca: 'NUTRIPRUEBA', referencia: 'NUTRIPRUEBA CORDERO', presentacion: '10kg', cantidad: 1 };
  const p2 = { marca: 'ARENA NUEVA', referencia: 'ARENA NUEVA LAVANDA', presentacion: '10kg', cantidad: 2 };
  const catalogo = [
    { marca: 'NUTRIPRUEBA', referencias: [{ nombre: p1.referencia, categoria: 'comida', presentaciones: [{ peso: '10kg', precio: 100000 }] }] },
    { marca: 'ARENANUEVA', referencias: [{ nombre: 'ARENANUEVA LAVANDA', categoria: 'arena', presentaciones: [{ peso: '10kg', precio: 40000 }] }] },
  ];
  const archivo = require.resolve('../src/services/conversationService');
  const localRequire = createRequire(archivo);
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'partial-quote', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async (_id, _e, meta) => {
        if (meta.respuesta) estado.ultimaPreguntaAsistente = meta.respuesta;
      } },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo: turno === 1 ? [catalogo[0]] : catalogo,
      resultadosPorProducto: turno === 1 ? [{ catalogo: [catalogo[0]] }, { catalogo: [] }] : undefined, metadata: {} }) },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      if (args.clasificacion.decisionHerramientas) {
        turno++;
        if (turno === 3) return { intencion: 'confirmacion', accion: 'confirmar', confianza: 1, consultaCatalogo: { necesaria: false } };
        if (turno === 2) assert.equal(estado.ultimaConsultaProducto.solicitudOriginal.accion, accion);
        return { intencion: accion === 'consultar' ? 'consulta_producto' : 'pedido_producto', accion, confianza: 1,
          consultaCatalogo: { necesaria: true, consulta: turno === 1 ? 'NUTRIPRUEBA y ARENA NUEVA' : 'ARENANUEVA LAVANDA 10kg' },
          productos: turno === 1 ? [p1, p2] : [], producto: turno === 1 ? null : { ...p2, marca: 'ARENANUEVA', referencia: 'ARENANUEVA LAVANDA' } };
      }
      const producto = args.mensaje.includes('NUTRIPRUEBA') ? p1 : { ...p2, marca: 'ARENANUEVA', referencia: 'ARENANUEVA LAVANDA' };
      return { intencion: 'consulta_producto', accion: 'consultar', confianza: 1, producto };
    } },
    './humanizer': { humanizarRespuesta: async (_mensaje, base) => base },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { module: modulo, require: n => mocks[n] || localRequire(n),
    process, console: { log() {}, error() {} } });
  const enviar = text => modulo.exports.responderEventoEntrante({ channelUserId: 'partial', text });
  const primera = await enviar('NUTRIPRUEBA CORDERO 10kg y 2 ARENA NUEVA LAVANDA 10kg');
  assert.equal(estado.ultimaSolicitudProductos[1].estado, 'pendiente');
  if (accion === 'consultar') { assert.match(primera, /Cotización.*[\s\S]*NUTRIPRUEBA/); assert.equal(estado.carrito.length, 0); }
  estado = JSON.parse(JSON.stringify(estado));
  const segunda = await enviar('ARENANUEVA lavanda 10kg');
  assert.equal(estado.ultimaSolicitudProductos[1].estado, 'identificado', segunda);
  if (accion === 'consultar') {
    assert.equal(estado.carrito.length, 0);
    assert.deepEqual(estado.productosConsultados.map(p => p.cantidad), [1, 2]);
    assert.match(segunda, /NUTRIPRUEBA CORDERO/);
    assert.match(segunda, /180\.000/);
    estado.ultimaPreguntaAsistente = '¿Quieres agregar estos productos al pedido?';
    const tercera = await enviar('si');
    assert.equal(estado.carrito.length, 2, tercera);
  } else assert.equal(estado.carrito.length, 2, segunda);
  assert.deepEqual(estado.carrito.map(p => p.cantidad), [1, 2]);
});

test('entidad interpretada como arena no descarta FREEMIAU separado ni cambia su variante', () => {
  const catalogo = require('../productos.json');
  const { aplicarCoincidenciaValidada } = require('../src/services/productMatchValidator');
  const { _internals: { consultaSolicitudProducto } } = require('../src/services/conversationService');
  const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
  for (const [variante, peso] of [['lavanda', '10kg'], ['citrica', '7kg']]) {
    for (const marca of ['Free Miau', 'FREEMIAU']) {
      const mensaje = `2 arenas Free Miau ${variante} de ${peso}`;
      const interpretacion = { intencion: 'pedido_producto', accion: 'agregar', confianza: 0.95,
        producto: { marca, referencia: `Free Miau ${variante}`, textoVisible: mensaje,
          categoria: 'arena', especie: 'gato', presentacion: peso, cantidad: 2 } };
      const consulta = consultaSolicitudProducto(interpretacion.producto, mensaje);
      const candidatos = seleccionarCatalogoLocal({ catalogo, mensaje: consulta, clasificacion }).catalogo;
      const validacion = validarCoincidenciaProducto({ mensaje: consulta, catalogo: candidatos, interpretacion, clasificacion });
      assert.equal(validacion.nivel, 'alta', JSON.stringify(validacion));
      assert.equal(validacion.coincidencia.referencia, `FREEMIAU ${variante.toUpperCase()}`);
      const estado = crearEstadoInicial();
      resolverConsultaCatalogo(consulta, estado, candidatos, aplicarCoincidenciaValidada(interpretacion, validacion));
      assert.equal(estado.carrito.length, 1);
      assert.equal(estado.carrito[0].cantidad, 2);
      assert.equal(estado.carrito[0].referencia, `FREEMIAU ${variante.toUpperCase()}`);
    }
  }
});
