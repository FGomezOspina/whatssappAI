const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { seleccionarCatalogoParaIA } = require('../src/services/catalogContextService');
const { _internals: { normalizarInterpretacion } } = require('../src/services/aiInterpreter');
const { _internals: { consultaSolicitudProducto } } = require('../src/services/conversationService');
const catalogo = require('../productos.json');

// La busqueda, los aliases, la validacion y el motor usan el catalogo real.
// Solo se sustituye OpenAI: estas pruebas no garantizan su extraccion en vivo.
test('pedido multiple consulta nombres sin categorias inventadas y respeta aliases del motor', async t => {
  const backend = process.env.CATALOG_SEARCH_BACKEND;
  process.env.CATALOG_SEARCH_BACKEND = 'local';
  t.after(() => { if (backend === undefined) delete process.env.CATALOG_SEARCH_BACKEND; else process.env.CATALOG_SEARCH_BACKEND = backend; });
  const mensaje = '1 bulto de 20 kilos de RINGO + PRO (bolsa negra con blanco). 4 kilos de cuchuco. 1 kilo de Ponedora. 3 paquetes de carnitas Pedigree para perros adultos razas pequeñas sabor pollo';
  const solicitudes = [
    { marca: 'RINGO', linea: 'PRO', referencia: 'RINGO + PRO', textoVisible: 'bolsa negra con blanco', presentacion: '20kg', cantidad: 1 },
    { marca: 'CUCHUCO', referencia: 'CUCHUCO ALIMENTO', textoVisible: '4 kilos de cuchuco', categoria: 'alimento', presentacion: '4kg', cantidad: 1 },
    { marca: 'PONEDORA', referencia: 'PONEDORA ALIMENTO AVE', textoVisible: 'Ponedora', categoria: 'alimento', subcategoria: 'ave', presentacion: '1kg', cantidad: 1 },
    { marca: 'PEDIGREE', textoVisible: 'carnitas Pedigree', categoria: 'alimento', especie: 'perro', etapa: 'adulto', tamano: 'pequeno', sabores: ['pollo'], cantidad: 3 },
  ];
  const estado = crearEstadoInicial();
  let contextoRedaccion;
  const archivo = require.resolve('../src/services/conversationService');
  const localRequire = createRequire(archivo);
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'regresion-catalogo', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async () => {} },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: args => seleccionarCatalogoParaIA({ ...args, catalogo,
      clasificacion: args.clasificacion }) },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      if (args.clasificacion.decisionHerramientas) return normalizarInterpretacion({ intencion: 'pedido_producto',
        accion: 'agregar', confianza: 1, productos: solicitudes, consultaCatalogo: { necesaria: true, consulta: mensaje } });
      const solicitud = solicitudes.find(p => args.mensaje.toUpperCase().includes(p.marca));
      assert.ok(solicitud);
      assert.doesNotMatch(args.mensaje, /CUCHUCO ALIMENTO|PONEDORA ALIMENTO AVE/);
      if (solicitud.marca === 'PEDIGREE') assert.ok(args.catalogo.every(m => m.marca === 'PED'));
      const referencia = solicitud.marca === 'RINGO' ? 'RINGO PREMIUM' : solicitud.marca === 'PEDIGREE' ? 'PED POUCHE ADUL RP POLLO' : solicitud.marca;
      return normalizarInterpretacion({ intencion: 'pedido_producto', accion: 'agregar', confianza: 1,
        producto: { ...solicitud, marca: solicitud.marca === 'PEDIGREE' ? 'PED' : solicitud.marca,
          referencia, presentacion: solicitud.marca === 'PEDIGREE' ? '100gr' : solicitud.presentacion, cantidad: 1 } });
    } },
    './humanizer': { humanizarRespuesta: async (_mensaje, base, opciones) => { contextoRedaccion = opciones; return base; } },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || localRequire(n),
    module: modulo, process, console: { log() {}, error() {} } });
  const respuesta = await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text: mensaje });
  assert.deepEqual(estado.carrito.map(p => [p.referencia, p.cantidad]), [
    ['RINGO PREMIUM', 1], ['CUCHUCO', 4], ['FINCA HUEVO QUEBRADA', 1], ['PED POUCHE ADUL RP POLLO', 3],
  ], respuesta);
  assert.match(respuesta, /137\.200/);
  assert.doesNotMatch(respuesta, /CHUNKY|NUTRECAN|TASTE OF THE WILD|CUCHUCO ALIMENTO|PONEDORA ALIMENTO AVE|Tengo estas referencias/);
  assert.equal(contextoRedaccion.productoAutonomo.resultados.length, 4);
  assert.equal(contextoRedaccion.productoAutonomo.resultados[2].coincidencia.referencia, 'FINCA HUEVO QUEBRADA');
});

test('limpieza por solicitud es general y no elimina sabores o variantes explicitas', () => {
  const consulta = consultaSolicitudProducto({ marca: 'MARCA PRUEBA', referencia: 'MARCA PRUEBA ALIMENTO AVE',
    textoVisible: 'MARCA PRUEBA', categoria: 'alimento', subcategoria: 'ave', sabores: ['pollo'],
    presentacion: '2kg', cantidad: 3 }, 'Tres paquetes MARCA PRUEBA de pollo de 2kg');
  assert.doesNotMatch(consulta, /ALIMENTO|AVE/);
  assert.match(consulta, /MARCA PRUEBA.*pollo.*2kg/);
});

test('descripciones de empaque y unidades no vuelven ambigua una identidad reconocida', () => {
  const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
  const mensaje = '1 bulto de 20 kilos de RINGO + PRO (bolsa negra con blanco)';
  for (const producto of [
    { marca: 'RINGO', textoVisible: mensaje, presentacion: '20kg' },
    { marca: 'RINGO + PRO', textoVisible: 'bolsa negra con blanco', presentacion: '20kg' },
    { marca: 'RINGO', referencia: 'RINGO PREMIUM', textoVisible: 'RINGO + PRO (bolsa negra con blanco)', presentacion: '20kg' },
  ]) {
    const consulta = consultaSolicitudProducto(producto, mensaje);
    const candidatos = catalogo.filter(m => m.marca === 'RINGO');
    const validacion = validarCoincidenciaProducto({ mensaje: consulta, catalogo: candidatos,
      catalogoCandidatos: candidatos, clasificacion: { intencion: 'busqueda_producto', perfilContexto: 'pedido' } });
    assert.equal(validacion.nivel, 'alta', consulta);
    assert.equal(validacion.coincidencia.referencia, 'RINGO PREMIUM');
  }
  const alimento = consultaSolicitudProducto({ marca: 'MARCA', textoVisible: 'MARCA (sabor pollo)', sabores: ['pollo'] }, 'MARCA (sabor pollo)');
  assert.match(alimento, /pollo/); // No borrar parentesis con atributos comerciales.
});
