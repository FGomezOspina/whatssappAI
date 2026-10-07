const test = require('node:test');
const assert = require('node:assert/strict');
const { seleccionarCatalogoRefinadoVision } = require('../src/services/catalogContextService');
const { validarCoincidenciaProducto, aplicarCoincidenciaValidada } = require('../src/services/productMatchValidator');
const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const clasificacion = { intencion: 'imagen', perfilContexto: 'multimedia', requiereVision: true, requiereBusquedaProducto: true };
function buscar(catalogo, nombre, marca, atributos = {}, vision = true) {
  const interpretacion = { intencion: 'consulta_producto', accion: 'consultar', confianza: .99,
    producto: { marca, referencia: nombre, textoVisible: nombre, ...atributos,
      observado: { nombre, confianzaIdentidad: .99, presentacion: atributos.presentacion || null, confianzaPresentacion: atributos.presentacion ? .99 : 0 } } };
  if (!vision) delete interpretacion.producto.observado;
  const clasificacionActual = vision ? clasificacion : { ...clasificacion, requiereVision: false, intencion: 'busqueda_producto', perfilContexto: 'producto' };
  const candidatos = vision ? seleccionarCatalogoRefinadoVision({ catalogo, interpretacion, clasificacion }).catalogo
    : require('../src/services/catalogContextService')._internals.seleccionarCatalogoLocal({ catalogo, mensaje: nombre, clasificacion: clasificacionActual }).catalogo;
  const validacion = validarCoincidenciaProducto({ mensaje: vision ? '' : nombre, catalogo, catalogoCandidatos: candidatos, interpretacion, clasificacion: clasificacionActual });
  return { candidatos, validacion, interpretacion };
}
test('imagen MIRRINGO ARENA PARA GATOS recupera el padre y solicita presentación', () => {
  const catalogo = require('../productos.json');
  const r = buscar(catalogo, 'MIRRINGO ARENA PARA GATOS', 'MIRRINGO', { especie: 'gato', categoria: 'arena_sustrato' });
  assert.ok(r.candidatos.some(m => m.referencias.some(p => p.nombre === 'ARENA MIRRINGO')), 'retrieval debe conservar la referencia');
  assert.equal(r.validacion.nivel, 'alta', JSON.stringify(r.validacion));
  assert.equal(r.validacion.coincidencia.referencia, 'ARENA MIRRINGO');
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo('', estado, catalogo, aplicarCoincidenciaValidada(r.interpretacion, r.validacion));
  assert.match(respuesta, /presentaci[oó]n/i);
  assert.equal(estado.carrito.length, 0);
  assert.equal(r.validacion.coincidencia.presentaciones.length, 2);
});

// Generación determinista: ninguna identidad comercial de estos escenarios
// aparece en producción y todos recorren el mismo pipeline de visión.
function identidad(seed) {
  const consonantes = 'bcdfghjklmnprstvwz', vocales = 'aeiou';
  let n = seed, nombre = '';
  for (let i = 0; i < 4; i++) {
    n = (n * 1664525 + 1013904223) >>> 0;
    nombre += consonantes[n % consonantes.length] + vocales[(n >>> 8) % vocales.length];
  }
  return nombre.toUpperCase();
}
for (const seed of [11, 29, 71]) {
  const marca = identidad(seed), grupo = identidad(seed + 100);
  const referencia = { nombre: `SUSTRATO ${marca}`, descripcion: `SUSTRATO ${marca} absorbente biodegradable`,
    especie: 'gato', categoria: 'arena_sustrato', subcategoria: 'arena',
    metadata: { original_names: [`SUSTRATO ${marca} X 5 KL`, `SUSTRATO ${marca} X 10 KL`] },
    presentaciones: [{ peso: 'x 5 kg', precio: 12000 }, { peso: 'x 10 kg', precio: 22000 }] };
  const catalogo = [{ marca: grupo, referencias: [referencia] },
    { marca, referencias: [{ nombre: marca, especie: 'gato', categoria: 'comida', subcategoria: 'concentrado', presentaciones: [{ peso: '1kg', precio: 5000 }] }] }];
  const atributos = { especie: 'gato', categoria: 'arena_sustrato' };
  const variantes = [
    ['palabras invertidas y especie fuera del nombre', `${marca} sustrato para gatos`, marca],
    ['orden de catálogo', `sustrato ${marca}`, marca],
    ['mayúsculas puntuación y descripción adicional', `${marca.toLowerCase()}, sustrato absorbente biodegradable para gatos`, marca],
    ['typo leve', `${marca.slice(0, -1)}x sustrato para gatos`, `${marca.slice(0, -1)}X`],
    ['plural', `${marca} sustratos para gatos`, marca],
    ['nombre parcial suficiente con categoría y especie', marca, marca],
  ];
  for (const [caso, nombre, marcaLeida] of variantes) test(`generado ${seed}: ${caso}`, () => {
    const r = buscar(catalogo, nombre, marcaLeida, atributos);
    assert.ok(r.candidatos.some(m => m.referencias.some(p => p.nombre === referencia.nombre)), 'candidato descartado');
    assert.equal(r.validacion.nivel, 'alta', JSON.stringify(r.validacion));
    assert.equal(r.validacion.coincidencia.referencia, referencia.nombre);
    assert.equal(r.validacion.presentacionSolicitada, null);
    assert.equal(r.validacion.coincidencia.presentaciones.length, 2);
    const estado = crearEstadoInicial();
    const respuesta = resolverConsultaCatalogo('', estado, catalogo, aplicarCoincidenciaValidada(r.interpretacion, r.validacion));
    assert.match(respuesta, /presentaci[oó]n/i);
    assert.equal(estado.carrito.length, 0);
  });
  for (const [caso, nombre, marcaLeida] of variantes.slice(0, 5)) test(`texto/transcripción ${seed}: ${caso}`, () => {
    const r = buscar(catalogo, nombre, marcaLeida, atributos, false);
    assert.ok(r.candidatos.some(m => m.referencias.some(p => p.nombre === referencia.nombre)));
    assert.equal(r.validacion.nivel, 'alta', JSON.stringify(r.validacion));
    assert.equal(r.validacion.coincidencia.referencia, referencia.nombre);
  });
  test(`generado ${seed}: original_names con presentación y kl normalizado`, () => {
    const r = buscar(catalogo, `${marca} SUSTRATO X 5 KL`, marca, { ...atributos, presentacion: '5kl' });
    assert.equal(r.validacion.nivel, 'alta', JSON.stringify(r.validacion));
    assert.equal(r.validacion.coincidencia.referencia, referencia.nombre);
    assert.equal(r.validacion.presentacionValida, true);
    const estado = crearEstadoInicial();
    const respuesta = resolverConsultaCatalogo('', estado, catalogo, aplicarCoincidenciaValidada(r.interpretacion, r.validacion));
    assert.equal(estado.carrito.length, 0);
    assert.match(respuesta, /12\.000/);
    assert.doesNotMatch(respuesta, /22\.000/);
  });
  test(`generado ${seed}: nombre original solamente en metadata de presentación`, () => {
    const referenciaSKU = { ...referencia, nombre: `${grupo} ESTANDAR`, descripcion: '', metadata: {},
      presentaciones: referencia.presentaciones.map(p => ({ ...p, metadata: { nombre_original: `${marca} SUSTRATO ${p.peso}` } })) };
    const datos = [{ marca: grupo, referencias: [referenciaSKU] }, catalogo[1]];
    const r = buscar(datos, `${marca} sustrato para gatos`, marca, atributos);
    assert.ok(r.candidatos.some(m => m.referencias.some(p => p.nombre === referenciaSKU.nombre)));
    assert.equal(r.validacion.nivel, 'alta', JSON.stringify(r.validacion));
    assert.equal(r.validacion.coincidencia.referencia, referenciaSKU.nombre);
  });
  test(`generado ${seed}: dos referencias plausibles y nombre parcial insuficiente`, () => {
    const datos = [{ marca: grupo, referencias: ['BOSQUE', 'VALLE'].map(variante => ({ ...referencia,
      nombre: `${referencia.nombre} ${variante}`, descripcion: '', metadata: {} })) }, catalogo[1]];
    const r = buscar(datos, `${marca} sustrato para gatos`, marca, atributos);
    assert.notEqual(r.validacion.nivel, 'alta', JSON.stringify(r.validacion));
    assert.equal(r.validacion.coincidencia, null);
    assert.ok(r.validacion.alternativas.length >= 2);
  });
  for (const contradiccion of [{ especie: 'perro' }, { categoria: 'juguete' }]) test(`generado ${seed}: contradicción ${JSON.stringify(contradiccion)}`, () => {
    const r = buscar([catalogo[0]], referencia.nombre, marca, { ...atributos, ...contradiccion });
    assert.notEqual(r.validacion.nivel, 'alta', JSON.stringify(r.validacion));
    assert.equal(r.validacion.coincidencia, null);
  });
  for (const vision of [true, false]) test(`generado ${seed}: identidad desconocida no se confirma por atributos, visión=${vision}`, () => {
    const r = buscar(catalogo, `${identidad(seed + 900)} sustrato para gatos`, identidad(seed + 900), atributos, vision);
    assert.notEqual(r.validacion.nivel, 'alta', JSON.stringify(r.validacion));
    assert.equal(r.validacion.coincidencia, null);
  });
}

for (const campo of ['original_names', 'descripcion']) test(`identidad disponible solo en ${campo} también participa`, () => {
  const marca = identidad(143), grupo = identidad(643), nombre = `${grupo} ESTANDAR`;
  const referencia = { nombre, especie: 'gato', categoria: 'arena_sustrato', subcategoria: 'arena',
    ...(campo === 'descripcion' ? { descripcion: `${marca} sustrato absorbente` }
      : { metadata: { original_names: [`${marca} SUSTRATO X 5 KL`] } }),
    presentaciones: [{ peso: '5kg', precio: 9000 }, { peso: '10kg', precio: 17000 }] };
  const r = buscar([{ marca: grupo, referencias: [referencia] }], `${marca} sustrato para gatos`, marca,
    { especie: 'gato', categoria: 'arena_sustrato' });
  assert.ok(r.candidatos.some(m => m.referencias.some(p => p.nombre === nombre)));
  assert.equal(r.validacion.nivel, 'alta', JSON.stringify(r.validacion));
  assert.equal(r.validacion.coincidencia.referencia, nombre);
});

test('replay de visión y continuación: conserva el padre al preguntar y cotiza solo 5 kg', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const { createRequire } = require('node:module');
  const archivo = require.resolve('../src/services/conversationService'), req = createRequire(archivo);
  const catalogo = require('../productos.json');
  const primera = buscar(catalogo, 'MIRRINGO ARENA PARA GATOS', 'MIRRINGO', { especie: 'gato', categoria: 'arena_sustrato' }).interpretacion;
  let estado = crearEstadoInicial(), continuacion = false;
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'replay-identity', vertical: 'petshop' }) },
    '../conversation/conversationStore': {
      obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [],
      guardarConversacionPersistida: async (_id, st) => { estado = JSON.parse(JSON.stringify(st)); },
    },
    './mediaProcessor': { procesarMultimedia: async () => ({ text: continuacion ? '5kl' : '',
      imageUrl: continuacion ? null : 'data:image/png;base64,fixture' }) },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './aiInterpreter': { interpretarMensajeCliente: async () => ({
      ...structuredClone(primera), consultaCatalogo: { necesaria: true, consulta: continuacion ? 'ARENA MIRRINGO 5kl' : 'MIRRINGO ARENA PARA GATOS' },
      ...(continuacion ? { producto: { marca: 'ARENA', referencia: 'ARENA MIRRINGO', presentacion: '5kl', especie: 'gato', categoria: 'arena_sustrato' } } : {}),
    }) },
    './catalogContextService': { seleccionarCatalogoRefinadoVision,
      seleccionarCatalogoParaIA: async args => require('../src/services/catalogContextService')._internals.seleccionarCatalogoLocal({ ...args, catalogo }),
    },
    './humanizer': { humanizarRespuesta: async (_m, base) => base },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { module: modulo, require: n => mocks[n] || req(n), process, console: { log() {}, error() {} } });
  const servicio = modulo.exports;
  const respuesta = await servicio.responderEventoEntrante({ channelUserId: 'replay', text: '' });
  assert.match(respuesta, /ARENA MIRRINGO/);
  assert.match(respuesta, /presentaci[oó]n/i);
  assert.doesNotMatch(respuesta, /no encuentro/i);
  assert.equal(estado.ultimaSeleccion.referencia, 'ARENA MIRRINGO');
  assert.equal(estado.ultimaSeleccion.presentacion, null);
  assert.equal(estado.carrito.length, 0);
  continuacion = true;
  const siguiente = await servicio.responderEventoEntrante({ channelUserId: 'replay', text: '5kl' });
  assert.match(siguiente, /26\.900/);
  assert.doesNotMatch(siguiente, /48\.500|no encuentro/);
  assert.equal(estado.carrito.length, 0);
});
