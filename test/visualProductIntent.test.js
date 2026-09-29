const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { resolverEvidenciaProducto } = require('../src/services/productEvidenceService');
const { construirSolicitudInterprete } = require('../src/services/aiContextOptimizer');

const catalogo = [{ marca: 'NUTRIVA', referencias: [
  { nombre: 'NUTRIVA ADULTO', especie: 'perro', presentaciones: [
    { peso: '3kg', precio: 31000 }, { peso: '6kg', precio: 58000 },
  ] },
  { nombre: 'NUTRIVA ADULTO RP', especie: 'perro', presentaciones: [{ peso: '3kg', precio: 36000 }] },
  { nombre: 'NUTRIVA CORDERO ADULTO', especie: 'perro', presentaciones: [{ peso: '3kg', precio: 47000 }] },
] }];

function producto(overrides = {}) {
  return { marca: 'NUTRIVA', referencia: 'NUTRIVA ADULTO', etapa: 'adulto', especie: 'perro',
    textoVisible: 'NUTRIVA ADULTO 6kg',
    observado: { nombre: 'NUTRIVA ADULTO', presentacion: '6kg', confianzaIdentidad: 0.98, confianzaPresentacion: 0.98 },
    solicitud: {}, ...overrides };
}

async function conversar(productoInicial, mensaje = '¿Cuánto vale?', opciones = {}) {
  const archivo = require.resolve('../src/services/conversationService');
  const localRequire = createRequire(archivo);
  const estado = crearEstadoInicial();
  const consultas = [];
  let continuacion = false;
  const historial = [{ direction: 'inbound', body: 'Busco la bolsa de 3kg' }];
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'tenant-visual', vertical: 'petshop' }) },
    '../conversation/conversationStore': {
      obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => historial,
      guardarConversacionPersistida: async () => {},
    },
    './mediaProcessor': { procesarMultimedia: async () => ({ text: continuacion ? opciones.continuacion : mensaje, imageUrl: continuacion ? null : 'data:image/png;base64,synthetic' }) },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      assert.equal(args.clasificacion.requiereVision, !continuacion);
      if (args.clasificacion.decisionHerramientas) {
        assert.equal(args.historialReciente, historial);
        assert.equal(args.catalogo.length, 0);
      }
      return { intencion: 'consulta_producto', accion: 'consultar', confianza: 0.98,
        consultaCatalogo: { necesaria: true, consulta: 'NUTRIVA ADULTO 6kg' },
        producto: continuacion ? { marca: 'NUTRIVA', referencia: 'NUTRIVA ADULTO', presentacion: '3kg' }
          : args.clasificacion.decisionHerramientas ? productoInicial : opciones.lectura || productoInicial,
        productos: [] };
    } },
    './catalogContextService': {
      seleccionarCatalogoParaIA: async args => { consultas.push(args); return { catalogo: opciones.catalogo || catalogo, metadata: {} }; },
      seleccionarCatalogoRefinadoVision: () => ({ catalogo: [], metadata: {} }),
    },
    './humanizer': { humanizarRespuesta: async (_mensaje, base) => base },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    require: name => mocks[name] || localRequire(name), module: modulo, process,
    console: { log() {}, error() {} },
  });
  const respuesta = await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text: mensaje });
  let respuestaContinuacion;
  if (opciones.continuacion) {
    continuacion = true;
    respuestaContinuacion = await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text: opciones.continuacion });
  }
  return { respuesta, respuestaContinuacion, estado, consultas };
}

test('texto solicitado gana al peso fotografiado, incluso si el mapeo posterior vuelve al peso visible', async () => {
  const resultado = await conversar(producto({ solicitud: { presentacionTexto: '3kg', cantidadTexto: 2 } }),
    'La foto es de 6 kilos, ¿cuánto cuestan dos bolsas de 3 kilos?', { lectura: producto() });
  assert.match(resultado.consultas[0].mensaje, /3kg/);
  assert.doesNotMatch(resultado.consultas[0].mensaje, /6kg/);
  assert.match(resultado.respuesta, /31\.000/);
  assert.doesNotMatch(resultado.respuesta, /58\.000|36\.000|47\.000|RP|CORDERO/);
  assert.equal(resultado.estado.productosConsultados[0].cantidad, 2);
  assert.equal(resultado.estado.carrito.length, 0);
});

test('imagen completa cotiza solo la identidad y presentacion exactas', async () => {
  const { respuesta, estado } = await conversar(producto());
  assert.match(respuesta, /58\.000/);
  assert.doesNotMatch(respuesta, /31\.000|36\.000|47\.000|RP|CORDERO/);
  assert.equal(estado.productosConsultados.length, 1);
});

test('peso ilegible no cotiza ni infiere la unica presentacion disponible', async () => {
  const { respuesta, estado } = await conversar(producto({
    observado: { nombre: 'NUTRIVA ADULTO', presentacion: '6kg', confianzaIdentidad: 0.98, confianzaPresentacion: 0.2 },
  }), undefined, { catalogo: [{ marca: 'NUTRIVA', referencias: [{ ...catalogo[0].referencias[0], presentaciones: [catalogo[0].referencias[0].presentaciones[0]] }] }] });
  assert.match(respuesta, /Qué presentación necesitas/);
  assert.doesNotMatch(respuesta, /\$|31\.000|58\.000/);
  assert.equal(estado.ultimaSeleccion.referencia, 'NUTRIVA ADULTO');
  assert.equal(estado.ultimaSeleccion.presentacion, null);
  assert.equal(estado.productosConsultados.length, 0);
});

test('contexto vigente gana a la imagen; contexto de otro producto se descarta', async () => {
  const vigente = producto({ solicitud: { contextoVigente: true, presentacionContexto: '3kg' } });
  assert.match((await conversar(vigente)).respuesta, /31\.000/);
  assert.equal(resolverEvidenciaProducto(producto({ solicitud: { contextoVigente: false, presentacionContexto: '3kg' } })).presentacion, '6kg');
  assert.equal(resolverEvidenciaProducto(producto({ solicitud: {
    contextoVigente: true, presentacionContexto: '3kg', presentacionTexto: '9kg',
  } })).presentacion, '9kg');
});

test('ambiguedad visual real pide referencia sin anticipar precios', async () => {
  const incompleto = producto({ referencia: null, textoVisible: 'NUTRIVA', etapa: null,
    observado: { nombre: 'NUTRIVA', presentacion: null, confianzaIdentidad: 0.6, confianzaPresentacion: 0 } });
  const { respuesta, estado } = await conversar(incompleto);
  assert.match(respuesta, /\?/);
  assert.doesNotMatch(respuesta, /\$|31\.000|36\.000|47\.000/);
  assert.equal(estado.carrito.length, 0);
});

test('presentacion solicitada inexistente no se sustituye por la fotografiada', async () => {
  const { respuesta, estado } = await conversar(producto({ solicitud: { presentacionTexto: '9kg' } }), '¿Ese en 9kg?');
  assert.match(respuesta, /no tengo presentación|no.*9kg/i);
  assert.equal(estado.productosConsultados.length, 0);
  assert.equal(estado.carrito.length, 0);
});

test('el router visual recibe instrucciones de evidencia y contexto previo, aunque venga con perfil pedido', () => {
  const solicitud = construirSolicitudInterprete({ mensaje: '¿Cuánto vale?', catalogo: [],
    estado: { ultimaSeleccion: { marca: 'NUTRIVA', referencia: 'NUTRIVA ADULTO', presentacion: '3kg' } },
    clasificacion: { requiereVision: true, decisionHerramientas: true, perfilContexto: 'pedido', limiteHistorial: 12 } });
  assert.match(solicitud.promptBase, /confianzaPresentacion/);
  assert.match(solicitud.promptBase, /texto explicito del cliente > intencion conversacional previa/);
  assert.match(JSON.stringify(solicitud.contexto), /3kg/);
});


test('aclarar presentacion tras foto ilegible conserva consulta sin agregar al carrito', async () => {
  const { respuesta, respuestaContinuacion, estado } = await conversar(producto({
    observado: { nombre: 'NUTRIVA ADULTO', presentacion: null, confianzaIdentidad: 0.98, confianzaPresentacion: 0 },
  }), undefined, { continuacion: 'de 3kg' });
  assert.doesNotMatch(respuesta, /\$/);
  assert.match(respuestaContinuacion, /31\.000/);
  assert.equal(estado.carrito.length, 0);
});

test('respuesta visual sin evidencia de peso no hereda la presentacion elegida del catalogo', async () => {
  const archivo = require.resolve('../src/services/aiInterpreter');
  const localRequire = createRequire(archivo);
  let payload;
  class OpenAI {
    chat = { completions: { create: async args => {
      payload = args;
      return { choices: [{ message: { content: JSON.stringify({
        producto: { marca: 'NUTRIVA', referencia: 'NUTRIVA ADULTO', presentacion: '6kg' },
      }) } }] };
    } } };
  }
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    require: name => name === 'openai' ? OpenAI : localRequire(name), module: modulo,
    process: { env: { OPENAI_API_KEY: 'synthetic' } }, console: { log() {}, warn() {} },
  });
  const resultado = await modulo.exports.interpretarMensajeCliente({ mensaje: 'Precio', estado: {}, catalogo,
    imageUrls: ['data:image/png;base64,synthetic'], clasificacion: { perfilContexto: 'pedido' } });
  assert.match(payload.messages[0].content, /confianzaPresentacion/);
  const imagenEnviada = payload.messages.flatMap(m => Array.isArray(m.content) ? m.content : [])
    .find(parte => parte.type === "image_url");
  assert.equal(imagenEnviada.image_url.detail, "high");
  assert.equal(resultado.producto.presentacion, null);
  assert.equal(resultado.producto.requierePresentacion, true);
});

test('una segunda lectura mejora evidencia visual sin reescribir la solicitud explicita', () => {
  const { resolverEvidenciaInterpretacion } = require('../src/services/productEvidenceService');
  const previa = { producto: producto({ observado: { nombre: 'NUTRIVA ADULTO', confianzaIdentidad: 0.9,
    presentacion: null, confianzaPresentacion: 0 }, solicitud: { presentacionTexto: '3kg' } }) };
  const refinada = { producto: producto() };
  const resultado = resolverEvidenciaInterpretacion(refinada, previa);
  assert.equal(resultado.producto.observado.presentacion, '6kg');
  assert.equal(resultado.producto.presentacion, '3kg');
  assert.equal(resultado.producto.fuentePresentacion, 'texto');
  assert.equal(refinada.producto.solicitud.presentacionTexto, undefined);
});

test('nombre visible con plural y sabor omitido en catalogo conserva solo referencia compatible', async () => {
  const resultado = await conversar(producto({ referencia: 'NUTRIVA ADULTOS POLLO', sabores: ['pollo'],
    textoVisible: 'NUTRIVA Adultos Pollo 3kg',
    observado: { nombre: 'NUTRIVA ADULTOS POLLO', presentacion: '3kg', confianzaIdentidad: 0.98, confianzaPresentacion: 0.98 },
  }));
  assert.match(resultado.respuesta, /31\.000/);
  assert.doesNotMatch(resultado.respuesta, /RP|CORDERO|36\.000|47\.000/);
});

test('equivalencias declaradas conservan presentaciones y aliases al consolidar y continuar por peso', () => {
  const { consolidarCatalogo } = require('../src/services/catalogConsolidationService');
  const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
  const catalogo = consolidarCatalogo([{ marca: 'ALFA', referencias: [
    { nombre: 'ALFA ADUL', especie: 'perro', metadata: { equivalent_references: ['ALFA CROQUETAS'] }, presentaciones: [{ peso: '7kg', precio: 100 }] },
    { nombre: 'ALFA CROQUETAS', especie: 'perro', metadata: { aliases: ['ALFA ADULTOS', 'ALFA ORIGINAL ADULTOS'] }, presentaciones: [{ peso: '3kg', precio: 50 }] },
    { nombre: 'ALFA PREMIUM', especie: 'perro', presentaciones: [{ peso: '3kg', precio: 90 }] },
  ] }]);
  assert.equal(catalogo[0].referencias.length, 2);
  const validacion = validarCoincidenciaProducto({ mensaje: 'ALFA ADULTOS 3kg', catalogo, catalogoCandidatos: catalogo,
    clasificacion: { intencion: 'precio', perfilContexto: 'producto' },
    interpretacion: { producto: { marca: 'ALFA', referencia: 'ALFA ADULTOS', presentacion: '3kg' } } });
  assert.equal(validacion.nivel, 'alta');
  assert.equal(validacion.presentacionValida, true);
  assert.ok(validacion.coincidencia.presentaciones.some(p => p.precio === 50));
  assert.ok(!validacion.coincidencia.presentaciones.some(p => p.precio === 90));
});

test('mapeo del modelo y publicidad no sustituyen la identidad observada por otra linea', async () => {
  const catalogoAlias = [{ marca: 'NUTRIVA', referencias: [
    { nombre: 'NUTRIVA CROQUETAS', especie: 'perro', metadata: { aliases: ['NUTRIVA ORIGINAL ADULTOS'] }, presentaciones: [{ peso: '3kg', precio: 31000 }] },
    { nombre: 'NUTRIVA VITALITY ADULTO', especie: 'perro', presentaciones: [{ peso: '3kg', precio: 99000 }] },
  ] }];
  const lectura = producto({ referencia: 'NUTRIVA VITALITY ADULTO', linea: 'VITALITY',
    textoVisible: 'NUTRIVA ORIGINAL ADULTOS ENERGIA Y VITALIDAD',
    observado: { nombre: 'NUTRIVA ORIGINAL ADULTOS', presentacion: null, confianzaIdentidad: 0.96, confianzaPresentacion: 0.05 } });
  const resultado = await conversar(lectura, 'Que precio tiene', { catalogo: catalogoAlias });
  assert.match(resultado.respuesta, /presentaci[oó]n|peso/i);
  assert.doesNotMatch(resultado.respuesta, /VITALITY|99\.000|31\.000/);
  assert.match(resultado.respuesta, /CROQUETAS/);
});

test('codigo visual exige la referencia codificada aunque el modelo sugiera la descriptiva', () => {
  const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
  const { consolidarCatalogo } = require('../src/services/catalogConsolidationService');
  for (const codigo of ['UR', 'EN', 'HA', 'I/D', 'ZX']) {
    const catalogo = consolidarCatalogo([{ marca: 'NUTRIVA', referencias: [
      { nombre: `NUTRIVA FELINE ${codigo}`, especie: 'gato', presentaciones: [{ peso: '1.5kg', precio: 99000 }] },
      { nombre: 'NUTRIVA FELINE URINARY', especie: 'gato', presentaciones: [{ peso: '1.5kg', precio: 50000 }] },
    ] }]);
    assert.equal(catalogo[0].referencias.length, 2);
    const lectura = { confianza: 0.98, producto: { marca: 'NUTRIVA', referencia: 'NUTRIVA FELINE URINARY', especie: 'gato', condiciones: ['urinario'],
      observado: { nombre: `NUTRIVA ${codigo} URINARY`, presentacion: '1.5kg', confianzaIdentidad: 0.98, confianzaPresentacion: 0.98 }, solicitud: {} } };
    const v = validarCoincidenciaProducto({ mensaje: 'Tienes esta referencia?', interpretacion: lectura, catalogo, catalogoCandidatos: catalogo,
      clasificacion: { intencion: 'imagen', perfilContexto: 'multimedia', requiereVision: true } });
    assert.equal(v.nivel, 'alta', codigo + JSON.stringify(v));
    assert.equal(v.coincidencia.referencia, `NUTRIVA FELINE ${codigo}`);
    const sinCodigo = validarCoincidenciaProducto({ mensaje: 'Tienes esta referencia?', interpretacion: lectura, catalogo: [{marca:'NUTRIVA',referencias:[catalogo[0].referencias.find(r=>r.nombre.endsWith('URINARY'))]}],
      clasificacion: { intencion: 'imagen', perfilContexto: 'multimedia', requiereVision: true } });
    assert.notEqual(sinCodigo.nivel, 'alta', 'No sustituir codigo inexistente');
  }
});

test('sabor visual conserva referencia con etapa vacia frente a otras con etapa completa', () => {
  const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
  const catalogo = require('../productos.json').filter(m => m.marca === 'BR CAT');
  const validar = sabores => validarCoincidenciaProducto({ mensaje: 'Tienes este alimento x3kl?',
    catalogo, catalogoCandidatos: catalogo,
    clasificacion: { intencion: 'busqueda_producto', perfilContexto: 'multimedia', requiereVision: true },
    interpretacion: { intencion: 'consulta_producto', accion: 'consultar', confianza: 0.95,
      producto: { marca: 'BR CAT', referencia: 'BR FOR CAT PURE', especie: 'gato', etapa: 'adulto',
        condiciones: ['castrado'], sabores,
        observado: { nombre: 'BR FOR CAT PURE CASTRADOS', confianzaIdentidad: 0.95 },
        solicitud: { presentacionTexto: '3kg' } } } });
  const identificada = validar(['pollo']);
  assert.equal(identificada.nivel, 'alta');
  assert.equal(identificada.coincidencia.referencia, 'BR CAT CASTRADO POLLO');
  assert.equal(identificada.presentacionSolicitada, '3kg');
  assert.equal(identificada.coincidencia.presentaciones.find(p => p.peso === '3kg').precio, 81900);
  const incierta = validar([]);
  assert.equal(incierta.nivel, 'media');
  assert.equal(incierta.aclaracion.campo, 'sabores');
  assert.ok(incierta.aclaracion.valores.includes('pollo'));
  assert.ok(incierta.aclaracion.valores.includes('pavo'));
});

test('sabor y etapa ausente se resuelven con marcas arbitrarias en texto, audio e imagen', () => {
  const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
  const catalogo = [{ marca: 'NUTRIALFA', referencias: [
    { nombre: 'NUTRIALFA CASTRADO POLLO', especie: 'gato', etapa: null, presentaciones: [{ peso: '3kg', precio: 80000 }] },
    { nombre: 'NUTRIALFA ADULTO CASTRADO PAVO', especie: 'gato', etapa: 'adulto', presentaciones: [{ peso: '3kg', precio: 90000 }] },
  ] }];
  for (const intencion of ['busqueda_producto', 'audio', 'imagen']) {
    const requiereVision = intencion === 'imagen';
    const resultado = validarCoincidenciaProducto({ mensaje: requiereVision ? 'Tienes este x3kl?' : 'NUTRIALFA castrado pollo adulto 3kg',
      catalogo, clasificacion: { intencion, requiereVision, perfilContexto: 'multimedia' },
      interpretacion: { confianza: 0.95, producto: { marca: 'NUTRIALFA', referencia: 'NUTRIALFA CASTRADO POLLO',
        especie: 'gato', etapa: 'adulto', sabores: ['pollo'], condiciones: ['castrado'], presentacion: '3kg',
        ...(requiereVision ? { observado: { nombre: 'NUTRIALFA CASTRADO POLLO', confianzaIdentidad: 0.95 },
          solicitud: { presentacionTexto: '3kg' } } : {}) } } });
    assert.equal(resultado.nivel, 'alta', intencion);
    assert.equal(resultado.coincidencia.referencia, 'NUTRIALFA CASTRADO POLLO');
  }
});


test('sabor conocido sin candidato compatible no confirma otro sabor', () => {
  const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
  const catalogo = [{ marca: 'NUTRIALFA', referencias: [
    { nombre: 'NUTRIALFA CASTRADO PAVO', especie: 'gato', etapa: 'adulto',
      presentaciones: [{ peso: '3kg', precio: 90000 }] },
  ] }];
  const resultado = validarCoincidenciaProducto({ mensaje: 'Tienes este x3kl?', catalogo,
    clasificacion: { intencion: 'imagen', requiereVision: true, perfilContexto: 'multimedia' },
    interpretacion: { confianza: 0.99, producto: { marca: 'NUTRIALFA', especie: 'gato', etapa: 'adulto',
      sabores: ['pollo'], condiciones: ['castrado'],
      observado: { nombre: 'NUTRIALFA CASTRADO POLLO', confianzaIdentidad: 0.99 },
      solicitud: { presentacionTexto: '3kg' } } } });
  assert.notEqual(resultado.nivel, 'alta');
  assert.equal(resultado.coincidencia, null);
});
