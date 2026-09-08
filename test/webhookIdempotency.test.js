const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');

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
