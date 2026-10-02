const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const catalogo = require('../productos.json').filter(m => ['CUTAMYCON', 'BRAVECTO'].includes(m.marca));

function runtime(persistido, decidir) {
  const archivo = require.resolve('../src/services/conversationService');
  const req = createRequire(archivo);
  let guardado = JSON.stringify(persistido), contexto;
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'synthetic', vertical: 'petshop' }) },
    '../conversation/conversationStore': {
      obtenerConversacionPersistida: async () => JSON.parse(guardado),
      obtenerHistorialRecientePersistido: async () => [],
      guardarConversacionPersistida: async (_id, estado) => { guardado = JSON.stringify(estado); },
    },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo, metadata: {} }) },
    './aiInterpreter': { interpretarMensajeCliente: async args => decidir(args) },
    './humanizer': { humanizarRespuesta: async (_m, base, opciones) => { contexto = opciones; return base; } },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || req(n), module: modulo, process, console: { log() {}, error() {} } });
  return { responder: text => modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text }),
    estado: () => JSON.parse(guardado), contexto: () => contexto };
}
function cotizacionGuardada() {
  const estado = crearEstadoInicial();
  estado.ultimaSolicitudProductos = [['CUTAMYCON', 'CUTAMYCON SPRAY', '50ml'], ['BRAVECTO', 'BRAVECTO', '10-20kg']].map(([marca, referencia, peso]) => {
    const ref = catalogo.find(m => m.marca === marca).referencias.find(r => r.nombre === referencia);
    const p = ref.presentaciones.find(p => p.peso === peso);
    // Forma histórica guardada en Supabase: duración solo dentro de metadata.
    const item = { marca, referencia, referenciaCatalogo: referencia, peso, precio: p.precio, cantidad: 1,
      presentaciones: ref.presentaciones.map(p => ({ ...p, referenciaCatalogo: referencia })) };
    return { marca, referencia, presentacion: peso, cantidad: 1, estado: 'identificado', accion: 'consultar', cotizacion: [item] };
  });
  estado.productosConsultados = estado.ultimaSolicitudProductos.flatMap(s => s.cotizacion);
  return estado;
}
for (const modo of ['datos_envio', 'pedido_producto']) {
  test(`recarga cotización antigua y agrega ambas variantes sin repreguntar: ${modo}`, async () => {
    const estado = cotizacionGuardada();
    const productos = estado.productosConsultados.map(p => ({ marca: p.marca, referencia: p.referencia, presentacion: p.peso, cantidad: 1 }));
    const app = runtime(estado, args => args.clasificacion.decisionHerramientas
      ? { intencion: modo, accion: modo === 'datos_envio' ? 'guardar_datos' : 'agregar', confianza: 1,
          productos: modo === 'pedido_producto' ? productos : [],
          consultaCatalogo: { necesaria: modo === 'pedido_producto', consulta: 'cutamycon 50ml y bravecto 10-20kg' },
          entrega: { tipo: 'domicilio', direccion: 'Calle 10 # 20-30 Centro' }, datosCliente: { nombre: 'Cliente Prueba', telefono: '3001234567' } }
      : { intencion: 'pedido_producto', accion: 'agregar', confianza: 1,
          producto: productos.find(p => args.mensaje.toLowerCase().includes(p.marca.toLowerCase())) });
    const respuesta = await app.responder('me los envias por favor, Cliente Prueba, Calle 10 # 20-30 Centro, 3001234567');
    const final = app.estado();
    assert.equal(final.carrito.length, 2, respuesta);
    assert.equal(final.carrito.reduce((n, p) => n + p.precio * p.cantidad, 0), 160000);
    assert.ok(final.ultimaSolicitudProductos.every(p => p.estado === 'identificado'));
    assert.equal(final.ultimaConsultaProducto, null);
    assert.equal(final.carrito.find(p => p.marca === 'BRAVECTO').duracion, '3 meses');
    assert.match(JSON.stringify(final.datosDomicilio), /Cliente Prueba/);
    assert.equal(app.contexto().interpretacionIA.preguntaPendiente, null);
    assert.doesNotMatch(respuesta, /¿Lo necesitas de|falta confirmar duracion/);
  });
}


test('peso, duración y envío sobreviven a recargar el estado en cada turno', async () => {
  const solicitudes = [
    { marca: 'CUTAMYCON', referencia: 'CUTAMYCON SPRAY', textoVisible: 'cutamycon 50ml', presentacion: '50ml', cantidad: 1 },
    { marca: 'BRAVECTO', referencia: 'BRAVECTO', textoVisible: 'bravecto perrito de 14kl', presentacion: '14kg', especie: 'perro', cantidad: 1 },
  ];
  const primero = runtime(crearEstadoInicial(), args => args.clasificacion.decisionHerramientas
    ? { intencion: 'consulta_producto', accion: 'consultar', confianza: 1, productos: solicitudes,
        consultaCatalogo: { necesaria: true, consulta: 'cutamycon 50ml y bravecto perrito de 14kl' } }
    : { intencion: 'consulta_producto', accion: 'consultar', confianza: 1,
        producto: solicitudes.find(p => args.mensaje.toLowerCase().includes(p.marca.toLowerCase())) });
  await primero.responder('cutamycon 50ml y bravecto es un perrito de 14kl');
  assert.equal(primero.estado().ultimaConsultaProducto.aclaracion.campo, 'duracion');
  const segundo = runtime(primero.estado(), () => ({ intencion: 'consulta_producto', accion: 'consultar', confianza: 1,
    producto: { marca: 'BRAVECTO', referencia: 'BRAVECTO', presentacion: '14kg', cantidad: 1 },
    consultaCatalogo: { necesaria: true, consulta: 'bravecto 3 meses' } }));
  const respuestaSegundo = await segundo.responder('3 meses');
  const guardado = segundo.estado();
  assert.ok(guardado.ultimaSolicitudProductos.every(p => p.estado === 'identificado'), JSON.stringify({respuestaSegundo, contexto: segundo.contexto().productoAutonomo, solicitudes: guardado.ultimaSolicitudProductos}));
  const seleccion = guardado.ultimaSolicitudProductos.find(p => p.marca === 'BRAVECTO');
  assert.equal(seleccion.duracion, '3 meses');
  assert.equal(seleccion.cotizacion[0].duracion, '3 meses');
  assert.equal(seleccion.cotizacion[0].peso, '10-20kg');
  const tercero = runtime(guardado, () => ({ intencion: 'datos_envio', accion: 'guardar_datos', confianza: 1,
    consultaCatalogo: { necesaria: false }, entrega: { tipo: 'domicilio', direccion: 'Calle 10 # 20-30 Centro' },
    datosCliente: { nombre: 'Cliente Prueba', telefono: '3001234567' } }));
  const respuesta = await tercero.responder('me los envias por favor, Cliente Prueba, Calle 10 # 20-30 Centro, 3001234567');
  assert.equal(tercero.estado().carrito.length, 2, respuesta);
  assert.equal(tercero.estado().carrito.reduce((s, p) => s + p.precio * p.cantidad, 0), 160000);
  assert.doesNotMatch(respuesta, /¿Lo necesitas de|falta confirmar duracion/);
  // Completar otro dato logístico tampoco debe repetir los productos.
  await tercero.responder('el nombre es Cliente Prueba');
  assert.ok(tercero.estado().carrito.every(p => p.cantidad === 1));
});

test('una solicitud nueva sin duración sigue preguntando; no confunde alternativas con una elección', async () => {
  const anterior = cotizacionGuardada();
  anterior.ultimaSolicitudProductos[1].estado = 'pendiente';
  anterior.ultimaSolicitudProductos[1].cotizacion = [];
  anterior.productosConsultados = [];
  const app = runtime(anterior, () => ({ intencion: 'pedido_producto', accion: 'agregar', confianza: 1,
    productos: [{ marca: 'CUTAMYCON', referencia: 'CUTAMYCON SPRAY', presentacion: '50ml' },
      { marca: 'BRAVECTO', referencia: 'BRAVECTO', presentacion: '10-20kg' }],
    producto: { marca: 'BRAVECTO', referencia: 'BRAVECTO', presentacion: '10-20kg' },
    consultaCatalogo: { necesaria: true, consulta: 'cutamycon 50ml y bravecto 10-20kg' } }));
  await app.responder('quiero cutamycon 50ml y bravecto 10-20kg');
  assert.ok(!app.estado().carrito.some(p => p.marca === 'BRAVECTO'));
  assert.equal(app.estado().ultimaConsultaProducto.aclaracion.campo, 'duracion');
});

test('un cambio explícito de duración prevalece sobre la cotización previa', async () => {
  const productos = [
    { marca: 'CUTAMYCON', referencia: 'CUTAMYCON SPRAY', presentacion: '50ml', textoVisible: 'cutamycon 50ml' },
    { marca: 'BRAVECTO', referencia: 'BRAVECTO 37 DIAS', presentacion: '10-20kg', textoVisible: 'bravecto 10-20kg 37 dias' },
  ];
  const app = runtime(cotizacionGuardada(), args => args.clasificacion.decisionHerramientas
    ? { intencion: 'pedido_producto', accion: 'agregar', confianza: 1, productos,
        consultaCatalogo: { necesaria: true, consulta: 'cutamycon 50ml y bravecto 10-20kg 37 dias' } }
    : { intencion: 'pedido_producto', accion: 'agregar', confianza: 1,
        producto: productos.find(p => args.mensaje.toLowerCase().includes(p.marca.toLowerCase())) });
  await app.responder('me envias cutamycon 50ml y cambia bravecto 10-20kg a 37 dias');
  assert.ok(!app.estado().carrito.some(p => p.marca === 'BRAVECTO'));
  assert.equal(app.estado().ultimaConsultaProducto.razon, 'precio_por_confirmar');
});

test('la selección individual de una cotización también conserva la duración', async () => {
  const guardado = cotizacionGuardada();
  guardado.ultimaSolicitudProductos = guardado.ultimaSolicitudProductos.filter(p => p.marca === 'BRAVECTO');
  guardado.productosConsultados = guardado.ultimaSolicitudProductos.flatMap(p => p.cotizacion);
  const app = runtime(guardado, () => ({ intencion: 'pedido_producto', accion: 'agregar', confianza: 1,
    producto: { marca: 'BRAVECTO', referencia: 'BRAVECTO', presentacion: '10-20kg', cantidad: 2 },
    consultaCatalogo: { necesaria: true, consulta: 'bravecto 10-20kg' } }));
  const respuesta = await app.responder('me envias dos por favor');
  assert.equal(app.estado().carrito.length, 1, respuesta);
  assert.equal(app.estado().carrito[0].duracion, '3 meses');
  assert.equal(app.estado().carrito[0].cantidad, 2);
});
