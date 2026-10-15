const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { seleccionarPorPeso, resolverPresentacionesIdentificadas } = require('../src/services/presentationSelectionService');
const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
const { _internals: { normalizarInterpretacion } } = require('../src/services/aiInterpreter');

const catalogo = [{ marca: 'NUTRIALFA', referencias: [
  { nombre: 'NUTRIALFA PIEL ADULTO', categoria: 'comida', especie: 'perro', presentaciones: [
    { peso: '1.5kg', precio: 39500 }, { peso: '3kg', precio: 75900 }, { peso: '15kg', precio: 250000 }] },
  { nombre: 'NUTRIALFA CACHORRO', categoria: 'comida', especie: 'perro', presentaciones: [{ peso: '3kg', precio: 99999 }] },
] }, { marca: 'PROTECCION', referencias: [
  { nombre: 'PROTECCION', especie: 'perro', categoria: 'medicamento', presentaciones: [
    { peso: '10-25kg', precio: 60000 }, { peso: '2-4kg', precio: 30000 },
    { peso: '25-50kg', precio: 80000 }, { peso: '4-10kg', precio: 45000 }] },
] }];
const comida = () => ({ marca: 'NUTRIALFA', referencia: 'NUTRIALFA PIEL ADULTO', especie: 'perro',
  textoVisible: 'NUTRIALFA PIEL ADULTO 1.5kg',
  observado: { nombre: 'NUTRIALFA PIEL ADULTO', presentacion: '1.5kg', confianzaIdentidad: 0.99, confianzaPresentacion: 0.99 }, solicitud: {} });
const medicina = mascotas => ({ marca: 'PROTECCION', referencia: 'PROTECCION', especie: 'perro',
  textoVisible: 'PROTECCION para perro', mascotas });

async function conversar(productos, mensaje, { estado = crearEstadoInicial(), imagen = false } = {}) {
  const archivo = require.resolve('../src/services/conversationService');
  const req = createRequire(archivo);
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'synthetic', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async () => {} },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './mediaProcessor': { procesarMultimedia: async () => ({ text: mensaje, imageUrl: imagen ? 'data:image/png;base64,synthetic' : null }) },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo,
      resultadosPorProducto: productos.map(p => ({ catalogo: catalogo.filter(m => m.marca === p.marca) })), metadata: {} }),
      seleccionarCatalogoRefinadoVision: () => ({ catalogo: [], metadata: {} }) },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      const producto = productos.find(p => args.mensaje.includes(p.marca)) || productos[0];
      return { accion: 'consultar', intencion: 'consulta_producto', confianza: 1,
        consultaCatalogo: { necesaria: true, consulta: productos.map(p => p.textoVisible).join(' y ') },
        producto: productos.length === 1 || !args.clasificacion.decisionHerramientas ? producto : null,
        productos: args.clasificacion.decisionHerramientas ? productos : [] };
    } },
    './humanizer': { humanizarRespuesta: async (_mensaje, base) => base },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || req(n), module: modulo, process,
    console: { log() {}, error() {} } });
  const respuesta = await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text: mensaje });
  return { respuesta, estado };
}

for (const [peso, rango] of [[7.8, '4-10kg'], [10, '4-10kg'], [10.6, '4-10kg'], [10.9, '4-10kg'],
  [10.91, '10-25kg'], [11, '10-25kg'], [25.9, '10-25kg'], [26, '25-50kg'], [50.91, null]]) {
  test(`seleccion individual ${peso} kg -> ${rango}`, () => {
    assert.equal(seleccionarPorPeso(catalogo[1].referencias[0], peso)[0]?.peso || null, rango);
  });
}

for (const texto of ['otras presentaciones', 'más presentaciones', 'qué tamaños manejan', 'precios de las demás',
  'Buenos días, me dices los precios y tamaños en los que manejan este cuido']) {
  test(`imagen con solicitud ${texto} cotiza toda la referencia identificada`, async () => {
    const { respuesta, estado } = await conversar([comida()], texto, { imagen: true });
    for (const precio of ['39.500', '75.900', '250.000']) assert.ok(respuesta.includes(precio), respuesta);
    assert.doesNotMatch(respuesta, /CACHORRO|99.999|Total cotizado|Qué presentación/);
    assert.equal(estado.productosConsultados.length, 3);
    assert.equal(estado.carrito.length, 0);
  });
}

test('solo precio de imagen conserva una presentacion', async () => {
  const { respuesta, estado } = await conversar([comida()], '¿Cuánto vale?', { imagen: true });
  assert.match(respuesta, /39\.500/);
  assert.doesNotMatch(respuesta, /75\.900|250\.000/);
  assert.equal(estado.productosConsultados.length, 1);
});

for (const [pesos, grupos] of [[[7.8, 10.6, 11], 2], [[3, 8, 30], 3], [[7.8, 8, 10.6], 1]]) {
  test(`calcula ${pesos.join(', ')} por mascota y cotiza ${grupos} presentaciones`, async () => {
    const mascotas = pesos.map((pesoKg, i) => ({ nombre: ['Luna', 'Toby', 'Max'][i], pesoKg }));
    const { respuesta, estado } = await conversar([medicina(mascotas)], 'Precio PROTECCION');
    assert.equal(estado.productosConsultados.length, grupos, respuesta);
    assert.equal((respuesta.match(/^- /gm) || []).length, grupos, respuesta);
    mascotas.forEach(m => assert.ok(respuesta.includes(`${m.nombre} (${m.pesoKg} kg)`), respuesta));
    assert.doesNotMatch(respuesta, /Qué presentación|Cuánto pesa/);
    assert.equal(estado.carrito.length, 0);
  });
}

test('imagen y pesos de dos mascotas en un mismo turno no se contaminan', async () => {
  const alimento = { ...comida(), intencionPresentaciones: 'todas' };
  const pasta = { ...medicina([]), textoVisible: 'PROTECCION para un perrito que pesa 10,6 y kg y una perrita que pesa 7,8 kg' };
  const { respuesta, estado } = await conversar([alimento, pasta],
    'Precios y tamaños del cuido. Precio PROTECCION para un perrito de 10,6 kg y una perrita de 7,8 kg', { imagen: true });
  assert.equal(estado.productosConsultados.length, 4, respuesta);
  assert.equal((respuesta.match(/PROTECCION 4-10kg/g) || []).length, 1, respuesta);
  assert.match(respuesta, /10\.6 kg/);
  assert.match(respuesta, /7\.8 kg/);
  assert.doesNotMatch(respuesta, /Qué presentación|10-25kg|Total cotizado/);
  assert.ok(estado.ultimaSolicitudProductos.every(s => !s.pregunta));
});

test('solo pregunta por la mascota sin peso y conserva las otras cotizaciones', async () => {
  const { respuesta, estado } = await conversar([medicina([{ nombre: 'Luna', pesoKg: 7.8 }, { nombre: 'Max', pesoKg: null }])], 'Precio PROTECCION');
  assert.match(respuesta, /4-10kg.*45\.000/);
  assert.match(respuesta, /¿Cuánto pesa Max\?/);
  assert.doesNotMatch(respuesta, /Cuánto pesa Luna/);
  assert.equal(estado.productosConsultados.length, 1);
});

test('contexto conserva pesos para la misma referencia', async () => {
  const primero = await conversar([medicina([{ nombre: 'Luna', pesoKg: 10.6 }])], 'Precio PROTECCION');
  const segundo = await conversar([medicina([])], 'Precio PROTECCION', { estado: primero.estado });
  assert.match(segundo.respuesta, /4-10kg.*45\.000.*Luna/);
});

test('no cambia una identidad incierta ni trata pesos de bolsas como peso corporal', () => {
  const validacion = { nivel: 'media', alternativas: [{ marca: 'PROTECCION' }] };
  assert.equal(resolverPresentacionesIdentificadas({ validacion, producto: medicina([{ pesoKg: 8 }]), catalogo }), validacion);
  const v = validarCoincidenciaProducto({ mensaje: 'NUTRIALFA PIEL ADULTO 3kg', catalogo,
    interpretacion: { producto: { ...comida(), observado: undefined, presentacion: '3kg' } },
    clasificacion: { intencion: 'busqueda_producto', perfilContexto: 'producto' } });
  const resultado = resolverPresentacionesIdentificadas({ validacion: v, catalogo, producto: { mascotas: [{ pesoKg: 8 }] } });
  assert.equal(resultado.seleccionPresentaciones, undefined);
});

test('campos semanticos preservan nombres, pesos decimales e intencion sin modificar la identidad', () => {
  const producto = normalizarInterpretacion({ producto: { ...medicina([{ nombre: 'Luna', pesoKg: '10,6' }]),
    intencionPresentaciones: 'todas' } }).producto;
  assert.equal(producto.marca, 'PROTECCION');
  assert.equal(producto.intencionPresentaciones, 'todas');
  assert.equal(producto.mascotas[0].pesoKg, 10.6);
});

test('solicitudes separadas de la misma referencia agrupan presentaciones conservando todas las mascotas', async () => {
  const solicitudes = [medicina([{ nombre: 'Luna', pesoKg: 7.8 }]),
    medicina([{ nombre: 'Toby', pesoKg: 10.6 }]), medicina([{ nombre: 'Max', pesoKg: 11 }])];
  const { respuesta, estado } = await conversar(solicitudes, 'Precio PROTECCION');
  assert.equal(estado.productosConsultados.length, 2, respuesta);
  for (const nombre of ['Luna', 'Toby', 'Max']) assert.match(respuesta, new RegExp(nombre));
});

test('intencion semantica puede pedir alternativas sin frases de la heuristica y puede negarlas', async () => {
  const todas = await conversar([{ ...comida(), intencionPresentaciones: 'todas' }],
    '¿En qué otros formatos lo puedo comprar?', { imagen: true });
  assert.equal(todas.estado.productosConsultados.length, 3);
  const especifica = await conversar([{ ...comida(), intencionPresentaciones: 'especifica' }],
    'No necesito otras presentaciones, solo precio de esta bolsa', { imagen: true });
  assert.equal(especifica.estado.productosConsultados.length, 1);
});

test('una mascota nueva sin peso no hereda el peso de otra del contexto', async () => {
  const previo = await conversar([medicina([{ nombre: 'Luna', pesoKg: 10.6 }])], 'Precio PROTECCION');
  const actual = await conversar([medicina([{ nombre: 'Max', pesoKg: null }])], 'Precio PROTECCION', { estado: previo.estado });
  assert.match(actual.respuesta, /Cuánto pesa Max/);
  assert.doesNotMatch(actual.respuesta, /45\.000|Luna/);
});

test('no cotiza presentaciones declaradas sin stock', () => {
  const referencia = catalogo[0].referencias[0];
  const v = { nivel: 'alta', coincidencia: { marca: 'NUTRIALFA', referencia: referencia.nombre,
    referenciaCatalogo: referencia.nombre, presentaciones: referencia.presentaciones.map((p, i) => ({ ...p, stock: i !== 0 })) } };
  const resultado = resolverPresentacionesIdentificadas({ validacion: v, catalogo,
    producto: { ...comida(), intencionPresentaciones: 'todas' } });
  assert.equal(resultado.seleccionPresentaciones.grupos.length, 2);
  assert.ok(resultado.seleccionPresentaciones.grupos.every(p => p.peso !== '1.5kg'));
});
