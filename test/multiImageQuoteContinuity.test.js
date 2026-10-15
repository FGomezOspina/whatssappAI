const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { respuestaParaHistorial } = require('../src/utils/responseMessages');
const { validarCoincidenciaProducto, aplicarCoincidenciaValidada } = require('../src/services/productMatchValidator');
const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
const catalogo = require('../productos.json').filter(m => ['MAX CAT', 'ARENA KING CAT'].includes(m.marca));
const max = { marca: 'MAX CAT', referencia: 'MAX CAT ADULTO FRANGO ARROZ', especie: 'gato', categoria: 'comida', etapa: 'adulto',
  sabores: ['pollo', 'arroz'], textoVisible: 'MAX CAT ADULTO FRANGO ARROZ',
  observado: { nombre: 'MAX CAT ADULTO FRANGO ARROZ', confianzaIdentidad: .99, presentacion: null, confianzaPresentacion: 0 } };
const arena = { marca: 'KING CAT', referencia: 'ARENA KING CAT', especie: 'gato', categoria: 'arena_sustrato', presentacion: '25kg',
  textoVisible: 'ARENA KING CAT', observado: { nombre: 'ARENA KING CAT', confianzaIdentidad: .99, presentacion: '25kg', confianzaPresentacion: .99 } };
function escenario({ omitir = true, compra = false, falloImagen = false, omitirTodo = false, router = null, catalogoDatos = catalogo } = {}) {
  let estado = crearEstadoInicial();
  const consultas = [], llamadas = [], trazas = [];
  const archivo = require.resolve('../src/services/conversationService'), req = createRequire(archivo), modulo = { exports: {} };
  const mocks = {
    './productRecognitionTrace': { ...require('../src/services/productRecognitionTrace'),
      trazar: (etapa, datos) => trazas.push({ etapa, ...structuredClone(datos) }) },
    './clients.service': { obtenerClienteActual: async () => ({ id: 'images-test', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado, obtenerHistorialRecientePersistido: async () => [],
      guardarConversacionPersistida: async (_id, s) => { estado = JSON.parse(JSON.stringify(s)); } },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './mediaProcessor': { procesarMultimedia: async evento => ({ text: evento.text || '', imageUrl: evento.media?.url || null }) },
    './catalogContextService': { seleccionarCatalogoParaIA: async args => { consultas.push(args); return { catalogo: catalogoDatos, metadata: {} }; },
      seleccionarCatalogoRefinadoVision: () => ({ catalogo, metadata: {} }) },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      llamadas.push(args);
      if (router) { const decision = router(args); if (decision) return decision; }
      if (omitirTodo && !args.clasificacion.revisionImagenIndividual) return { accion: 'responder', intencion: 'imagen',
        consultaCatalogo: { necesaria: false }, respuestaConversacional: '¿Qué productos deseas?' };
      if (falloImagen && args.clasificacion.revisionImagenIndividual && args.imageUrls?.[0].includes('max')) {
        if (falloImagen === 'null') return null;
        throw new Error('fallo simulado');
      }
      if (args.mensaje === 'la de 10.1kg' && !args.imageUrls?.length) return { accion: 'agregar', intencion: 'pedido_producto', confianza: 1,
        producto: { marca: 'MAX CAT', referencia: 'MAX CAT ADULT FRANGO', presentacion: '10.1kg', cantidad: 1 },
        consultaCatalogo: { necesaria: true, consulta: 'MAX CAT ADULT FRANGO 10.1kg' } };
      if (!args.imageUrls?.length && args.clasificacion.decisionHerramientas) return { accion: 'agregar', intencion: 'pedido_producto', confianza: .99,
        consultaCatalogo: { necesaria: true, consulta: 'arena y max cat 10kg' },
        productos: [{ marca: 'ARENA KING CAT', referencia: 'ARENA KING CAT', presentacion: '25kg', cantidad: 1, accion: 'agregar' },
          { marca: 'MAX CAT', referencia: 'MAX CAT', textoVisible: 'max cat x10kg', presentacion: '10kg', cantidad: 1, accion: 'agregar' }] };
      const productos = args.imageUrls?.length === 1 ? [args.imageUrls[0].includes('max') ? max : arena]
        : omitir ? [arena] : [max, arena];
      return { accion: compra ? 'agregar' : 'consultar', intencion: compra ? 'pedido_producto' : 'consulta_producto', confianza: .99,
        producto: structuredClone(productos[0]), productos: structuredClone(productos),
        consultaCatalogo: { necesaria: !omitir, consulta: !omitir ? 'max cat y arena king cat' : null },
        respuestaConversacional: 'Veo arena para gatos King Cat de 25 kg. ¿Te cotizo disponibilidad?' };
    } },
    './humanizer': { humanizarRespuesta: async (_m, base) => base },
  };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { module: modulo, require: n => mocks[n] || req(n), process, console: { log() {}, error() {} } });
  return { estado: () => estado, consultas, llamadas, trazas, enviar: async (eventos, opciones) => respuestaParaHistorial(await modulo.exports.responderEventosEntrantes(eventos.map(e => ({ channelUserId: 'test', ...e, media: e.imageUrl ? { type: 'image', url: e.imageUrl } : null })), opciones)) };
}
test('dos imágenes: recupera producto omitido y cotiza sin pedir permiso para buscar', async () => {
  const c = escenario();
  const respuesta = await c.enviar([{ imageUrl: 'fixture:max' }, { imageUrl: 'fixture:arena' }]);
  assert.match(respuesta, /62\.900/);
  assert.match(respuesta, /MAX CAT.*FRANGO/);
  assert.match(respuesta, /1kg: \$27\.400[\s\S]*3kg: \$67\.900[\s\S]*10\.1kg: \$178\.600/);
  assert.doesNotMatch(respuesta, /te cotizo|nombre completo|CASTRAD/i);
  assert.ok(c.estado().ultimaSolicitudProductos.some(p => /MAX CAT.*FRANGO/.test(p.referencia)));
  assert.equal(c.estado().carrito.length, 0);
});

for (const intencion of ['datos_envio', 'metodo_pago']) test(`fotos con ${intencion}: lectura individual recupera referencias y conserva entrega`, async () => {
  const direccion = 'Bloque 1 apto 101';
  const c = escenario({ router: args => !args.clasificacion.revisionImagenIndividual && args.imageUrls?.length
    ? { intencion, accion: 'consultar_pago', producto: null, productos: [],
        entrega: { tipo: 'domicilio', direccion, direccionCompleta: true, metodoPago: 'tarjeta debito o credito' },
        consultaCatalogo: { necesaria: false } }
    : null });
  const respuesta = await c.enviar([{ imageUrl: 'fixture:arena' }, { imageUrl: 'fixture:max' },
    { text: `Para ${direccion}\nTe puedo pagar con tarjeta cuando lo lleven?` }]);
  assert.match(respuesta, /62\.900/);
  assert.match(respuesta, /MAX CAT.*FRANGO/);
  assert.match(respuesta, /1kg: \$27\.400[\s\S]*3kg: \$67\.900[\s\S]*10\.1kg: \$178\.600/);
  assert.doesNotMatch(respuesta, /No pude|reenvi|nombre del producto/);
  assert.equal(c.estado().ultimaSolicitudProductos.length, 2);
  assert.equal(c.estado().datosDomicilio.direccion, direccion);
  assert.equal(c.estado().metodoPago, 'tarjeta debito o credito');
  assert.equal(c.estado().carrito.length, 0, 'la extracción no convierte la foto en compra');
  assert.equal(c.llamadas.filter(a => a.clasificacion.revisionImagenIndividual).length, 2);
});

for (const omision of [false, true]) test(`lecturas reales con dirección/pago llegan al catálogo: omisión conjunta=${omision}`, async () => {
  const fixture = require('./fixtures/imageDeliveryVision.json');
  const c = escenario({ router: args => {
    if (!args.imageUrls?.length) return null;
    return structuredClone(args.clasificacion.revisionImagenIndividual
      ? fixture[args.imageUrls[0].includes('max') ? 'first' : 'second']
      : fixture[omision ? 'omittedJoint' : 'joint']);
  } });
  const respuesta = await c.enviar([{ imageUrl: 'fixture:arena' }, { imageUrl: 'fixture:max' },
    { text: 'Para Bloque 1 apto 101\nTe puedo pagar con tarjeta cuando lo lleven?' }]);
  assert.match(respuesta, /62\.900/);
  assert.match(respuesta, /MAX CAT.*FRANGO/i);
  assert.match(respuesta, /1kg: \$27\.400[\s\S]*3kg: \$67\.900[\s\S]*10\.1kg: \$178\.600/);
  assert.doesNotMatch(respuesta, /No pude|reenvi|CASTRAD|marca necesitas/);
  assert.equal(c.estado().ultimaSolicitudProductos.length, 2, respuesta);
  assert.equal(c.estado().productosConsultados.length, 4);
  assert.equal(c.estado().carrito.length, 0);
});
test('consulta visual única identificada ejecuta catálogo aunque router sugiera preguntar', async () => {
  const c = escenario();
  const respuesta = await c.enviar([{ imageUrl: 'fixture:arena' }]);
  assert.match(respuesta, /62\.900/);
  assert.doesNotMatch(respuesta, /te cotizo/i);
});
test('compra mixta conserva identidad de la foto y ofrece el peso real de la familia', async () => {
  const c = escenario({ omitir: false });
  await c.enviar([{ imageUrl: 'fixture:max' }, { imageUrl: 'fixture:arena' }]);
  const respuesta = await c.enviar([{ text: 'Me regalas la arena y el max cat x 10kg' }]);
  assert.match(respuesta, /62\.900/);
  assert.match(respuesta, /10[.,]1\s*kg/);
  assert.match(respuesta, /178\.600/);
  assert.doesNotMatch(respuesta, /nombre completo|CASTRAD/i);
  assert.equal(c.estado().carrito.length, 2, 'resuelve la aproximación mostrando el peso real');
  const final = respuesta;
  assert.equal(c.estado().carrito.length, 2, final);
  assert.equal(c.estado().carrito.find(p => /MAX CAT/.test(p.referencia)).peso, '10.1kg');
  assert.match(final, /241\.500/);
});

test('dos fotos del mismo producto no duplican la cantidad', async () => {
  const c = escenario({ compra: true });
  const respuesta = await c.enviar([{ imageUrl: 'fixture:arena' }, { imageUrl: 'fixture:arena' }]);
  assert.equal(c.estado().carrito.length, 1, respuesta);
  assert.equal(c.estado().carrito[0].cantidad, 1);
});

test('fallo de una lectura mantiene cotización válida e informa la imagen pendiente', async () => {
  const c = escenario({ falloImagen: true });
  const respuesta = await c.enviar([{ imageUrl: 'fixture:max' }, { imageUrl: 'fixture:arena' }]);
  assert.match(respuesta, /62\.900/);
  assert.match(respuesta, /imagen 1/);
  assert.match(respuesta, /reenviar/);
});
test('peso aproximado resuelve la referencia equivalente de 10.1 kg', () => {
  const interpretacion = { accion: 'agregar', intencion: 'pedido_producto', confianza: 1,
    producto: { marca: 'MAX CAT', referencia: 'MAX CAT ADUL FRANGO', categoria: 'comida', etapa: 'adulto', especie: 'gato', presentacion: '10kg' } };
  const validacion = validarCoincidenciaProducto({ mensaje: 'MAX CAT ADUL FRANGO 10kg', catalogo, interpretacion,
    clasificacion: { intencion: 'busqueda_producto', perfilContexto: 'producto' } });
  assert.equal(validacion.nivel, 'alta');
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo('MAX CAT ADUL FRANGO 10kg', estado, catalogo, aplicarCoincidenciaValidada(interpretacion, validacion));
  assert.match(respuesta, /10[.,]1\s*kg/);
  assert.match(respuesta, /178\.600/);
  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].peso, '10.1kg');
});

for (const marca of ['NUBELIA', 'VERDANIA']) test(`familia ficticia ${marca}: alternativas completas y precios vigentes`, () => {
  const referencias = ['ADUL', 'ADULT'].map((etapa, i) => ({ nombre: `${marca} ${etapa} POLLO`, especie: 'gato', etapa: 'adulto', categoria: 'comida',
    presentaciones: [{ peso: i ? '12.2kg' : '2kg', precio: i ? 142000 : 21000 }] }));
  const datos = [{ marca, referencias }];
  const interpretacion = { accion: 'agregar', intencion: 'pedido_producto', confianza: 1,
    producto: { marca, referencia: referencias[0].nombre, especie: 'gato', etapa: 'adulto', categoria: 'comida', presentacion: '12kg' } };
  const v = validarCoincidenciaProducto({ mensaje: `${marca} adulto pollo 12kg`, catalogo: datos, interpretacion,
    clasificacion: { intencion: 'busqueda_producto', perfilContexto: 'producto' } });
  assert.equal(v.nivel, 'alta');
  const validada = aplicarCoincidenciaValidada(interpretacion, v);
  // El precio de una cotización antigua no debe reemplazar el inventario actual.
  validada.producto.presentacionesEquivalentes.forEach(p => { p.precio = 1; });
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo(`${marca} adulto pollo 12kg`, estado, datos, validada);
  assert.match(respuesta, /12\.2kg.*\$142\.000/);
  assert.doesNotMatch(respuesta, /2kg: \$21\.000/);
  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].precio, 142000);
});

for (const [indice, pesos] of [['A', ['2kg', '7kg']], ['B', ['500gr', '1.5kg', '8kg']], ['C', ['4kg']]]) {
  test(`imagen sin peso ofrece exclusivamente las presentaciones de la referencia ficticia ${indice}`, async () => {
    const marca = `PRUEBA${indice}`, nombre = `${marca} ADULTO`;
    const datos = [{ marca, referencias: [
      { nombre, especie: 'gato', categoria: 'comida', etapa: 'adulto', presentaciones: pesos.map((peso, i) => ({ peso, precio: 10000 + i * 1000 })) },
      { nombre: `${marca} CASTRADO`, especie: 'gato', categoria: 'comida', presentaciones: [{ peso: '99kg', precio: 99000 }] },
    ] }];
    const interpretacion = { accion: 'consultar', intencion: 'consulta_producto', confianza: 1,
      producto: { marca, referencia: nombre, especie: 'gato', categoria: 'comida', etapa: 'adulto',
        observado: { nombre, confianzaIdentidad: 1, presentacion: null, confianzaPresentacion: 0 } } };
    const v = validarCoincidenciaProducto({ mensaje: '', catalogo: datos, interpretacion,
      clasificacion: { intencion: 'imagen', perfilContexto: 'multimedia', requiereVision: true } });
    assert.equal(v.nivel, 'alta');
    const validada = aplicarCoincidenciaValidada(interpretacion, v);
    const estado = crearEstadoInicial();
    const respuesta = resolverConsultaCatalogo('', estado, datos, validada);
    assert.ok(respuesta.includes(`Presentaciones disponibles: ${pesos.join(', ')}`), respuesta);
    assert.doesNotMatch(respuesta, /99kg|CASTRADO/);
    assert.equal(estado.ultimaSeleccion.presentacion, null);
    assert.equal(estado.carrito.length, 0);
    const { humanizarRespuesta } = require('../src/services/humanizer');
    assert.equal(await humanizarRespuesta('', respuesta, { interpretacionIA: validada, estado }), respuesta);
  });
}

test('fotos de lote descartado acompañan dirección y pago sin convertirse en eventos nuevos', async () => {
 const c = escenario({ omitirTodo: true });
 const contextoPendiente = [{ contenidos: [{ text: 'foto alimento', imageUrl: 'fixture:max' }, { text: 'foto arena', imageUrl: 'fixture:arena' }], respuestaGenerada: 'borrador sin enviar' },
   { contenidos: [{ text: 'Para bloque 39 apto 202' }], respuestaGenerada: 'borrador dirección' }];
 const respuesta = await c.enviar([{ messageId: 'pago', text: '¿Puedo pagar con tarjeta?' }], { contextoPendiente });
 const router = c.llamadas[0];
 assert.deepEqual(Array.from(router.imageUrls), ['fixture:max', 'fixture:arena']);
 assert.equal(router.mensaje, '¿Puedo pagar con tarjeta?');
 assert.equal(router.clasificacion.contextoPendiente[1].mensajes[0], 'Para bloque 39 apto 202');
 assert.match(respuesta, /62\.900/); assert.match(respuesta, /1kg: \$27\.400[\s\S]*3kg: \$67\.900[\s\S]*10\.1kg: \$178\.600/);
 assert.equal(c.estado().carrito.length, 0);
 const { construirSolicitudInterprete } = require('../src/services/aiContextOptimizer');
 const solicitud = construirSolicitudInterprete(router);
 assert.match(JSON.stringify(solicitud), /foto alimento/);
 assert.match(JSON.stringify(solicitud), /NO repitas compras/);
 assert.doesNotMatch(JSON.stringify(solicitud), /fixture:max/);
});

test('alternativas consultadas sin peso elegido nunca se agregan todas al carrito', () => {
  const estado = crearEstadoInicial();
  const marca = catalogo.find(m => m.marca === 'MAX CAT');
  const referencia = marca.referencias.find(r => r.nombre === 'MAX CAT ADUL FRANGO');
  estado.productosConsultados = referencia.presentaciones.map(p => ({ marca: marca.marca,
    referencia: referencia.nombre, peso: p.peso, precio: p.precio, cantidad: 1 }));
  const respuesta = resolverConsultaCatalogo('esa referencia', estado, catalogo, {
    accion: 'agregar', intencion: 'pedido_producto', confianza: 1,
    producto: { marca: marca.marca, referencia: referencia.nombre, cantidad: 1 },
  });
  assert.equal(estado.carrito.length, 0);
  assert.match(respuesta, /Qué presentación/);
  assert.match(respuesta, /1kg, 3kg/);
});

test('seleccionar un peso entre alternativas agrega únicamente ese tamaño una vez', () => {
  const estado = crearEstadoInicial();
  const marca = catalogo.find(m => m.marca === 'MAX CAT');
  const referencia = marca.referencias.find(r => r.nombre === 'MAX CAT ADUL FRANGO');
  estado.productosConsultados = referencia.presentaciones.map(p => ({ marca: marca.marca,
    referencia: referencia.nombre, peso: p.peso, precio: p.precio, cantidad: 1 }));
  resolverConsultaCatalogo('la de 3kg', estado, catalogo, {
    accion: 'agregar', intencion: 'pedido_producto', confianza: 1,
    producto: { marca: marca.marca, referencia: referencia.nombre, presentacion: '3kg', cantidad: 1 },
  });
  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].peso, '3kg');
  assert.equal(estado.carrito[0].cantidad, 1);
});

test('un peso solicitado no compra la lista propuesta y confirmar identidad no suma unidades', async () => {
 const c = escenario({ router: args => {
   if (args.mensaje === 'max cat x10kl') return { accion: 'agregar', intencion: 'pedido_producto', confianza: 1,
     productos: ['1kg', '3kg', '10.1kg'].map(presentacion => ({ marca: 'MAX CAT', referencia: 'MAX CAT ADUL FRANGO', presentacion, cantidad: 1 })),
     consultaCatalogo: { necesaria: true, consulta: 'MAX CAT ADUL FRANGO' } };
   if (args.mensaje === 'si esa referencia') return { accion: 'agregar', intencion: 'pedido_producto', confianza: 1,
     producto: { marca: 'MAX CAT', referencia: 'MAX CAT ADULT FRANGO', presentacion: '10.1kg', cantidad: 1 },
     consultaCatalogo: { necesaria: true, consulta: 'MAX CAT ADULT FRANGO 10.1kg' } };
 }});
 const respuesta = await c.enviar([{ text: 'max cat x10kl' }]);
 assert.equal(c.estado().carrito.length, 1, respuesta);
 assert.match(respuesta, /10\.1kg/);
 assert.equal(c.estado().carrito.length, 1);
 assert.equal(c.estado().carrito[0].cantidad, 1);
 const confirmacion = await c.enviar([{ text: 'si esa referencia' }]);
 assert.equal(c.estado().carrito.length, 1, confirmacion);
 assert.equal(c.estado().carrito[0].cantidad, 1, confirmacion);
});

test('dos entidades de arena no cuentan como cobertura de dos imágenes diferentes', async () => {
 const c = escenario({ router: args => args.imageUrls?.length === 2 ? {
   accion: 'agregar', intencion: 'pedido_producto', confianza: 1,
   productos: [structuredClone(arena), { referencia: 'arena', textoVisible: 'la arena de 25kl', presentacion: '25kg', accion: 'agregar' }],
   consultaCatalogo: { necesaria: true, consulta: 'arena 25kg' },
 } : null });
 const respuesta = await c.enviar([{ imageUrl: 'fixture:max' }, { imageUrl: 'fixture:arena' }, { text: 'la arena de 25kl' }]);
 assert.equal(c.llamadas.filter(a => a.clasificacion.revisionImagenIndividual).length, 2);
 assert.match(respuesta, /MAX CAT/);
 assert.match(respuesta, /1kg: \$27\.400[\s\S]*3kg: \$67\.900[\s\S]*10\.1kg: \$178\.600/);
 assert.equal(c.estado().carrito.filter(p => /KING CAT/.test(p.referencia)).length, 1);
 assert.equal(c.estado().carrito[0].cantidad, 1);
 assert.doesNotMatch(respuesta, /nombre completo|No se agregó/);
});

for (const marca of ['NUBELIA', 'VERDANIA']) test(`peso cercano en ${marca} solicita confirmar solo la alternativa, sin agregar`, () => {
 const nombre = `${marca} ADULTO`;
 const datos = [{ marca, referencias: [{ nombre, categoria: 'comida', especie: 'gato',
   presentaciones: [{ peso: '2kg', precio: 21000 }, { peso: '12.2kg', precio: 142000 }] }] }];
 const estado = crearEstadoInicial();
 const lectura = { accion: 'agregar', intencion: 'pedido_producto', confianza: 1,
   producto: { marca, referencia: nombre, presentacion: '12kg',
     referenciasEquivalentes: [nombre], presentacionesEquivalentes: datos[0].referencias[0].presentaciones.map(p => ({ ...p, referencia: nombre })) } };
 const respuesta = resolverConsultaCatalogo(`${nombre} 12kg`, estado, datos, lectura);
 assert.match(respuesta, /12\.2kg/); assert.match(respuesta, /Te sirve esa/);
 assert.doesNotMatch(respuesta, /Qué presentación|Manejamos/);
 assert.equal(estado.carrito.length, 0);
 assert.equal(estado.alternativaPresentacionPendiente.presentacion, '12.2kg');
});

test('10kl conserva solicitud y sí acepta exclusivamente la alternativa 10.1kg', async () => {
 const c = escenario({ router: args => args.mensaje === 'Max cat x10kl' ? {
   accion: 'agregar', intencion: 'pedido_producto', confianza: 1,
   producto: { marca: 'MAX CAT', referencia: 'MAX CAT ADUL FRANGO', presentacion: '10kg', cantidad: 1 },
   consultaCatalogo: { necesaria: true, consulta: 'MAX CAT ADUL FRANGO 10kg' },
 } : args.mensaje === 'si' ? { accion: 'confirmar', intencion: 'confirmacion', confianza: 1,
   consultaCatalogo: { necesaria: false } } : null });
 const respuesta = await c.enviar([{ text: 'Max cat x10kl' }]);
 assert.match(respuesta, /10\.1kg/); assert.doesNotMatch(respuesta, /Qué presentación/);
 assert.equal(c.estado().carrito.length, 1, respuesta);
 assert.equal(c.estado().carrito[0].peso, '10.1kg');
 assert.equal(c.estado().carrito[0].cantidad, 1);
});

test('fallo de revisión individual no crea foto ilegible si la lectura conjunta la identificó', async () => {
 const c = escenario({ omitir: false, falloImagen: true });
 const respuesta = await c.enviar([{ imageUrl: 'fixture:max' }, { imageUrl: 'fixture:arena' }]);
 assert.match(respuesta, /MAX CAT/); assert.match(respuesta, /62\.900/);
 assert.doesNotMatch(respuesta, /reenvi|No pude leer|imagen [12]/);
 assert.equal(c.estado().ultimaSolicitudProductos.some(p => p._imagenSinLectura), false);
});

test('peso explícito posterior a imagen no conserva requierePresentacion cuando ya está elegido', () => {
 const interpretacion = { intencion: 'consulta_producto', accion: 'consultar', confianza: 1,
   producto: { marca: 'MAX CAT', referencia: 'MAX CAT ADUL FRANGO', presentacion: '10.1kg' } };
 const validacion = validarCoincidenciaProducto({ mensaje: 'MAX CAT adulto frango arroz 10.1kg', catalogo, interpretacion,
   clasificacion: { requiereVision: false, intencion: 'busqueda_producto', perfilContexto: 'producto' } });
 assert.equal(validacion.nivel, 'alta');
 const aplicada = aplicarCoincidenciaValidada(interpretacion, { ...validacion, requiereVision: true, presentacionSolicitada: null });
 assert.equal(aplicada.producto.requierePresentacion, false);
 assert.equal(aplicada.producto.presentacion, '10.1kg');
});

for (const falloImagen of [true, 'null']) {
  test(`error técnico ${falloImagen}: no se presenta como foto ilegible`, async () => {
    const c = escenario({ falloImagen });
    const respuesta = await c.enviar([{ imageUrl: 'fixture:max' }, { imageUrl: 'fixture:arena' }]);
    assert.match(respuesta, /62\.900/);
    assert.match(respuesta, /problema temporal/);
    assert.doesNotMatch(respuesta, /No pude (leer|identificar)|marca necesitas/);
    const pendiente = c.estado().ultimaSolicitudProductos.find(p => p._imagenErrorTecnico);
    assert.ok(pendiente);
    assert.equal(pendiente._imagenSinLectura, undefined);
    assert.ok(c.trazas.some(t => t.etapa === 'revision_imagen' && t.resultado === 'error_tecnico'));
  });
  test(`lectura válida sobrevive revisión fallida ${falloImagen}`, async () => {
    const c = escenario({ omitir: false, falloImagen });
    const respuesta = await c.enviar([{ imageUrl: 'fixture:max' }, { imageUrl: 'fixture:arena' }]);
    assert.match(respuesta, /MAX CAT/);
    assert.match(respuesta, /62\.900/);
    assert.doesNotMatch(respuesta, /temporal|reenvi|No pude/);
    assert.equal(c.estado().ultimaSolicitudProductos.length, 2);
  });
}

const vacio = { marca: null, referencia: null, textoVisible: ' ', categoria: null,
  presentacion: null, observado: { nombre: null, presentacion: null, confianzaIdentidad: 0 } };
test('revisión exitosa sin producto se diferencia de error técnico', async () => {
  const c = escenario({ router: args => args.clasificacion.revisionImagenIndividual && args.imageUrls[0].includes('max')
    ? { accion: 'consultar', producto: vacio, productos: [vacio] } : null });
  const respuesta = await c.enviar([{ imageUrl: 'fixture:max' }, { imageUrl: 'fixture:arena' }]);
  assert.match(respuesta, /62\.900/);
  assert.match(respuesta, /No pude identificar/);
  assert.doesNotMatch(respuesta, /problema temporal/);
  assert.ok(c.trazas.some(t => t.etapa === 'revision_imagen' && t.resultado === 'sin_producto'));
});

for (const varias of [false, true]) test(`no hay productos vacíos en productos_combinados: varias=${varias}`, async () => {
  const c = escenario({ router: args => {
    if (args.clasificacion.decisionHerramientas && !args.clasificacion.revisionImagenIndividual) {
      return { accion: 'consultar', intencion: 'consulta_producto', producto: vacio,
        productos: varias ? [vacio, structuredClone(arena)] : [], consultaCatalogo: { necesaria: true } };
    }
    return null;
  } });
  const respuesta = await c.enviar(varias ? [{ imageUrl: 'fixture:max' }, { imageUrl: 'fixture:arena' }] : [{ imageUrl: 'fixture:max' }]);
  assert.match(respuesta, /MAX CAT/);
  assert.doesNotMatch(respuesta, /problema temporal|producto pendiente|No pude/);
  const combinados = c.trazas.find(t => t.etapa === 'productos_combinados').lectura.productos;
  assert.equal(combinados.length, varias ? 2 : 1);
  assert.ok(combinados.every(p => p.observado?.nombre || p.referencia || p.marca));
  if (varias) assert.equal(new Set(combinados.map(p => p.observado.nombre)).size, 2);
});

test('una sola imagen con producto válido y objeto vacío no crea una segunda solicitud', async () => {
  const c = escenario({ router: args => args.clasificacion.decisionHerramientas
    ? { accion: 'consultar', intencion: 'consulta_producto', producto: vacio,
      productos: [structuredClone(max), vacio], consultaCatalogo: { necesaria: true } } : null });
  const respuesta = await c.enviar([{ imageUrl: 'fixture:max' }]);
  assert.match(respuesta, /MAX CAT/);
  assert.doesNotMatch(respuesta, /problema temporal/);
  const lectura = c.trazas.find(t => t.etapa === 'productos_combinados').lectura;
  assert.equal(lectura.productos.length, 1);
  assert.equal(lectura.producto, null);
});

test('la línea comercial en un campo separado no duplica la lectura de la misma referencia', async () => {
  const c = escenario({ router: args => {
    if (!args.clasificacion.decisionHerramientas) return null;
    const p = { ...structuredClone(max), linea: 'Professional Line' };
    if (!args.clasificacion.revisionImagenIndividual) p.observado.nombre += ' Professional Line';
    const productos = args.imageUrls.length === 2 ? [p, structuredClone(arena)]
      : [args.imageUrls[0].includes('max') ? p : structuredClone(arena)];
    return { accion: 'consultar', intencion: 'consulta_producto', productos,
      producto: productos[0], consultaCatalogo: { necesaria: true } };
  } });
  const respuesta = await c.enviar([{ imageUrl: 'fixture:max' }, { imageUrl: 'fixture:arena' }]);
  assert.match(respuesta, /MAX CAT/);
  assert.match(respuesta, /62\.900/);
  assert.equal(c.trazas.find(t => t.etapa === 'productos_combinados').lectura.productos.length, 2);
  assert.equal(c.estado().ultimaSolicitudProductos.length, 2);
});

for (const tecnico of [false, true]) test(`imagen única sin lectura útil: técnico=${tecnico}`, async () => {
  const c = escenario({ falloImagen: tecnico, router: args => {
    if (args.clasificacion.revisionImagenIndividual && tecnico) return null;
    return { accion: 'consultar', intencion: 'imagen', producto: vacio, productos: [] };
  } });
  const respuesta = await c.enviar([{ imageUrl: 'fixture:max' }]);
  assert.match(respuesta, tecnico ? /problema temporal/ : /No pude identificar/);
  assert.doesNotMatch(respuesta, tecnico ? /No pude identificar|No pude leer/ : /problema temporal/);
  assert.equal(c.estado().carrito.length, 0);
  assert.equal(c.consultas.length, 0);
});

for (const [pesos, solicitada, esperada] of [
  [['1kg', '10.1kg'], '10kg', '10.1kg'],
  [['10kg', '10.1kg'], '10kg', '10kg'],
  [['10.05kg', '10.1kg'], '10kg', '10kg'],
  [['1kg', '12kg'], '10kg', '10kg'],
]) test(`peso aproximado solo si es único: ${pesos.join('/')} para ${solicitada}`, () => {
 const datos = [{ marca: 'NUEVA', referencias: [{ nombre: 'NUEVA ADULTO POLLO', especie: 'gato', categoria: 'comida',
   presentaciones: pesos.map(peso => ({ peso, precio: 10000 })) }] }];
 const v = validarCoincidenciaProducto({ mensaje: `NUEVA ADULTO POLLO ${solicitada}`, catalogo: datos,
   clasificacion: { intencion: 'busqueda_producto', perfilContexto: 'producto' } });
 assert.equal(v.nivel, 'alta'); assert.equal(v.presentacionSolicitada, esperada);
 if (solicitada !== esperada) assert.equal(v.equivalenciaPresentacion.catalogo, esperada);
});

for (const compra of [false, true]) test(`dos imágenes sin coincidencias validadas responden con aclaración, compra=${compra}`, async () => {
  const c = escenario({ omitir: false, compra, catalogoDatos: [] });
  const respuesta = await c.enviar([{ imageUrl: 'fixture:max' }, { imageUrl: 'fixture:arena' }]);
  assert.ok(respuesta.trim().length > 0, 'el cliente debe recibir una respuesta aunque no haya cotización ni carrito');
  assert.match(respuesta, /[?]/);
  assert.equal(c.estado().carrito.length, 0);
  assert.ok(c.estado().ultimaSolicitudProductos.every(p => p.estado === 'pendiente'));
  assert.doesNotMatch(respuesta, /Total cotizado|Pedido:|\$/);
});

for (const catalogoDatos of [[], catalogo]) test(`dos imágenes llegan al transporte: catálogo con ${catalogoDatos.length} marcas`, async t => {
  const c = escenario({ omitir: false, catalogoDatos });
  const enviados = [], eventos = [];
  let vaciar;
  const coordinador = require('../src/services/conversationScheduler').crearCoordinador({
    procesar: es => c.enviar(es),
    enviar: async ({ text, alEnviarParte }) => { enviados.push(text); alEnviarParte(text); },
    dividir: require('../src/utils/responseMessages').dividirRespuestaMensajes,
    bufferFactory: ({ alVaciar }) => {
      vaciar = () => alVaciar(eventos.splice(0));
      return { agregar: e => eventos.push(e), cerrar() {} };
    },
  });
  t.after(() => coordinador.cerrar());
  for (const [i, imageUrl] of ['fixture:max', 'fixture:arena'].entries()) {
    await coordinador.recibir({ channelUserId: 'test', recipientId: 'fixture-user',
      phoneNumberId: 'fixture-channel', messageId: String(i), imageUrl });
  }
  vaciar();
  await [...coordinador.estados.values()][0].promesa;
  assert.equal(enviados.length, 1);
  if (!catalogoDatos.length) assert.match(enviados[0], /[?]/);
  else assert.match(enviados[0], /178\.600/);
  assert.doesNotMatch(enviados[0], /No pude completar la respuesta/);
  if (catalogoDatos.length) assert.match(enviados[0], /62\.900/);
  assert.equal(c.estado().carrito.length, 0);
});
