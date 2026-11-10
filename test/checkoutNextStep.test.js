const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHarness } = require('../scripts/evaluation/sales-dialogue-harness');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const logic = require('../src/verticals/petshop/orderLogic');
const dir = '../docs/reports/sales-continuity-2026-11-05/';
const frozen = require(dir + 'sales-replay-v2-reviewed.json');
const snapshot = require('../docs/reports/real-conversations-2026-10-30/catalog.json');
const captured = fs.readFileSync(require.resolve(dir + 'openai-quote-reentry-v2-reviewed.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const other = { intencion: 'otro', accion: null, confianza: .9, consultaCatalogo: { necesaria: false }, continuarFlujo: false };

function replay() {
  const c = structuredClone(frozen.cases[0]);
  c.initialState.productosConsultados.forEach(p => p.contextoCreadoEn = new Date(Date.now() - c.relativeQuoteAgeMs).toISOString());
  c.initialState.ultimaSolicitudProductos.forEach(p => p.contextoCreadoEn = new Date(Date.now() - c.relativePendingAgeMs).toISOString());
  return createHarness({ catalogo: snapshot.filter(b => c.catalogBrands.includes(b.marca)), initialState: c.initialState,
    history: c.history, interpreter: async ({ mensaje }) => structuredClone(captured.find(r => r.text === mensaje)?.interpretations[0].result || other) });
}
function onlyMissing(response) {
  assert.match(response, /- nombre completo/);
  assert.match(response, /- celular/);
  assert.match(response, /- método de pago/);
  assert.doesNotMatch(response, /- direccion completa|avanzamos con la entrega|Seguimos con la entrega|cedula o NIT|- correo/);
}
test('replay offline de la interpretación OpenAI guardada: dirección pide solo datos faltantes', async () => {
  const h = replay();
  const r = await h.send(captured[0].text);
  onlyMissing(r.response);
  assert.equal(r.state.carrito[0].cantidad, 1);
  assert.equal(r.state.carrito[0].precio, 98000);
  assert.equal(r.state.pedidoConfirmado, false);
  assert.equal(r.state.esperandoConfirmacionPedido, false);
  assert.equal(r.state.esperandoDatosDomicilio, true);
});

test('regresión de las dos interpretaciones reales v3: dirección y datos sin factura', async () => {
  const rows = fs.readFileSync(require.resolve(dir + 'openai-checkout-v3-no-invoice-network.jsonl'), 'utf8')
    .trim().split('\n').map(JSON.parse).filter(r => !r.calls.some(c => c.error));
  assert.equal(rows.length, 2);
  const c = structuredClone(require(dir + 'sales-replay-v3.json').cases[0]);
  c.initialState.productosConsultados.forEach(p => p.contextoCreadoEn = new Date(Date.now() - c.relativeQuoteAgeMs).toISOString());
  c.initialState.ultimaSolicitudProductos.forEach(p => p.contextoCreadoEn = new Date(Date.now() - c.relativePendingAgeMs).toISOString());
  const h = createHarness({ catalogo: snapshot.filter(b => c.catalogBrands.includes(b.marca)), initialState: c.initialState, history: c.history,
    interpreter: async ({ mensaje }) => structuredClone(rows.find(r => r.text === mensaje).interpretations[0].result) });
  onlyMissing((await h.send(rows[0].text)).response);
  const r = await h.send(rows[1].text);
  assert.equal(r.state.facturacionElectronica, false);
  assert.equal(r.state.pedidoConfirmado, false);
  assert.equal(r.state.esperandoConfirmacionPedido, true);
  assert.equal(r.state.carrito[0].cantidad, 1);
  assert.match(r.response, /Calle 10 # 20-30/);
  assert.doesNotMatch(r.response, /datos que faltan|cedula o NIT|- correo/);
});

for (const invoice of [false, true]) test(`replay completo en memoria: corrección dirección y factura=${invoice}`, async () => {
  const h = replay();
  onlyMissing((await h.send(captured[0].text)).response);
  const corrected = await h.send('Calle 11 # 21-31');
  onlyMissing(corrected.response);
  let r = await h.send(captured[1].text);
  assert.match(r.response, /Calle 11 # 21-31/);
  assert.doesNotMatch(r.response, /Mz 8 casa 22/);
  if (invoice) {
    r = await h.send('Necesito factura electrónica');
    assert.match(r.response, /cedula o NIT/);
    assert.match(r.response, /- correo/);
    assert.doesNotMatch(r.response, /- nombre completo|- celular|- direccion completa|- método de pago/);
    r = await h.send('NIT: 900000001-1; correo: prueba@example.com');
  }
  assert.equal(r.state.pedidoConfirmado, false);
  assert.equal(r.state.esperandoConfirmacionPedido, true);
  assert.match(r.response, /98\.000/);
  const local = h.state();
  logic.resolverConsultaCatalogo('confirmo el pedido', local, [], { intencion: 'confirmacion', accion: 'confirmar', confianza: 1, consultaCatalogo: { necesaria: false } });
  assert.equal(local.pedidoConfirmado, true);
  assert.equal(h.state().pedidoConfirmado, false);
});

// Synthetic cross-product controls. Operations use the pure business engine;
// there is no order persistence or customer transport in this test.
const a = { marca: 'ALFA', referencia: 'ALFA ADULTO', peso: '1kg', cantidad: 1, precio: 10000 };
const b = { marca: 'BETA', referencia: 'BETA ARENA', peso: '5kg', cantidad: 1, precio: 20000 };
for (const operation of ['modificar_cantidad', 'agregar', 'quitar', 'mantener_solo']) {
  for (const complete of [false, true]) test(`carrito ${operation}, datos completos=${complete}: conserva entrega y vuelve a confirmar`, () => {
    const state = { ...crearEstadoInicial(), carrito: [{ ...a }, { ...b }], entrega: { tipo: 'domicilio' },
      datosDomicilio: { direccion: 'Calle 11 # 21-31', ...(complete ? { nombre: 'Cliente Prueba', celular: '3000000000' } : {}) },
      metodoPago: complete ? 'efectivo' : null, esperandoConfirmacionPedido: true, pedidoConfirmado: true };
    const result = logic.resolverOperacionCarritoIA('ajusta ALFA ADULTO', state, [], { confianza: 1,
      carrito: { operacion: operation, ...(operation === 'modificar_cantidad' ? { cantidadObjetivo: 3 } : {}) },
      producto: { marca: a.marca, referencia: a.referencia, presentacion: a.peso, cantidad: 2 } });
    assert.equal(state.pedidoConfirmado, false, result);
    assert.equal(state.datosDomicilio.direccion, 'Calle 11 # 21-31');
    assert.equal(state.esperandoConfirmacionPedido, complete, result);
    if (complete) {
      assert.match(result, /Calle 11 # 21-31/);
      assert.match(result, /finalizamos el pedido/);
      assert.doesNotMatch(result, /datos que faltan/);
    } else onlyMissing(result);
    assert.equal(state.carrito.length, ['quitar', 'mantener_solo'].includes(operation) ? 1 : 2);
    if (['agregar', 'modificar_cantidad'].includes(operation)) assert.equal(state.carrito[0].cantidad, 3);
  });
}

for (const invoice of [false, true]) test(`conversación completa con cambios de carrito después de datos, factura=${invoice}`, async () => {
  const h = createHarness({ catalogo: [], initialState: { carrito: [{ ...a }, { ...b }], entrega: { tipo: 'domicilio' } },
    interpreter: async ({ mensaje }) => mensaje.startsWith('Deja tres') ? { ...other, confianza: 1, accion: 'modificar_cantidad',
      carrito: { operacion: 'modificar_cantidad', cantidadObjetivo: 3 }, producto: { marca: a.marca, referencia: a.referencia, presentacion: a.peso } }
      : mensaje.startsWith('Quita') ? { ...other, confianza: 1, accion: 'quitar', carrito: { operacion: 'quitar' },
        producto: { marca: b.marca, referencia: b.referencia, presentacion: b.peso } } : other });
  onlyMissing((await h.send('Calle 10 # 20-30')).response);
  await h.send('Nombre: Cliente Prueba; celular: 3000000000; pago: efectivo');
  if (invoice) {
    await h.send('Necesito factura electrónica');
    await h.send('NIT: 900000001-1; correo: prueba@example.com');
  }
  let r = await h.send('Deja tres ALFA ADULTO de 1kg');
  assert.equal(r.state.carrito[0].cantidad, 3, r.response);
  assert.match(r.response, /50\.000/);
  assert.match(r.response, /Calle 10 # 20-30/);
  assert.equal(r.state.esperandoConfirmacionPedido, true);
  r = await h.send('Calle 11 # 21-31');
  assert.match(r.response, /Calle 11 # 21-31/);
  assert.doesNotMatch(r.response, /Calle 10 # 20-30/);
  r = await h.send('Quita BETA ARENA de 5kg');
  assert.equal(r.state.carrito.length, 1, r.response);
  assert.match(r.response, /30\.000/);
  assert.match(r.response, /Calle 11 # 21-31/);
  assert.equal(r.state.pedidoConfirmado, false);
  assert.equal(r.state.esperandoConfirmacionPedido, true);
  assert.doesNotMatch(r.response, /datos que faltan|avanzamos con la entrega|Seguimos con la entrega/);
  assert.equal(r.state.facturacionElectronica, invoice);
  const local = h.state();
  logic.resolverConsultaCatalogo('confirmo el pedido', local, [], { intencion: 'confirmacion', accion: 'confirmar', confianza: 1, consultaCatalogo: { necesaria: false } });
  assert.equal(local.pedidoConfirmado, true);
  assert.equal(h.state().pedidoConfirmado, false);
});

test('retirar todas las unidades nunca solicita datos ni confirma un carrito vacío', () => {
  const state = { ...crearEstadoInicial(), carrito: [{ ...a }], entrega: { tipo: 'domicilio' }, datosDomicilio: { direccion: 'Calle 10 # 20-30' } };
  const r = logic.resolverOperacionCarritoIA('quita una unidad', state, [], { confianza: 1, carrito: { operacion: 'modificar_cantidad', cantidadDelta: -1 },
    producto: { marca: a.marca, referencia: a.referencia } });
  assert.equal(state.carrito.length, 0);
  assert.match(r, /pedido quedó vacío/);
  assert.equal(state.esperandoConfirmacionPedido, false);
  assert.doesNotMatch(r, /datos que faltan/);
});

test('datos de un pedido anterior requieren confirmar dirección antes de continuar', () => {
  const state = { ...crearEstadoInicial(), carrito: [{ ...a }], entrega: { tipo: 'domicilio' }, pedidoNuevoConDatosPrevios: true,
    datosPreviosConfirmados: false, datosDomicilio: { nombre: 'Cliente Prueba', celular: '3000000000', direccion: 'Calle 10 # 20-30' }, metodoPago: 'efectivo' };
  const r = logic.resolverOperacionCarritoIA('dos unidades', state, [], { confianza: 1, carrito: { operacion: 'modificar_cantidad', cantidadObjetivo: 2 },
    producto: { marca: a.marca, referencia: a.referencia } });
  assert.match(r, /misma dirección/);
  assert.equal(state.esperandoConfirmacionDatosPrevios, true);
  assert.equal(state.esperandoConfirmacionPedido, false);
  assert.equal(state.pedidoConfirmado, false);
});
