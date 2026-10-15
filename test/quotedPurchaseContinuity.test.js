const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { completarCompraDesdeCotizaciones } = require('../src/services/quotedPurchaseService');

function escenario({ cantidad = 2, soloMarca = false } = {}) {
  const catalogo = [
    { marca: 'NUTRIALFA', referencias: [{ nombre: 'NUTRIALFA PIEL ADULTO', especie: 'perro', categoria: 'comida',
      presentaciones: [{ peso: '1.5kg', precio: 39500 }, { peso: '3kg', precio: 75900 }, { peso: '8kg', precio: 168000 }] }] },
    { marca: 'PROTECCION', referencias: [{ nombre: 'PROTECCION', especie: 'perro', categoria: 'medicamento',
      presentaciones: [{ peso: '2-4kg', precio: 30000 }, { peso: '4-10kg', precio: 42500 }, { peso: '10-25kg', precio: 60000 }] }] },
  ];
  const solicitudes = [
    { marca: 'NUTRIALFA', referencia: 'NUTRIALFA PIEL ADULTO', textoVisible: 'NUTRIALFA PIEL ADULTO',
      especie: 'perro', intencionPresentaciones: 'todas',
      observado: { nombre: 'NUTRIALFA PIEL ADULTO', presentacion: '1.5kg', confianzaIdentidad: 1, confianzaPresentacion: 1 }, solicitud: {} },
    { marca: 'PROTECCION', referencia: 'PROTECCION', textoVisible: 'PROTECCION para perro', especie: 'perro', cantidad: 2,
      mascotas: [{ nombre: 'Luna', pesoKg: 10.6 }, { nombre: 'Toby', pesoKg: 7.8 }] },
  ];
  let persistido = JSON.stringify(crearEstadoInicial()), turno = 0;
  const archivo = require.resolve('../src/services/conversationService');
  const req = createRequire(archivo), modulo = { exports: {} }, consultas = [], historial = [];
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'quote-test', vertical: 'petshop' }) },
    '../conversation/conversationStore': {
      obtenerConversacionPersistida: async () => JSON.parse(persistido),
      obtenerHistorialRecientePersistido: async () => historial,
      guardarConversacionPersistida: async (_id, estado, meta) => {
        persistido = JSON.stringify(estado);
        if (meta.respuesta) historial.push({ direction: 'inbound', body: meta.mensaje }, { direction: 'outbound', body: meta.respuesta });
      },
    },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './mediaProcessor': { procesarMultimedia: async e => ({ text: e.text, imageUrl: e.media?.url || null }) },
    './catalogContextService': { seleccionarCatalogoParaIA: async args => {
      consultas.push(args);
      return { catalogo, resultadosPorProducto: catalogo.map(m => ({ catalogo: [m] })), metadata: {} };
    }, seleccionarCatalogoRefinadoVision: () => ({ catalogo: [], metadata: {} }) },
    './humanizer': { humanizarRespuesta: async (_m, base) => base },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      if (args.clasificacion.decisionHerramientas) turno++;
      if (turno === 1) return { accion: 'consultar', intencion: 'consulta_producto', confianza: 1,
        productos: args.clasificacion.decisionHerramientas ? structuredClone(solicitudes) : [],
        producto: args.clasificacion.decisionHerramientas ? null
          : structuredClone(solicitudes.find(p => args.mensaje.includes(p.marca))),
        consultaCatalogo: { necesaria: true, consulta: 'NUTRIALFA PIEL ADULTO y PROTECCION' } };
      if (turno === 2) return { accion: 'agregar', intencion: 'pedido_producto', confianza: 1,
        productos: [
          { marca: 'NUTRIALFA', referencia: 'NUTRIALFA PIEL ADULTO', presentacion: '8kg', cantidad: 1, textoVisible: 'nutrialfa de 8kg' },
          { marca: 'PROTECCION', referencia: soloMarca ? null : 'PROTECCION', presentacion: null, especie: null,
            cantidad, textoVisible: 'las pastas', mascotas: [] },
        ], consultaCatalogo: { necesaria: true, consulta: 'NUTRIALFA 8kg y PROTECCION' } };
      return { intencion: 'metodo_pago', accion: 'guardar_datos', consultaCatalogo: { necesaria: false },
        entrega: { metodoPago: 'efectivo' } };
    } },
  };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || req(n), module: modulo, process,
    console: { log() {}, error() {} } });
  return { estado: () => JSON.parse(persistido), catalogo, consultas,
    enviar: (text, imagen = false) => modulo.exports.responderEventoEntrante({ channelUserId: 'quote-test', text,
      ...(imagen ? { media: { type: 'image', url: 'data:image/png;base64,synthetic' } } : {}) }) };
}

for (const soloMarca of [false, true]) test(`cotizacion mixta → compra seleccionada conserva las dos pastas; soloMarca=${soloMarca}`, async () => {
  const app = escenario({ soloMarca });
  const quote = await app.enviar('Precios y tamaños del cuido, y PROTECCION para perros de 10,6 y 7,8 kg', true);
  assert.match(quote, /4-10kg.*42\.500/);
  assert.equal(app.estado().ultimaSolicitudProductos[0].estado, 'pendiente');
  assert.equal(app.estado().ultimaSolicitudProductos[1].presentacion, '4-10kg');
  const respuesta = await app.enviar('Me regalas el nutrialfa de 8kg y las 2 pastas por favor');
  const carrito = app.estado().carrito;
  assert.equal(carrito.length, 2, respuesta);
  const pasta = carrito.find(p => p.marca === 'PROTECCION');
  assert.equal(pasta.peso, '4-10kg');
  assert.equal(pasta.cantidad, 2);
  assert.equal(carrito.find(p => p.marca === 'NUTRIALFA').peso, '8kg');
  assert.equal(carrito.reduce((n, p) => n + p.precio * p.cantidad, 0), 253000);
  assert.match(respuesta, /253\.000/);
  assert.doesNotMatch(respuesta, /cu[aá]nto pesa|perro o gato|[Qq]u[eé] presentaci[oó]n|75\.900|39\.500/);
  assert.ok(app.estado().ultimaSolicitudProductos.every(p => p.estado === 'identificado'));
  await app.enviar('Pago en efectivo');
  assert.equal(app.estado().carrito.find(p => p.marca === 'PROTECCION').cantidad, 2);
});

test('cantidad nueva prevalece y el precio se valida de nuevo en catalogo', async () => {
  const app = escenario({ cantidad: 1 });
  await app.enviar('Precios y tamaños del cuido y PROTECCION para las mascotas', true);
  app.catalogo[1].referencias[0].presentaciones[1].precio = 44000;
  await app.enviar('Me regalas nutrialfa de 8kg y una sola pasta');
  const pasta = app.estado().carrito.find(p => p.marca === 'PROTECCION');
  assert.equal(pasta?.cantidad, 1);
  assert.equal(pasta.precio, 44000);
});

function memoria(opciones = {}) {
  return { ultimaSolicitudProductos: [{ accion: 'consultar', estado: 'identificado', marca: 'ALFA', referencia: 'ALFA ORIGINAL', especie: 'perro',
    contextoCreadoEn: new Date().toISOString(),
    cotizacion: [{ marca: 'ALFA', referencia: 'ALFA ORIGINAL', peso: '4-10kg', cantidad: 2, precio: 45000 }], ...opciones }] };
}
const comprar = producto => ({ accion: 'agregar', producto });

test('no agrega otros productos cotizados que no fueron solicitados', () => {
  const decision = completarCompraDesdeCotizaciones(comprar({ marca: 'ALFA', cantidad: 2 }), memoria());
  assert.equal(decision.producto.presentacion, '4-10kg');
  assert.equal(decision.producto.cantidad, 2);
  assert.equal(decision.productos.length, 0);
});

test('no hereda una presentacion ambigua, vencida o incompatible', () => {
  const casos = [
    [memoria({ cotizacion: [...memoria().ultimaSolicitudProductos[0].cotizacion,
      { marca: 'ALFA', referencia: 'ALFA ORIGINAL', peso: '10-25kg', precio: 55000 }] }), { marca: 'ALFA' }],
    [memoria({ contextoCreadoEn: '2020-01-01' }), { marca: 'ALFA' }],
    [memoria(), { marca: 'ALFA', referencia: 'ALFA OTRA' }],
    [memoria(), { marca: 'ALFA', especie: 'gato' }],
    [memoria(), { marca: 'ALFA', presentacion: '10-25kg' }],
    [memoria(), { marca: 'ALFA', mascotas: [{ nombre: 'Otra mascota', pesoKg: 25 }] }],
  ];
  for (const [estado, producto] of casos) {
    const decision = comprar(producto);
    assert.equal(completarCompraDesdeCotizaciones(decision, estado), decision);
  }
});

test('una consulta y una exclusion no se convierten en compra desde cotizacion', () => {
  for (const decision of [{ accion: 'consultar', producto: { marca: 'ALFA' } },
    { accion: 'agregar', carrito: { operacion: 'quitar' }, producto: { marca: 'ALFA' } }]) {
    assert.equal(completarCompraDesdeCotizaciones(decision, memoria()), decision);
  }
});
