const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { respuestaParaHistorial } = require('../src/utils/responseMessages');
const corpus = require('../docs/reports/multimedia-2026-10-30/cases-v1.json');
const catalogo = require('../docs/reports/sandbox-e2e-2026-10-30/catalog-current.json');

// Replays persisted product extraction, not image perception. No API or writes.
function scenario(products, catalog = catalogo, seed = {}) {
  let state = { ...crearEstadoInicial(), ...structuredClone(seed) };
  const file = require.resolve('../src/services/conversationService');
  const req = createRequire(file), module = { exports: {} };
  const clean = products.map(p => {
    const { estado, pregunta, cotizacion, contextoCreadoEn, presentacionesDisponibles, ...input } = p;
    return input;
  });
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'coverage-fixture', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => state,
      obtenerHistorialRecientePersistido: async () => [],
      guardarConversacionPersistida: async (_id, s) => { state = structuredClone(s); } },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './mediaProcessor': { procesarMultimedia: async e => ({ text: e.media?.type === 'audio' ? e.media.transcript : e.text || '',
      imageUrl: e.media?.type === 'image' ? e.media.url : null }) },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo: catalog, metadata: {} }),
      seleccionarCatalogoRefinadoVision: () => ({ catalogo: catalog, metadata: {} }) },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      const selected = args.clasificacion.decisionHerramientas ? clean :
        [clean.find(p => args.mensaje.includes(p.textoVisible || p.referencia)) ||
          clean.find(p => args.mensaje.includes(p.marca)) || clean[0]];
      return { accion: 'consultar', intencion: 'consulta_producto', confianza: .99,
        producto: selected.length === 1 ? structuredClone(selected[0]) : null,
        productos: structuredClone(selected), solicitudesProductoDetectadas: clean.length,
        consultaCatalogo: { necesaria: true, consulta: args.mensaje } };
    } },
    './humanizer': { humanizarRespuesta: async (_m, base) => base },
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require: n => mocks[n] || req(n),
    process, console: { log() {}, error() {} } });
  const sendEvents = async events => respuestaParaHistorial(await module.exports.responderEventosEntrantes(
    events.map(e => ({ channelUserId: 'coverage-test', ...e }))));
  return { state: () => state, sendEvents, send: (text, image = false) => sendEvents(
    (Array.isArray(text) ? text : [text]).map(text => ({ text,
      media: image ? { type: 'image', url: 'fixture:original-image-extraction' } : null }))) };
}

test('original three-reference request reports unavailable pack alongside both quotes', async () => {
  const c = corpus.cases[0], s = scenario(c.interpretation.productos);
  const response = await s.send(c.message);
  assert.match(response, /BR CAT CASTRADO POLLO/);
  assert.match(response, /NEXGARD/);
  assert.match(response, /NUTRA NUGGETS CORDERO/i);
  assert.match(response, /1\s?kg.*3\s?kg|1 kg.*3 kg/i);
  assert.equal(s.state().ultimaSolicitudProductos.length, 3);
  assert.equal(s.state().ultimaSolicitudProductos.find(p => p.marca === 'NUTRA NUGGETS').estado, 'pendiente');
  assert.equal(s.state().carrito.length, 0);
});

test('two unresolved products from one image each receive an explicit outcome', async () => {
  const c = corpus.cases[1], s = scenario(c.interpretation.productos, []);
  const response = await s.send(c.message, true);
  assert.match(response, /Hill/i);
  assert.match(response, /ADVANCE/i);
  assert.equal(s.state().ultimaSolicitudProductos.length, 2);
  assert.equal(s.state().carrito.length, 0);
});

test('commercial slash codes are case independent without treating ordinary lowercase words as codes', () => {
  const { codigosReferencia } = require('../src/utils/text');
  assert.deepEqual(codigosReferencia('c/d Multicare'), ['C/D']);
  assert.deepEqual(codigosReferencia('c/D Multicare'), ['C/D']);
  assert.deepEqual(codigosReferencia('en salsa de pollo'), []);
});

test('original visual extraction with uncertain food form retains both same-code formats', () => {
  const p = corpus.cases[1].interpretation.productos[0];
  const v = require('../src/services/productMatchValidator').validarCoincidenciaProducto({
    mensaje: [p.marca, p.observado.nombre, p.especie].join(' '), catalogo,
    interpretacion: { producto: p, confianza: .99 },
    clasificacion: { requiereVision: true, perfilContexto: 'producto', intencion: 'busqueda_producto' } });
  assert.equal(v.razon, 'formato_alimento_ambiguo');
  assert.deepEqual(v.alternativas.map(a => a.referenciaCatalogo).sort(), ['HILLS FEL C/D', 'HILLS FEL LATA C/D']);
});

test('synthetic structured code separates packaging descriptors and preserves food form', () => {
  const p = { ...corpus.cases[1].interpretation.productos[0], referencia: 'c/d' };
  const v = require('../src/services/productMatchValidator').validarCoincidenciaProducto({
    mensaje: [p.marca, p.observado.nombre, p.especie, 'concentrado'].join(' '), catalogo,
    interpretacion: { producto: p, confianza: .99 },
    clasificacion: { requiereVision: true, perfilContexto: 'producto', intencion: 'busqueda_producto' } });
  assert.equal(v.nivel, 'alta');
  assert.equal(v.coincidencia.referenciaCatalogo, 'HILLS FEL C/D');
});

for (const requiereVision of [false, true]) test(`a protected code does not approve an undeclared commercial variant; vision=${requiereVision}`, () => {
  const data = [{ marca: 'NOVA', referencias: [{ nombre: 'NOVA FEL A/B', especie: 'gato', categoria: 'comida',
    subcategoria: 'concentrado', presentaciones: [{ peso: '2kg', precio: 100 }] }] }];
  const p = { marca: 'NOVA', referencia: 'a/b Especial', especie: 'gato', categoria: 'comida',
    observado: { nombre: 'NOVA Diet Nutrition a/b Especial', confianzaIdentidad: .99, formaAlimento: 'concentrado', confianzaFormato: .99 } };
  const v = require('../src/services/productMatchValidator').validarCoincidenciaProducto({
    mensaje: p.observado.nombre + ' gato concentrado', catalogo: data,
    interpretacion: { producto: p, confianza: .99 },
    clasificacion: { requiereVision, perfilContexto: 'producto', intencion: 'busqueda_producto' } });
  assert.equal(v.razon, 'variante_codificada_por_confirmar');
  assert.equal(v.nivel, 'media');
  assert.equal(v.alternativas[0].referenciaCatalogo, 'NOVA FEL A/B');
});

test('an unresolved visual identity survives the narrower ranking terms during clarification', () => {
  const { solicitudRespaldada } = require('../src/services/productRequestContext');
  const p = corpus.cases[1].interpretation.productos[0];
  const r = solicitudRespaldada(p, ['hill']);
  assert.equal(r.referencia, 'c/d Multicare');
  assert.equal(r.linea, 'Prescription Diet');
  const other = solicitudRespaldada({ ...p, referencia: 'inventada' }, ['hill']);
  assert.equal(other.referencia, null);
});

for (const [code, expected] of [['a/b', 'NOVA FEL A/B'], ['x/y', 'NOVA FEL X/Y']]) {
  test(`synthetic held-out slash code ${code} cannot drift to the other line or wet format`, () => {
    const data = [{ marca: 'NOVA', referencias: ['A/B', 'X/Y'].flatMap(c => [
      { nombre: `NOVA FEL ${c}`, especie: 'gato', categoria: 'comida', subcategoria: 'concentrado', presentaciones: [{ peso: '2kg', precio: 100 }] },
      { nombre: `NOVA FEL LATA ${c}`, especie: 'gato', categoria: 'comida', subcategoria: 'comida_humeda', presentaciones: [{ peso: '150g', precio: 10 }] },
    ]) }];
    const v = require('../src/services/productMatchValidator').validarCoincidenciaProducto({
      mensaje: `Nova ${code} gato concentrado`, catalogo: data,
      clasificacion: { perfilContexto: 'producto', intencion: 'busqueda_producto' } });
    assert.equal(v.nivel, 'alta');
    assert.equal(v.coincidencia.referenciaCatalogo, expected);
  });
}

test('catalog-based punctuation normalization does not turn arbitrary words into another brand', () => {
  const { normalizarMarcasCatalogo } = require('../src/utils/text');
  const c = [{ marca: 'NOVAS' }, { marca: 'OMEGA' }];
  assert.equal(normalizarMarcasCatalogo("Nova's a/b", c), 'novas a/b');
  assert.equal(normalizarMarcasCatalogo("Other's a/b", c), "Other's a/b");
});

test('synthetic consecutive-message variant preserves three references and per-item quantities', async () => {
  const products = structuredClone(corpus.cases[0].interpretation.productos);
  products[0].cantidad = 2;
  products[1].cantidad = 3;
  const s = scenario(products);
  const response = await s.send(['Para cotizar: 2 nutra nugges cordero 7k perro',
    '3 br gato castrado de pollo 1k', 'Nexgart para perro de 40k']);
  assert.match(response, /NUTRA NUGGETS CORDERO/);
  assert.match(response, /BR CAT CASTRADO POLLO/);
  assert.match(response, /NEXGARD/);
  const states = s.state().ultimaSolicitudProductos;
  assert.equal(states.length, 3);
  assert.equal(states.find(p => p.marca === 'NUTRA NUGGETS').cantidad, 2);
  assert.equal(states.find(p => p.marca === 'BR CAT').cotizacion[0].cantidad, 3);
  assert.equal(s.state().carrito.length, 0);
});

test('original persisted image extraction cannot turn an inferred dog species into a cat SKU', async () => {
  const c = corpus.cases[1], s = scenario(c.interpretation.productos);
  const response = await s.send(c.message, true);
  assert.match(response, /Hill/i);
  assert.match(response, /ADVANCE/i);
  assert.doesNotMatch(response, /asesor|108\.000/);
  assert.equal(s.state().carrito.length, 0);
});

test('synthetic audio transcript plus text preserves all references; no real audio perception claimed', async () => {
  const s = scenario(corpus.cases[0].interpretation.productos);
  const response = await s.sendEvents([
    { media: { type: 'audio', transcript: 'Para cotizar el nutra nugges cordero 7k perro y br gato castrado pollo 1k' } },
    { text: 'También nexgart para perro de 40k' },
  ]);
  for (const name of ['NUTRA NUGGETS CORDERO', 'BR CAT CASTRADO POLLO', 'NEXGARD']) assert.ok(response.includes(name), response);
  assert.equal(s.state().carrito.length, 0);
});

test('synthetic uncertain transcription remains a clarification alongside a known product', async () => {
  const products = [{ marca: 'NOVA', referencia: null, textoVisible: 'nova no entendí qué línea', presentacion: null },
    { marca: 'BR CAT', referencia: 'BR CAT CASTRADO POLLO', textoVisible: 'BR CAT CASTRADO POLLO 1kg', presentacion: '1kg', especie: 'gato' }];
  const data = [{ marca: 'NOVA', referencias: ['NOVA DELTA', 'NOVA DENTA'].map(nombre => ({ nombre, especie: 'perro', categoria: 'comida', subcategoria: 'concentrado', presentaciones: [{ peso: '2kg', precio: 100 }] })) },
    ...catalogo.filter(m => m.marca === 'BR CAT')];
  const s = scenario(products, data);
  const response = await s.sendEvents([{ media: { type: 'audio', transcript: 'nova no entendí qué línea; y BR CAT CASTRADO POLLO 1kg' } }]);
  assert.match(response, /NOVA|nova/);
  assert.match(response, /BR CAT CASTRADO POLLO/);
  assert.equal(s.state().ultimaSolicitudProductos.find(p => p.marca === 'NOVA').estado, 'pendiente');
  assert.equal(s.state().carrito.length, 0);
});
test('new list does not resurrect expired or undated legacy pending products', async () => {
  const c = corpus.cases[0];
  for (const timestamp of [undefined, '2020-01-01T00:00:00Z']) {
    const s = scenario(c.interpretation.productos, catalogo, {
      ultimaSolicitudProductos: [{ marca: 'ANTERIOR', referencia: 'ANTERIOR NO PEDIDO', estado: 'pendiente',
        pregunta: '¿Qué presentación de ANTERIOR NO PEDIDO?', contextoCreadoEn: timestamp,
        cotizacion: [{ marca: 'ANTERIOR', referencia: 'ANTERIOR NO PEDIDO', peso: '1kg', precio: 1 }] }],
    });
    const text = await s.send(c.message);
    assert.doesNotMatch(text, /ANTERIOR NO PEDIDO/);
    assert.match(text, /NUTRA NUGGETS CORDERO/);
    assert.equal(s.state().ultimaSolicitudProductos.length, 3);
  }
});
