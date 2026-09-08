const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const repository = require('../src/repositories/supabaseConversationRepository');
const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');

function cargarStore() {
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/conversation/conversationStore'), 'utf8'), {
    require: () => repository, module: modulo, process, console: { error() {} },
  });
  return modulo.exports;
}

test('Supabase conserva etapa, clave y recibos tras reiniciar, con aislamiento por client_id', async t => {
  const anteriores = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SECRET_KEY = 'test-secret';
  t.after(() => { for (const [k,v] of Object.entries(anteriores)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const conversaciones = new Map();
  const pedidos = new Map();
  t.mock.method(global, 'fetch', async (url, options) => {
    const u = new URL(url);
    const tabla = u.pathname.split('/').pop();
    if (options.method === 'POST') {
      const row = JSON.parse(options.body);
      if (tabla === 'whatsapp_conversations') {
        row.id = `conv-${row.client_id}`;
        conversaciones.set(`${row.client_id}:${row.channel_user_id}`, row);
        return new Response(JSON.stringify([row]));
      }
      if (tabla === 'whatsapp_orders') {
        assert.equal(u.searchParams.get('on_conflict'), 'client_id,channel_user_id,order_key');
        pedidos.set(`${row.client_id}:${row.channel_user_id}:${row.order_key}`, row);
      }
      return new Response(JSON.stringify([row]));
    }
    const id = u.searchParams.get('client_id').slice(3);
    const usuario = u.searchParams.get('channel_user_id').slice(3);
    const row = conversaciones.get(`${id}:${usuario}`);
    return new Response(JSON.stringify(row ? [row] : []));
  });
  let store = cargarStore();
  const empresaA = { id: 'a', slug: 'nombre-compartido' };
  const empresaB = { id: 'b', slug: 'nombre-compartido' };
  const a = await store.obtenerConversacionPersistida('usuario', empresaA);
  const b = await store.obtenerConversacionPersistida('usuario', empresaB);
  assert.notEqual(a, b);
  Object.assign(a, {
    carrito: [{ marca: 'Prueba', referencia: 'Producto', peso: '1kg', precio: 1000, cantidad: 1 }],
    entrega: { tipo: 'domicilio' }, metodoPago: 'efectivo', esperandoDatosDomicilio: true,
    datosDomicilio: { nombre: 'Prueba', cedula: '0000', celular: '0000', correo: 'prueba@example.com', direccion: 'Calle de prueba 1' },
  });
  resolverConsultaCatalogo('datos completos', a, [], { intencion: 'datos_envio' });
  const key = a.confirmacionPedidoId;
  await store.guardarConversacionPersistida('usuario', a, { cliente: empresaA, idsEventos: ['canal:datos'] });
  store = cargarStore();
  const recuperado = await store.obtenerConversacionPersistida('usuario', empresaA);
  assert.equal(recuperado.esperandoConfirmacionPedido, true);
  assert.equal(recuperado.confirmacionPedidoId, key);
  assert.ok(recuperado.mensajesProcesados.includes('canal:datos'));
  resolverConsultaCatalogo('continuemos con lo acordado', recuperado, [], { intencion: 'confirmacion', accion: 'confirmar', confianza: 0.99 });
  await store.guardarConversacionPersistida('usuario', recuperado, { cliente: empresaA, idsEventos: ['canal:confirmar'] });
  store = cargarStore();
  const confirmado = await store.obtenerConversacionPersistida('usuario', empresaA);
  assert.equal(confirmado.pedidoConfirmado, true);
  assert.equal(confirmado.esperandoConfirmacionPedido, false);
  assert.equal(confirmado.pedidoConfirmadoPendienteGuardar, false);
  assert.equal(confirmado.confirmacionPedidoId, key);
  assert.ok(confirmado.mensajesProcesados.includes('canal:confirmar'));
  // Reintentar el mismo snapshot conserva la clave usada por el indice unico existente.
  confirmado.pedidoConfirmadoPendienteGuardar = true;
  await store.guardarConversacionPersistida('usuario', confirmado, { cliente: empresaA });
  assert.equal(pedidos.size, 1);
  const otro = await store.obtenerConversacionPersistida('usuario', empresaB);
  assert.equal(otro.pedidoConfirmado, false);
  assert.equal(otro.mensajesProcesados.length, 0);
});

test('una falla de lectura no sustituye el estado previo por una conversacion vacia', async t => {
  const anteriores = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY, SUPABASE_REQUEST_RETRIES: process.env.SUPABASE_REQUEST_RETRIES };
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SECRET_KEY = 'test-secret';
  process.env.SUPABASE_REQUEST_RETRIES = '0';
  t.after(() => { for (const [k,v] of Object.entries(anteriores)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  let falla = true;
  t.mock.method(global, 'fetch', async () => {
    if (falla) throw new Error('network failed');
    return new Response(JSON.stringify([{ state: { esperandoConfirmacionPedido: true } }]));
  });
  const store = cargarStore();
  await assert.rejects(store.obtenerConversacionPersistida('usuario', { id: 'a' }), /network/);
  falla = false;
  const estado = await store.obtenerConversacionPersistida('usuario', { id: 'a' });
  assert.equal(estado.esperandoConfirmacionPedido, true);
});
