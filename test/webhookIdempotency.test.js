const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');

test('envia cuentas y resumen en dos mensajes ordenados y una consulta posterior solo envia cuentas', async () => {
  const { crearEstadoInicial } = require('../src/conversation/conversationStore');
  const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
  const estado = { ...crearEstadoInicial(),
    carrito: [{ marca: 'Prueba', referencia: 'Alimento', peso: '2kg', precio: 28000, cantidad: 1 }],
    entrega: { tipo: 'domicilio' },
    datosDomicilio: { nombre: 'Cliente Prueba', cedula: '1000000000', celular: '3000000000',
      correo: 'cliente@example.com', direccion: 'Calle 10 # 20-30' } };
  const lectura = { intencion: 'metodo_pago', accion: 'consultar_pago', consultaCatalogo: { necesaria: false },
    entrega: { metodoPago: 'transferencia bancaria' } };
  const archivo = require.resolve('../src/app');
  const localRequire = createRequire(archivo);
  const rutas = {};
  const enviados = [];
  const errores = [];
  const express = () => ({ use() {}, post: (path, handler) => { rutas[path] = handler; }, get() {} });
  express.json = () => () => {};
  const mocks = {
    express,
    './providers/kapsoMessagingProvider': { verificarFirmaWebhook: () => true, extraerEventos: body => body,
      enviarTexto: async value => { await new Promise(setImmediate); enviados.push(value); } },
    './services/conversationService': { responderEventosEntrantes: async eventos =>
      resolverConsultaCatalogo(eventos[0].text, estado, [], lectura) },
    './services/inboundMessageBuffer': { crearBufferMensajesEntrantes: ({ alVaciar }) => ({ agregar: evento => alVaciar([evento]) }) },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: name => mocks[name] || localRequire(name),
    module: modulo, process, setImmediate, console: { log() {}, error: (...args) => errores.push(args) } });
  modulo.exports.crearApp();
  const webhook = rutas['/webhooks/kapso/whatsapp'];
  const res = { status: () => res, send() {} };
  const evento = { channelUserId: 'usuario', recipientId: 'usuario', phoneNumberId: 'canal',
    messageId: 'pago', text: 'Me regalas la cuenta para consignar' };
  webhook({ headers: {}, body: [evento] }, res);
  for (let i = 0; i < 6; i++) await new Promise(setImmediate);
  assert.deepEqual(errores, []);
  assert.equal(enviados.length, 2);
  assert.match(enviados[0].text, /07300007105/);
  assert.match(enviados[0].text, /127200128222/);
  assert.match(enviados[0].text, /@luzg5604/);
  assert.doesNotMatch(enviados[0].text, /Pedido:|finalizamos/);
  assert.match(enviados[1].text, /Total: \$28\.000/);
  assert.match(enviados[1].text, /finalizamos el pedido así/);
  for (const enviado of enviados) {
    assert.equal(enviado.phoneNumberId, 'canal');
    assert.equal(enviado.to, 'usuario');
    assert.doesNotMatch(enviado.text, /AIVANCE_MESSAGE_BREAK/);
  }
  resolverConsultaCatalogo('asi esta bien', estado, [], { intencion: 'confirmacion', accion: 'confirmar',
    confianza: 0.99, consultaCatalogo: { necesaria: false } });
  const confirmado = structuredClone(estado);
  webhook({ headers: {}, body: [{ ...evento, messageId: 'cuentas-otra-vez', text: 'a donde transfiero?' }] }, res);
  for (let i = 0; i < 6; i++) await new Promise(setImmediate);
  assert.equal(enviados.length, 3);
  assert.match(enviados[2].text, /07300007105/);
  assert.doesNotMatch(enviados[2].text, /Pedido:|finalizamos/);
  assert.deepEqual(estado, confirmado);
  assert.deepEqual(errores, []);
});

test('webhooks repetidos no repiten acciones y canales distintos no se bloquean entre si', async () => {
  const archivo = require.resolve('../src/app');
  const localRequire = createRequire(archivo);
  const rutas = {};
  const procesados = [];
  const enviados = [];
  const express = () => ({ use() {}, post: (path, handler) => { rutas[path] = handler; }, get() {} });
  express.json = () => () => {};
  const mocks = {
    express,
    './providers/kapsoMessagingProvider': { verificarFirmaWebhook: () => true, extraerEventos: body => body, enviarTexto: async value => enviados.push(value) },
    './services/conversationService': { responderEventosEntrantes: async eventos => { procesados.push(eventos); return 'respuesta'; } },
    './services/inboundMessageBuffer': { crearBufferMensajesEntrantes: ({ alVaciar }) => ({ agregar: evento => alVaciar([evento]) }) },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: name => mocks[name] || localRequire(name), module: modulo, process, setImmediate, console: { log() {}, error() {} } });
  modulo.exports.crearApp();
  const webhook = rutas['/webhooks/kapso/whatsapp'];
  const res = { status: () => res, send() {} };
  const evento = { channelUserId: 'usuario', recipientId: 'usuario', workspaceId: 'empresa-a', messageId: 'mensaje-1', idempotencyKey: 'mensaje-1', text: 'confirmacion' };
  webhook({ headers: {}, body: [evento, evento] }, res);
  webhook({ headers: {}, body: [evento] }, res);
  webhook({ headers: {}, body: [{ ...evento, workspaceId: 'empresa-b' }] }, res);
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  assert.equal(procesados.length, 2);
  assert.equal(enviados.length, 2);
  assert.deepEqual(procesados.map(items => items[0].workspaceId).sort(), ['empresa-a', 'empresa-b']);
});
