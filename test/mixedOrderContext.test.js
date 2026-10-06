const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { contexto, crearContexto } = require('../src/services/pipelineTelemetry');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { _internals: { normalizarInterpretacion } } = require('../src/services/aiInterpreter');
const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
const { respuestaParaHistorial } = require('../src/utils/responseMessages');
const catalogo = require('../productos.json').filter(m => ['DIAMOND', 'PRO PLAN', 'ARENA MAIZ CAT'].includes(m.marca));
const diamond = { marca: 'DIAMOND', referencia: 'DIAMOND INDOOR CAT', especie: 'gato', categoria: 'comida', presentacion: '500g', textoVisible: 'diamond indoor cat 500g' };
const proplan = { marca: 'PRO PLAN', referencia: 'PRO PLAN POUCH FELINO ADULT', especie: 'gato', categoria: 'comida', subcategoria: 'comida_humeda', etapa: 'adulto', presentacion: '85gr', textoVisible: 'pro plan pouch felino adult 85gr' };
const arena = { marca: 'ARENA MAIZ CAT', referencia: 'ARENA MAIZ CAT', especie: 'gato', categoria: 'arena_sustrato', textoVisible: 'arena maiz cat', accion: 'consultar' };
function cargar(file, mocks) {
  const archivo = require.resolve(file), req = createRequire(archivo), modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || req(n), module: modulo, process, console: { log() {}, error() {} } });
  return modulo.exports;
}
function caso({ conservarLecturaArena = false, catalogoPrueba = catalogo } = {}) {
  let estado = crearEstadoInicial(), decision, revisiones = [];
  const service = cargar('../src/services/conversationService', {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'mixed-test', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado, obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async (_id, st) => { estado = JSON.parse(JSON.stringify(st)); } },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo: catalogoPrueba, metadata: {}, resultadosPorProducto: (decision.productos || []).map(() => ({ catalogo: catalogoPrueba, metadata: {} })) }) },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      if (args.clasificacion.decisionHerramientas || args.clasificacion.revisionOperacion) return normalizarInterpretacion(structuredClone(decision));
      revisiones.push(args.mensaje);
      if (args.mensaje.includes('Solicitud:') && /arena.*ma[ií]z/i.test(args.mensaje)) {
        return normalizarInterpretacion({ accion: 'consultar', intencion: 'consulta_producto', confianza: 1, producto: arena });
      }
      if (args.mensaje.includes('arena') && !conservarLecturaArena) return normalizarInterpretacion({ ...decision, accion: 'consultar', producto: arena, productos: [] });
      return normalizarInterpretacion(structuredClone(decision));
    } },
    './humanizer': { humanizarRespuesta: async (_m, respuesta) => respuesta },
  });
  return { estado: () => estado, revisiones, enviar: async (mensaje, d) => {
    decision = { confianza: 1, consultaCatalogo: { necesaria: true, consulta: mensaje }, ...d };
    return respuestaParaHistorial(await contexto.run(crearContexto('mixed-test'), () => service.responderEventoEntrante({ text: mensaje, channelUserId: 'mixed-test' })));
  } };
}

test('consultas sucesivas y compra mixta conservan ambos productos, tarjeta, dirección y consulta separada', async () => {
  const c = caso();
  for (const producto of [proplan, diamond]) await c.enviar(producto.textoVisible, { accion: 'consultar', intencion: 'consulta_producto', producto });
  assert.ok(c.estado().historialProductosConsultados.some(p => p.referencia === proplan.referencia));
  const mensaje = 'dale me puedes enviar dos de cada uno\ndos diamond y dos pro plan\npara la Mz 34 Casa 5 Piso 2 El poblado 2\nme envias datafono para pago con tarjeta\nahh perdon tienes arena maiz cat';
  const respuesta = await c.enviar(mensaje, { accion: 'agregar', intencion: 'pedido_producto', carrito: { operacion: 'agregar' },
    productos: [{ ...diamond, textoVisible: 'dos diamond', mencionOriginal: 'dos diamond', cantidad: 2, accion: 'agregar' }, { ...proplan, textoVisible: 'dos pro plan', mencionOriginal: 'dos pro plan', cantidad: 2, accion: 'agregar' }, arena],
    entrega: { tipo: 'domicilio', direccion: 'Mz 34 Casa 5 Piso 2 El poblado 2', metodoPago: 'tarjeta' },
  });
  const st = c.estado();
  assert.equal(st.carrito.length, 2, respuesta);
  assert.ok(st.carrito.every(p => p.cantidad === 2));
  assert.equal(st.carrito.reduce((sum, p) => sum + p.precio * p.cantidad, 0), 51400);
  assert.match(st.metodoPago, /tarjeta/);
  assert.match(st.datosDomicilio.direccion, /34.*5.*2/);
  assert.doesNotMatch(respuesta, /transferencia|bancolombia|adulto o cachorro/i);
  assert.equal(st.ultimaSolicitudProductos.find(p => p.referencia === arena.referencia).accion, 'consultar');
  assert.ok(!c.revisiones.some(m => m.includes('Solicitud:') && m.includes('pro plan')), 'una identidad cotizada no necesita reinterpretarse');
});

for (const confirmado of [false, true]) test(`consultar_pago con datáfono no envía cuentas, confirmado=${confirmado}`, () => {
  const estado = crearEstadoInicial();
  estado.carrito = [{ marca: 'DIAMOND', referencia: diamond.referencia, peso: '500gr', precio: 19500, cantidad: 2 }];
  estado.pedidoConfirmado = confirmado;
  const antes = structuredClone(estado.carrito);
  const respuesta = respuestaParaHistorial(resolverConsultaCatalogo('me envías datáfono para pago con tarjeta', estado, [], {
    accion: 'consultar_pago', intencion: 'metodo_pago', consultaCatalogo: { necesaria: false }, entrega: { metodoPago: 'tarjeta' },
  }));
  assert.doesNotMatch(respuesta, /transferencia|bancolombia|davivienda|bre.b/i);
  assert.deepEqual(estado.carrito, antes);
  if (!confirmado) assert.match(estado.metodoPago, /tarjeta/);
});

test('normalización conserva acciones distintas dentro del mismo mensaje', () => {
  const i = normalizarInterpretacion({ accion: 'agregar', productos: [{ ...diamond, accion: 'agregar' }, arena] });
  assert.deepEqual(i.productos.map(p => p.accion), ['agregar', 'consultar']);
});

test('una consulta identificada sin respuesta enviada se incluye con la siguiente', async () => {
  const c = caso();
  await c.enviar(diamond.textoVisible, { accion: 'consultar', intencion: 'consulta_producto', producto: diamond });
  // The mocked transport does not acknowledge delivery: the first reply is pending.
  assert.equal(c.estado().historialProductosConsultados[0].pendienteRespuesta, true);
  const respuesta = await c.enviar(proplan.textoVisible, { accion: 'consultar', intencion: 'consulta_producto', producto: proplan });
  assert.match(respuesta, /DIAMOND INDOOR CAT/);
  assert.match(respuesta, /PRO PLAN POUCH FELINO ADULT/);
  assert.equal(c.estado().carrito.length, 0);
  assert.equal(c.estado().ultimaSolicitudProductos.length, 2);
});

test('el store confirma solamente las cotizaciones realmente enviadas', async () => {
  const { contexto, crearContexto } = require('../src/services/pipelineTelemetry');
  const store = cargar('../src/conversation/conversationStore', {
    '../repositories/supabaseClient': { supabaseConfigurado: () => false },
  });
  const estado = crearEstadoInicial();
  estado.historialProductosConsultados = [diamond, proplan].map(p => ({ ...p, pendienteRespuesta: true }));
  const ctx = crearContexto('test-delivery');
  await contexto.run(ctx, () => store.guardarConversacionPersistida('test', estado, { respuesta: `${diamond.referencia}\n${proplan.referencia}` }));
  assert.ok(estado.historialProductosConsultados.every(p => p.pendienteRespuesta));
  await ctx.alEnviar(`${diamond.referencia} de 500gr por $19.500`);
  assert.equal(estado.historialProductosConsultados[0].pendienteRespuesta, false);
  assert.equal(estado.historialProductosConsultados[1].pendienteRespuesta, true);
});

test('consulta exacta de arena sin peso pasa por conversación y conserva la referencia sin comprarla', async () => {
  const c = caso();
  const respuesta = await c.enviar('arena maiz cat', {
    accion: 'consultar', intencion: 'consulta_producto', producto: {
      marca: null, referencia: null, categoria: 'arena_sustrato', especie: 'gato', textoVisible: 'arena maiz cat',
    },
  });
  assert.match(respuesta, /ARENA MAIZ CAT/);
  assert.doesNotMatch(respuesta, /no encuentro/i);
  assert.equal(c.estado().carrito.length, 0);
  assert.equal(c.estado().ultimaSeleccion.referencia, 'ARENA MAIZ CAT');
  assert.equal(c.estado().historialProductosConsultados.find(p => p.referencia === 'ARENA MAIZ CAT').presentaciones.length, 5);
});

test('caso 4 octubre: consulta descriptiva sin marca reabre catálogo durante domicilio pendiente', async () => {
  const c = caso({ conservarLecturaArena: true });
  Object.assign(c.estado(), {
    carrito: [
      { marca: diamond.marca, referencia: diamond.referencia, peso: '500gr', precio: 19500, cantidad: 2 },
      { marca: proplan.marca, referencia: proplan.referencia, peso: '85gr', precio: 6200, cantidad: 2 },
    ],
    esperandoDatosDomicilio: true, metodoPago: 'tarjeta debito o credito',
    entrega: { tipo: 'domicilio' }, datosDomicilio: { direccion: 'Mz 34 Casa 5 Piso 2 El poblado 2' },
  });
  const carrito = structuredClone(c.estado().carrito);
  const respuesta = await c.enviar('me envias por favor datafono para pago con tarjeta\nahh perdon tiene arena para gatos de Maiz ??? de esa que la bolsa es verde ??', {
    accion: 'consultar', intencion: 'consulta_producto', continuarFlujo: true,
    consultaCatalogo: { necesaria: false, consulta: null },
    entrega: { metodoPago: 'tarjeta' },
    producto: { accion: 'consultar', marca: null, referencia: null,
      categoria: 'arena', subcategoria: 'arena_sanitaria', especie: 'gato',
      condiciones: ['maíz', 'bolsa verde'], textoVisible: 'arena para gatos de maíz bolsa verde' },
  });
  assert.match(respuesta, /ARENA MAIZ CAT/, respuesta);
  assert.doesNotMatch(respuesta, /no encuentro|transferencia/i);
  assert.deepEqual(c.estado().carrito, carrito);
  assert.equal(c.estado().ultimaSeleccion.referencia, 'ARENA MAIZ CAT');
  assert.match(c.estado().metodoPago, /tarjeta/);
});

for (const presentacion of ['x4kg', '4 kilos', 'la de 4 kg por favor']) test(`seleccionar presentación conserva identidad validada y compra: ${presentacion}`, async () => {
  const c = caso({ conservarLecturaArena: true });
  c.estado().carrito = [
    { marca: diamond.marca, referencia: diamond.referencia, peso: '500gr', precio: 19500, cantidad: 2 },
    { marca: proplan.marca, referencia: proplan.referencia, peso: '85gr', precio: 6200, cantidad: 2 },
  ];
  await c.enviar('ahh perdon tiene arena para gatos de Maiz ??? de esa que la bolsa es verde ??', {
    accion: 'consultar', intencion: 'consulta_producto',
    producto: { accion: 'consultar', marca: null, referencia: null, categoria: 'arena_sustrato',
      especie: 'gato', textoVisible: 'arena para gatos de maíz bolsa verde' },
  });
  assert.equal(c.estado().ultimaConsultaProducto.solicitudOriginal.producto.referencia, arena.referencia);
  assert.equal(c.estado().ultimaConsultaProducto.solicitudOriginal.producto.marca, arena.marca);
  const respuesta = await c.enviar(presentacion, { accion: 'agregar', intencion: 'pedido_producto',
    carrito: { operacion: 'agregar' }, producto: { ...arena, accion: 'agregar', presentacion: 'x 4kg', cantidad: 1, textoVisible: presentacion },
  });
  assert.equal(c.estado().carrito.length, 3, respuesta);
  const agregado = c.estado().carrito.find(p => p.referencia === arena.referencia);
  assert.equal(agregado.cantidad, 1);
  assert.equal(agregado.precio, 22900);
  assert.equal(c.estado().carrito.reduce((sum, p) => sum + p.precio * p.cantidad, 0), 74300);
  assert.doesNotMatch(respuesta, /no encuentro/i);
});

test('continuación usa cualquier referencia validada y distingue consulta de compra', async () => {
  const producto = { marca: 'SUSTRATO PAPEL NUBE', referencia: 'SUSTRATO PAPEL NUBE', categoria: 'arena_sustrato', especie: 'gato', textoVisible: 'sustrato papel nube' };
  const datos = [{ marca: producto.marca, referencias: [{ nombre: producto.referencia, categoria: producto.categoria, especie: 'gato', presentaciones: [{ peso: '3kg', precio: 12300 }, { peso: '7kg', precio: 24500 }] }] }];
  const c = caso({ conservarLecturaArena: true, catalogoPrueba: datos });
  await c.enviar(producto.textoVisible, { accion: 'consultar', intencion: 'consulta_producto', producto });
  const consulta = await c.enviar('cuánto cuesta la de 3 kg', { accion: 'consultar', intencion: 'consulta_producto', producto: { ...producto, presentacion: '3kg', textoVisible: '3kg' } });
  assert.match(consulta, /12\.300/);
  assert.equal(c.estado().carrito.length, 0);
  const compra = await c.enviar('envíame la de 7 kg', { accion: 'agregar', intencion: 'pedido_producto', carrito: { operacion: 'agregar' }, producto: { ...producto, cantidad: 1, presentacion: '7kg', textoVisible: '7kg' } });
  assert.equal(c.estado().carrito.length, 1, compra);
  assert.equal(c.estado().carrito[0].referencia, producto.referencia);
  assert.equal(c.estado().carrito[0].peso, '7kg');
});

// Replay the saved semantic outputs, without customer identifiers or live APIs.
test('replay de interpretación guardada: descripción sin marca seguida de 4 kilos', async () => {
  const fixture = require('./fixtures/arena-presentation-followup.json');
  const c = caso({ conservarLecturaArena: true });
  c.estado().carrito = [
    { marca: diamond.marca, referencia: diamond.referencia, peso: '500gr', precio: 19500, cantidad: 2 },
    { marca: proplan.marca, referencia: proplan.referencia, peso: '85gr', precio: 6200, cantidad: 2 },
  ];
  const originales = structuredClone(c.estado().carrito);
  await c.enviar(fixture.consulta.mensaje, { accion: 'consultar', intencion: 'consulta_producto', producto: fixture.consulta.producto });
  const respuesta = await c.enviar(fixture.seleccion.mensaje, { intencion: 'pedido_producto', ...fixture.seleccion.propuestaOperacion });
  assert.deepEqual(c.estado().carrito.slice(0, 2), originales);
  assert.equal(c.estado().carrito.length, 3, respuesta);
  const item = c.estado().carrito[2];
  assert.equal(item.referencia, arena.referencia);
  assert.equal(item.cantidad, 1);
  assert.equal(item.precio, 22900);
  assert.match(item.peso, /4\s*kg/);
  assert.equal(c.estado().carrito.reduce((s, p) => s + p.precio * p.cantidad, 0), 74300);
});

for (const respuestaDesviada of [false, true]) test(`ráfaga de compra y arena seguida de x4kl, lectura desviada=${respuestaDesviada}`, async () => {
  const c = caso({ conservarLecturaArena: true });
  for (const producto of [diamond, proplan]) {
    await c.enviar(producto.textoVisible, { accion: 'consultar', intencion: 'consulta_producto', producto });
    for (const cotizacion of c.estado().historialProductosConsultados) cotizacion.pendienteRespuesta = false;
  }
  const descripcion = { accion: 'consultar', categoria: 'arena_sustrato', especie: 'gato',
    textoVisible: 'arena para gatos de maíz bolsa verde', condiciones: ['maíz', 'bolsa verde'] };
  const respuesta = await c.enviar('dale me puedes enviar por favor dos de cada uno por favor\ndos diamond y dos pro plan\npara la Mz 34 Casa 5 Piso 2 El poblado 2\nme envias por favor datafono para pago con tarjeta\nahh perdon tiene arena para gatos de Maiz ??? de esa que la bolsa es verde ?', {
    accion: 'agregar', intencion: 'pedido_producto', carrito: { operacion: 'agregar' },
    productos: [{ ...diamond, accion: 'agregar', cantidad: 2 }, { ...proplan, accion: 'agregar', cantidad: 2 }, descripcion],
    entrega: { tipo: 'domicilio', direccion: 'Mz 34 Casa 5 Piso 2 El poblado 2', metodoPago: 'tarjeta' },
  });
  assert.match(respuesta, /Total: \$51\.400/);
  assert.match(respuesta, /cedula|cédula/);
  assert.match(respuesta, /presentaci[oó]n/i);
  assert.doesNotMatch(respuesta, /- dirección|- método de pago/);
  const originales = structuredClone(c.estado().carrito);
  const siguiente = await c.enviar('x4kl', { accion: 'agregar', intencion: 'pedido_producto', carrito: { operacion: 'agregar' },
    producto: respuestaDesviada ? { ...proplan, accion: 'agregar', cantidad: 1 } : { ...arena, accion: 'agregar', presentacion: '4kg', cantidad: 1 },
  });
  assert.deepEqual(c.estado().carrito.slice(0, 2), originales);
  assert.equal(c.estado().carrito.length, 3, siguiente);
  assert.equal(c.estado().carrito[2].referencia, arena.referencia);
  assert.equal(c.estado().carrito[2].precio, 22900);
  assert.equal(c.estado().carrito[2].cantidad, 1);
  assert.match(siguiente, /Total: \$74\.300/);
  assert.equal(c.estado().datosDomicilio.direccion, 'Mz 34 Casa 5 Piso 2 El poblado 2');
  assert.match(c.estado().metodoPago, /tarjeta/);
});
