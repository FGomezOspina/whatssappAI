const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { _internals: { normalizarInterpretacion } } = require('../src/services/aiInterpreter');
const { validarCoincidenciaProducto: validar, respuestaValidacionProducto: responder,
  construirConsultaProductoContextual } = require('../src/services/productMatchValidator');
const catalogo = require('../productos.json');
const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'pedido' };

test('especie, categoría y peso compartidos no empatan aromas explícitos', () => {
  const familia = catalogo.filter(m => m.marca.includes('ARENA KITTEN'));
  for (const aroma of ['talco', 'cafe', 'lavanda', 'limon', 'original']) {
    const v = validar({ mensaje: `1 Arena x 8 kg Kitten ${aroma} gato`, catalogo: familia, clasificacion,
      interpretacion: { confianza: 1, producto: { marca: 'Kitten', referencia: aroma,
        categoria: 'arena', especie: 'gato', presentacion: '8kg' } } });
    assert.equal(v.nivel, 'alta');
    assert.equal(v.coincidencia.referencia, `ARENA KITTEN ${aroma.toUpperCase()}`);
    assert.equal(v.presentacionSolicitada, '8kg');
  }
});

for (const peso of ['', '8kg']) test(`familia de arena pregunta solo atributos faltantes: ${peso || 'sin peso'}`, () => {
  const v = validar({ mensaje: `arena kitten ${peso}`, catalogo, clasificacion });
  assert.equal(v.aclaracion.atributo, 'aroma');
  assert.equal(v.alternativas.length, 5);
  const respuesta = responder(v);
  for (const aroma of ['cafe', 'lavanda', 'limon', 'original', 'talco']) assert.ok(respuesta.includes(aroma));
  assert.equal(respuesta.includes('presentación'), !peso);
  const contexto = { ...v, creadoEn: new Date().toISOString(), presentacion: peso || null };
  const consulta = construirConsultaProductoContextual(peso ? 'talco' : 'talco 8kg', contexto);
  const resuelta = validar({ mensaje: consulta, catalogo, clasificacion });
  assert.equal(resuelta.nivel, 'alta');
  assert.equal(resuelta.coincidencia.referencia, 'ARENA KITTEN TALCO');
  assert.equal(resuelta.presentacionSolicitada, '8kg');
});

test('aromas se descubren del catálogo también con otra familia y variantes nuevas', () => {
  const otro = ['Cedro', 'Jazmin'].map(aroma => ({ marca: `ARENA NUBECITA ${aroma}`, referencias: [{
    nombre: `ARENA NUBECITA ${aroma}`, categoria: 'arena_sustrato', especie: 'gato',
    presentaciones: [{ peso: '6kg', precio: 12300 }],
  }] }));
  const v = validar({ mensaje: 'arena nubecita 6kg', catalogo: otro, clasificacion });
  assert.equal(v.aclaracion.atributo, 'aroma');
  assert.deepEqual(v.aclaracion.etiquetas.sort(), ['cedro', 'jazmin']);
});

for (const envase of ['100gr', 'lata', null]) test(`lista completa conserva variantes, cantidades y envase interpretado como ${envase}`, async () => {
  const solicitudes = [
    { marca: 'EXCELLENT', referencia: 'EXCELLENT GATO URINARY', textoVisible: '1 kg Excellent Urinary gatos', especie: 'gato', presentacion: '1kg', cantidad: 1 },
    { marca: 'VETSOLUTION', referencia: 'VETSOLUTION CAT URINARY', textoVisible: '3 latas de Vet Solution Urinary', especie: 'gato', presentacion: '100gr', cantidad: 3 },
    { marca: 'VETSOLUTION', referencia: 'VETSOLUTION CAT GASTROINTES', textoVisible: '1 lata de Vet Solution Gastro gatos', especie: 'gato', presentacion: 'x100', cantidad: 1 },
    { marca: 'Kitten', referencia: 'talco', textoVisible: '1 Arena x 8 kg Kitten talco', mencionOriginal: '1 Arena x 8 kg Kitten talco', especie: 'gato', categoria: 'arena', sabores: ['talco'], presentacion: '8 kg', cantidad: 1 },
  ];
  if (envase !== '100gr') Object.assign(solicitudes[1], { marca: 'Vet Solution', referencia: 'Urinary',
    especie: null, presentacion: envase, subcategoria: 'lata', categoria: 'alimento', condiciones: ['urinary'] });
  const archivo = require.resolve('../src/services/conversationService');
  const req = createRequire(archivo);
  const estado = crearEstadoInicial();
  let remapeosArena = 0;
  const decision = { intencion: 'consulta_producto', accion: 'consultar', confianza: 1,
    solicitudesProductoDetectadas: 4, consultaCatalogo: { necesaria: true, consulta: 'cotización' }, productos: solicitudes };
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'synthetic', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado, obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async () => {} },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo, resultadosPorProducto: solicitudes.map(p => ({ catalogo: catalogo.filter(m => p.marca === 'Kitten' ? m.marca.includes('KITTEN') : m.marca === p.marca.replace(/ /g, '').toUpperCase()) })), metadata: {} }) },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      if (args.clasificacion.decisionHerramientas) return normalizarInterpretacion(structuredClone(decision));
      if (/kitten/i.test(args.mensaje)) { remapeosArena++; return null; }
      const solicitud = solicitudes.find(p => args.mensaje.includes(p.referencia));
      const producto = solicitud === solicitudes[1] ? { ...solicitud, marca: 'VETSOLUTION', referencia: 'VETSOLUTION CAT URINARY' } : solicitud;
      return normalizarInterpretacion(structuredClone({ ...decision, productos: [], producto }));
    } },
    './humanizer': { humanizarRespuesta: async (_m, base) => base },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || req(n), module: modulo, process, console: { log() {}, error() {} } });
  const respuesta = await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text: solicitudes.map(p => p.textoVisible).join('\n') + '\nMe dice por favor el valor' });
  assert.equal(remapeosArena, 0);
  assert.equal(estado.carrito.length, 0);
  assert.equal(estado.ultimaSolicitudProductos.length, 4);
  assert.ok(estado.ultimaSolicitudProductos.every(p => p.estado === 'identificado'), respuesta);
  assert.match(respuesta, /91\.400/);
  assert.match(respuesta, /1 x ARENA KITTEN TALCO 8kg: \$23\.800/);
});
