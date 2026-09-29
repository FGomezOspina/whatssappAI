const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
const { _internals: { resolverReferenciaDescriptiva } } = require('../src/services/conversationService');
const catalogo = require('../productos.json').filter(m => ['BR', 'BR CAT', 'PRO PLAN'].includes(m.marca));
const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'pedido' };
const productos = [
  { marca: 'Purina', linea: 'Pro Plan', categoria: 'alimento', subcategoria: 'húmedo', especie: 'gato', etapa: 'adulto', sabores: ['salmón'],
    observado: { nombre: 'ADULT GATOS ADULTOS CON SALMÓN EN SALSA PURINA PRO PLAN', presentacion: '85g', confianzaIdentidad: .98, confianzaPresentacion: .98 }, solicitud: {} },
  { marca: 'BR for CAT', linea: 'Wild', categoria: 'alimento', subcategoria: 'seco', especie: 'gato', etapa: 'adulto', sabores: ['salmon', 'duck'],
    observado: { nombre: 'BR for CAT Wild Complete Adults Food Salmon & Duck', presentacion: null, confianzaIdentidad: .98, confianzaPresentacion: .1 }, solicitud: {} },
];

test('identidad completa atraviesa agrupaciones de marca y conserva el peso solicitado', () => {
  for (const mensaje of ['Br wild cat 1kl', 'br cat wild 1kg']) {
    const v = validarCoincidenciaProducto({ mensaje, catalogo, clasificacion });
    assert.equal(v.nivel, 'alta');
    assert.equal(v.coincidencia.referencia, 'BR WILD CAT ADULT');
    assert.equal(v.coincidencia.presentaciones[0].precio, 35900);
  }
  const ficticio = [
    { marca: 'ALFA', referencias: [{ nombre: 'ALFA BOSQUE CAT ADULT', especie: 'gato', presentaciones: [{ peso: '1kg', precio: 123 }] }] },
    { marca: 'ALFA CAT', referencias: [{ nombre: 'ALFA CAT POLLO', especie: 'gato', presentaciones: [{ peso: '1kg', precio: 456 }] }] },
  ];
  const v = validarCoincidenciaProducto({ mensaje: 'alfa bosque cat 1kg', catalogo: ficticio, clasificacion });
  assert.equal(v.coincidencia.referencia, 'ALFA BOSQUE CAT ADULT');
});

test('empaque descriptivo reconoce especie, etapa y formato sin exigir el nombre interno', () => {
  const v = validarCoincidenciaProducto({ mensaje: 'tienen este', catalogo,
    clasificacion: { ...clasificacion, requiereVision: true }, interpretacion: { confianza: .98, producto: productos[0] } });
  assert.equal(v.nivel, 'alta');
  assert.equal(v.coincidencia.referencia, 'PRO PLAN POUCH FELINO ADULT');
  assert.equal(v.coincidencia.presentaciones[0].precio, 6200);
  // Un nombre de linea desconocido en el SKU no se inventa desde el catalogo.
  const distinto = { ...productos[0], observado: { ...productos[0].observado, nombre: 'OTRA MARCA gato adulto salsa' } };
  assert.notEqual(validarCoincidenciaProducto({ mensaje: '', catalogo, clasificacion: { ...clasificacion, requiereVision: true },
    interpretacion: { producto: distinto, confianza: .98 } }).nivel, 'alta');
});

test('descriptor contextual no elige entre dos humedos ni reutiliza contexto vencido', () => {
  const decision = { accion: 'agregar', producto: { cantidad: 3 } };
  const item = { marca: 'ALFA', referencia: 'ALFA SOBRE', peso: '85g', subcategoria: 'comida_humeda', contextoCreadoEn: new Date().toISOString() };
  const elegido = resolverReferenciaDescriptiva(decision, { productosConsultados: [item] }, 'agrega 3 comida humeda');
  assert.equal(elegido.producto.referencia, item.referencia);
  assert.equal(elegido.producto.cantidad, 3);
  const ambiguo = resolverReferenciaDescriptiva(decision, { productosConsultados: [item, { ...item, referencia: 'ALFA LATA' }], ultimaSeleccion: item }, 'agrega 3 comida humeda');
  assert.equal(ambiguo.accion, 'consultar');
  assert.match(ambiguo.respuestaConversacional, /ALFA SOBRE.*ALFA LATA/);
  const vencido = resolverReferenciaDescriptiva(decision, { ultimaSeleccion: { ...item, contextoCreadoEn: '2020-01-01' } }, 'agrega 3 comida humeda');
  assert.equal(vencido._consultaContinuada, undefined);
  assert.notEqual(vencido.producto.referencia, item.referencia);
});

test('dos fotos cotizan el humedo y luego agrega tres por descriptor mostrando el carrito', async () => {
  let estado = crearEstadoInicial(), turno = 0;
  const archivo = require.resolve('../src/services/conversationService'), req = createRequire(archivo), modulo = { exports: {} };
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'recognition', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado, obtenerHistorialRecientePersistido: async () => [],
      guardarConversacionPersistida: async (_id, nuevo) => { estado = JSON.parse(JSON.stringify(nuevo)); } },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './mediaProcessor': { procesarMultimedia: async evento => (turno === 0 ? { text: 'Tienen estos 2 productos', imageUrl: 'data:image/png;base64,one' } : { text: evento.text }) },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo, metadata: {} }), seleccionarCatalogoRefinadoVision: () => ({ catalogo: [], metadata: {} }) },
    './humanizer': { humanizarRespuesta: async (_m, base) => base },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      if (args.clasificacion.decisionHerramientas) turno++;
      if (turno === 1) {
        const base = { intencion: 'consulta_producto', accion: 'consultar', confianza: .98, consultaCatalogo: { necesaria: true, consulta: 'dos productos' } };
        if (args.clasificacion.decisionHerramientas) return { ...base, productos: structuredClone(productos) };
        return { ...base, producto: structuredClone(productos[args.mensaje.includes('PRO PLAN') ? 0 : 1]) };
      }
      if (turno === 2) return { intencion: 'consulta_producto', accion: 'consultar', confianza: .98,
        producto: { marca: 'BR', referencia: 'BR WILD CAT ADULT', presentacion: '1kl' },
        consultaCatalogo: { necesaria: true, consulta: 'BR WILD CAT ADULT 1kg' } };
      return { intencion: 'pedido_producto', accion: 'agregar', confianza: .98,
        producto: args.clasificacion.decisionHerramientas ? { referencia: 'comida humeda', cantidad: 3 }
          : { marca: 'PRO PLAN', referencia: 'PRO PLAN POUCH FELINO ADULT', presentacion: '85g', cantidad: 3 },
        consultaCatalogo: { necesaria: true, consulta: 'comida humeda' } };
    } },
  };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || req(n), module: modulo, process, console: { log() {}, error() {} } });
  const enviar = text => modulo.exports.responderEventoEntrante({ channelUserId: 'test', text });
  const primera = await modulo.exports.responderEventosEntrantes([{ channelUserId: 'test', text: 'Tienen estos 2 productos' }, { channelUserId: 'test', text: '' }]);
  assert.match(primera, /6\.200/);
  assert.equal(estado.carrito.length, 0);
  assert.match(primera, /BR WILD CAT ADULT/);
  assert.doesNotMatch(primera, /nombre completo|cu[aá]l de los dos|pendiente de identificar/i);
  assert.ok(estado.productosConsultados.some(p => p.referencia === 'PRO PLAN POUCH FELINO ADULT'), primera);
  // El siguiente evento es de texto; el historial conservado cruza serializacion.
  const aclarada = await enviar('El BR wild cat de 1kl');
  assert.match(aclarada, /35\.900/);
  assert.equal(estado.carrito.length, 0);
  assert.ok(estado.ultimaSolicitudProductos.every(item => item.estado === 'identificado'), aclarada);
  assert.ok(estado.productosConsultados.some(item => item.referencia === 'PRO PLAN POUCH FELINO ADULT'));
  const segunda = await enviar('agrega 3 comida humeda');
  assert.equal(estado.carrito.length, 1, segunda);
  assert.equal(estado.carrito[0].referencia, 'PRO PLAN POUCH FELINO ADULT');
  assert.equal(estado.carrito[0].cantidad, 3);
  assert.match(segunda, /Pedido:/);
  assert.match(segunda, /18\.600/);
});

test('mayusculas del empaque no convierten preposiciones en codigos de dieta', () => {
  const { codigosReferencia } = require('../src/utils/text');
  assert.deepEqual(codigosReferencia('ADULT CON SALMON EN SALSA DE LA MARCA ALFA', 'ALFA'), []);
  assert.deepEqual(codigosReferencia('ALFA FELINE EN', 'ALFA'), ['EN']);
  assert.deepEqual(codigosReferencia('ALFA C/N EN SALSA', 'ALFA'), ['C/N']);
});

test('marca comercial se descubre desde nombres del catalogo aunque el lector entregue fabricante', () => {
  const productos = [{ marca: 'NOVA PLAN', referencias: [
    { nombre: 'NOVA PLAN POUCH FELINO ADULT', especie: 'gato', etapa: 'adulto', categoria: 'comida',
      subcategoria: 'comida_humeda', presentaciones: [{ peso: '90gr', precio: 5000 }] },
    { nombre: 'NOVA PLAN POUCH FELINO KITTEN', especie: 'gato', etapa: 'cachorro', categoria: 'comida',
      subcategoria: 'comida_humeda', presentaciones: [{ peso: '90gr', precio: 6000 }] },
  ] }];
  const v = validarCoincidenciaProducto({ catalogo: productos, clasificacion: { ...clasificacion, requiereVision: true },
    interpretacion: { confianza: .99, producto: { marca: 'FABRICANTE', linea: 'NOVA PLAN', especie: 'gato', etapa: 'adulto',
      observado: { nombre: 'FABRICANTE NOVA PLAN GATOS ADULTOS CON SALMON EN SALSA', presentacion: '90g',
        confianzaIdentidad: .99, confianzaPresentacion: .99 }, solicitud: {} } } });
  assert.equal(v.nivel, 'alta');
  assert.equal(v.coincidencia.referencia, 'NOVA PLAN POUCH FELINO ADULT');
});

test('lectura real de Wild en ingles identifica la variante sin inventar peso', () => {
  const { aplicarCoincidenciaValidada } = require('../src/services/productMatchValidator');
  const interpretacion = { confianza: .89, producto: productos[1] };
  const v = validarCoincidenciaProducto({ catalogo, clasificacion: { ...clasificacion, requiereVision: true }, interpretacion });
  assert.equal(v.nivel, 'alta');
  assert.equal(v.coincidencia.referencia, 'BR WILD CAT ADULT');
  assert.equal(v.presentacionSolicitada, null);
  const validada = aplicarCoincidenciaValidada(interpretacion, v);
  assert.equal(validada.producto.requierePresentacion, true);
  assert.equal(validada.producto.presentacion, null);
});
