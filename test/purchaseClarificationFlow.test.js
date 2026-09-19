const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { validarCoincidenciaProducto, respuestaValidacionProducto } = require('../src/services/productMatchValidator');
const { construirSolicitudInterprete } = require('../src/services/aiContextOptimizer');

const catalogo = [{ marca: 'NUTRIPRUEBA', referencias: [
  { nombre: 'NUTRIPRUEBA CAMPO', especie: 'perro', categoria: 'comida', subcategoria: 'seco', etapa: 'adulto', presentaciones: [{ peso: '30kg', precio: 140000 }] },
  { nombre: 'NUTRIPRUEBA PREMIUM', especie: 'perro', categoria: 'comida', subcategoria: 'seco', etapa: 'adulto', presentaciones: [{ peso: '30kg', precio: 170000 }] },
  { nombre: 'NUTRIPRUEBA CACHORRO', especie: 'perro', categoria: 'comida', subcategoria: 'seco', etapa: 'cachorro', presentaciones: [{ peso: '2kg', precio: 18000 }] },
  { nombre: 'NUTRIPRUEBA LATA', especie: 'perro', categoria: 'comida', subcategoria: 'comida_humeda', etapa: 'adulto', presentaciones: [{ peso: '30kg', precio: 1000 }] },
  { nombre: 'NUTRIPRUEBA PELOTA', especie: 'perro', categoria: 'juguete', presentaciones: [{ peso: '30kg', precio: 2000 }] },
]}];

test('aclaracion ofrece referencias del peso y formato solicitado, sin latas ni juguetes', () => {
  const v = validarCoincidenciaProducto({ mensaje: 'concentrado NUTRIPRUEBA 30kg', catalogo,
    clasificacion: { intencion: 'busqueda_producto', perfilContexto: 'producto' } });
  assert.equal(v.nivel, 'media');
  assert.equal(v.aclaracion.campo, 'referencia');
  assert.deepEqual(v.alternativas.map(p => p.referencia).sort(), ['NUTRIPRUEBA CAMPO', 'NUTRIPRUEBA PREMIUM']);
  assert.match(respuestaValidacionProducto(v), /CAMPO.*PREMIUM|PREMIUM.*CAMPO/);
  assert.doesNotMatch(respuestaValidacionProducto(v), /LATA|PELOTA|CACHORRO|\$/);
});

for (const compra of [true, false]) test(`${compra ? 'compra' : 'cotizacion'} conserva su operacion tras aclarar referencia y reiniciar estado persistido`, async () => {
  let estado = crearEstadoInicial();
  const archivo = require.resolve('../src/services/conversationService');
  const localRequire = createRequire(archivo);
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'prueba', vertical: 'petshop' }) },
    '../conversation/conversationStore': {
      obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [],
      guardarConversacionPersistida: async () => {},
    },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo,
      metadata: { referenciasEnviadas: 5, totalReferencias: 5 } }) },
    './humanizer': { humanizarRespuesta: async (_mensaje, base) => base },
    './aiInterpreter': { interpretarMensajeCliente: async ({ mensaje, estado, clasificacion }) => {
      const aclarando = mensaje.includes('CAMPO');
      const pendiente = estado.ultimaConsultaProducto?.solicitudOriginal;
      if (aclarando && clasificacion.decisionHerramientas) {
        assert.equal(pendiente.accion, compra ? 'agregar' : 'consultar');
        assert.equal(pendiente.producto.cantidad, 2);
        const solicitud = construirSolicitudInterprete({ mensaje, estado, clasificacion, catalogo: [] });
        assert.match(JSON.stringify(solicitud.contexto), /solicitudOriginal/);
        assert.match(solicitud.promptBase, /resolver la referencia de una compra usa pedido_producto y agregar/);
      }
      return { intencion: compra ? 'pedido_producto' : 'consulta_producto',
        accion: compra ? 'agregar' : 'consultar', confianza: 1,
        consultaCatalogo: { necesaria: true, consulta: aclarando ? 'NUTRIPRUEBA CAMPO 30kg' : 'concentrado NUTRIPRUEBA 30kg' },
        producto: { marca: 'NUTRIPRUEBA', referencia: aclarando ? 'NUTRIPRUEBA CAMPO' : null,
          categoria: 'comida', presentacion: '30kg', cantidad: aclarando ? pendiente?.producto.cantidad || 2 : 2 },
        entrega: !aclarando && compra ? { tipo: 'domicilio', direccion: 'mz 20 casa 2 centenario' } : {},
      };
    } },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { module: modulo,
    require: n => mocks[n] || localRequire(n), process, console: { log() {}, error() {} } });
  const responder = text => modulo.exports.responderEventoEntrante({ channelUserId: 'prueba', text });
  const primera = await responder(compra ? 'por favor dos bultos de concentrado NUTRIPRUEBA 30kg a domicilio mz 20 casa 2 centenario' : 'cuanto cuestan dos bultos de concentrado NUTRIPRUEBA 30kg');
  assert.match(primera, /CAMPO.*PREMIUM|PREMIUM.*CAMPO/);
  assert.equal(estado.carrito.length, 0);
  if (compra) {
    assert.equal(estado.entrega.tipo, 'domicilio');
    assert.equal(estado.datosDomicilio.direccion, 'mz 20 casa 2 centenario');
  }
  estado = JSON.parse(JSON.stringify(estado));
  const segunda = await responder('NUTRIPRUEBA CAMPO 30kg');
  if (compra) {
    assert.equal(estado.carrito.length, 1, segunda);
    assert.equal(estado.carrito[0].cantidad, 2);
    assert.match(segunda, /Pedido:|Total:/);
    assert.match(segunda, /280\.000/);
    assert.match(segunda, /\?/);
    assert.doesNotMatch(segunda, /domicilio o.*recoger/i);
    assert.equal(estado.datosDomicilio.direccion, 'mz 20 casa 2 centenario');
  } else {
    assert.equal(estado.carrito.length, 0, segunda);
    assert.match(segunda, /140\.000/);
  }
});
