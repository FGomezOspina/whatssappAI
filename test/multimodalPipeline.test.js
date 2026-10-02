const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { extraerEventos } = require('../src/providers/kapsoMessagingProvider');
const { crearCoordinador } = require('../src/services/conversationScheduler');
const silent = { log() {}, warn() {}, error() {} };
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
function load(path, mocks, extra = {}) {
  const file = require.resolve(path), req = createRequire(file), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, require: name => mocks[name] || req(name), process, console: silent,
    Buffer, URL, AbortController, setTimeout, clearTimeout, fetch: (...args) => global.fetch(...args), ...extra,
  });
  return module.exports;
}
function gate() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function setup(t, { blocked, failMedia, blockedDownload } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const states = new Map(), messages = new Map(), calls = [], sent = [], typed = [], downloads = [], transcripts = [], summaries = [];
  let active = 0, maximum = 0, runs = 0;
  t.mock.method(global, 'fetch', async url => {
    downloads.push(url);
    if (failMedia && url.includes('bad')) return new Response('', { status: 403 });
    if (blockedDownload && url.endsWith('.ogg')) await blockedDownload.promise;
    return new Response(Buffer.from(url.endsWith('.ogg') ? 'audio' : 'image'), { headers: { 'content-type': url.endsWith('.ogg') ? 'audio/ogg' : 'image/jpeg' } });
  });
  class AI {
    constructor() { this.audio = { transcriptions: { create: async args => { transcripts.push(args); return { text: 'Detalles hablados del producto' }; } } }; }
    static async toFile(buffer, filename) { return { buffer, filename }; }
  }
  const media = load('../src/services/mediaProcessor', { openai: AI }, { process: { env: { OPENAI_API_KEY: 'synthetic', MEDIA_DOWNLOAD_RETRIES: '0' } } });
  const repo = {
    supabaseConfigurado: () => true,
    buscarConversacion: async user => states.has(user) ? { state: structuredClone(states.get(user)) } : null,
    guardarConversacion: async (user, state) => { states.set(user, structuredClone(state)); return { id: user }; },
    guardarMensaje: async (user, direction, body, _id, _client, metadata = {}) => {
      messages.set(`${user}:${direction}:${metadata.eventKey}`, { user, direction, body, metadata: structuredClone(metadata) });
    },
    buscarMensajesRecientes: async (user, _n, _client, options) => [...messages.values()].filter(m => m.user === user && m.metadata.turnId !== options.excluirTurno),
    guardarPedidoConfirmado: async () => null,
  };
  const store = load('../src/conversation/conversationStore', {
    '../repositories/supabaseConversationRepository': repo,
    '../repositories/learningRepository': { capturarAprendizaje: async () => {} },
  });
  const service = load('../src/services/conversationService', {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'tenant', vertical: 'petshop' }) },
    '../conversation/conversationStore': store,
    './mediaProcessor': media,
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      calls.push(args);
      if (blocked && calls.length === 1) await blocked.promise;
      return { intencion: 'conversacion', accion: 'conversar', consultaCatalogo: { necesaria: false }, respuestaConversacional: `Respuesta ${calls.length}` };
    } },
    './humanizer': { humanizarRespuesta: async (_m, response) => response },
  });
  const c = crearCoordinador({ ventanaMs: 5000,
    procesar: async events => { active++; maximum = Math.max(maximum, active); runs++; try { return await service.responderEventosEntrantes(events); } finally { active--; } },
    enviar: async e => sent.push(e), typing: async e => typed.push(e), onSummary: s => summaries.push(s),
  });
  t.after(() => c.cerrar());
  let sequence = 0;
  function event(type, user = 'A', id = String(++sequence)) {
    const message = { id, from: user, type, kapso: { direction: 'inbound' } };
    if (type === 'text') message.text = { body: 'Necesito este producto' };
    else message[type] = { id: `file-${id}`, url: `https://media.example/${id}.${type === 'image' ? 'jpg' : 'ogg'}` };
    return extraerEventos({ event: 'whatsapp.message.received', phone_number_id: 'channel', message })[0];
  }
  return { c, calls, sent, typed, downloads, transcripts, summaries, messages, event,
    receive: async (...args) => { const e = event(...args); await c.recibir(e); return e; },
    tick: async ms => { t.mock.timers.tick(ms); await settle(); },
    get maximum() { return maximum; }, get runs() { return runs; },
  };
}
for (const types of [ ['text'], ['image'], ['audio'], ['text','image'], ['image','text'], ['text','audio'], ['audio','text'], ['image','audio'], ['audio','image'], ['text','image','audio'], ['image','image'], ['audio','audio'], ['text','text','text'], ['voice','text'] ]) {
  test(`normalizador → buffer → agente real: ${types.join(' → ')}`, async t => {
    const x = setup(t);
    for (let i = 0; i < types.length; i++) { if (i) await x.tick(2000); await x.receive(types[i]); assert.equal(x.calls.length, 0); }
    await x.tick(4999); assert.equal(x.calls.length, 0);
    await x.tick(1);
    assert.equal(x.runs, 1); assert.equal(x.sent.length, 1); assert.equal(x.typed.length, 1); assert.equal(x.maximum, 1);
    assert.equal(x.calls.length, 1);
    assert.equal(x.calls[0].imageUrls.length, types.filter(t => t === 'image').length);
    if (types.includes('text')) assert.match(x.calls[0].mensaje, /Necesito este producto/);
    if (types.includes('audio') || types.includes('voice')) assert.match(x.calls[0].mensaje, /Detalles hablados/);
    assert.equal(x.downloads.length, types.filter(t => t !== 'text').length);
    assert.equal(x.transcripts.length, types.filter(t => ['audio','voice'].includes(t)).length);
    assert.equal(x.c.estados.size, 0);
    const groups = x.summaries[0].grupos;
    if (types.includes('image')) { assert.ok(groups.image_download); assert.ok(groups.image_processing); }
    if (types.includes('audio')) { assert.ok(groups.audio_download); assert.ok(groups.audio_processing); assert.ok(groups.audio_transcription); }
  });
}
for (const types of [['image'], ['audio'], ['image','audio']]) {
  test(`multimedia durante OpenAI (${types.join('+')}): descarta y conserva contexto sin paralelismo`, async t => {
    const blocked = gate(), x = setup(t, { blocked });
    await x.receive('text'); await x.tick(5000); assert.equal(x.calls.length, 1);
    for (const type of types) await x.receive(type);
    await x.tick(5000); assert.equal(x.calls.length, 1); assert.equal(x.sent.length, 0);
    blocked.resolve(); await settle();
    assert.equal(x.calls.length, 2); assert.equal(x.sent.length, 1); assert.equal(x.maximum, 1);
    assert.ok(x.calls[1].historialReciente.some(m => m.body === 'Necesito este producto'));
    assert.ok(x.calls[1].historialReciente.every(m => m.direction !== 'outbound'));
    assert.equal(x.downloads.length, types.length); assert.equal(x.typed.length, 2);
  });
}
for (const type of ['audio', 'image']) test(`${type} ya procesado en un ciclo obsoleto y webhook duplicado no se descarga otra vez`, async t => {
  const blocked = gate(), x = setup(t, { blocked });
  const first = await x.receive(type); await x.tick(5000);
  await x.c.recibir({ ...first }); await x.receive('text'); await x.tick(5000);
  blocked.resolve(); await settle();
  assert.equal(x.downloads.length, 1); assert.equal(x.transcripts.length, type === 'audio' ? 1 : 0); assert.equal(x.sent.length, 1);
  assert.ok(x.calls[1].historialReciente.some(m => m.metadata.tipo === type && m.metadata.interpretacion));
  if (type === 'audio') assert.ok(x.calls[1].historialReciente.some(m => /Detalles hablados/.test(m.metadata.transcripcion || '')));
});
test('dos clientes multimedia independientes', async t => {
  const blocked = gate(), x = setup(t, { blocked });
  await x.receive('image', 'A'); await x.tick(5000);
  await x.receive('audio', 'B'); await x.tick(5000);
  assert.equal(x.sent.length, 1); assert.equal(x.sent[0].to, 'B'); assert.equal(x.maximum, 2);
  assert.equal(x.calls[1].historialReciente.length, 0);
  blocked.resolve(); await settle(); assert.equal(x.sent.length, 2); assert.equal(x.c.estados.size, 0);
});
for (const type of ['image','audio']) test(`error de ${type} libera la conversación`, async t => {
  const x = setup(t, { failMedia: true });
  await x.receive(type, 'A', 'bad'); await x.tick(5000);
  assert.equal(x.c.estados.size, 0); assert.match(x.sent[0].text, /No pude procesar ese archivo/);
  await x.receive('text'); await x.tick(5000); assert.equal(x.sent.length, 2); assert.equal(x.c.estados.size, 0);
});
test('un fallo de imagen espera el audio pendiente del mismo lote antes de liberar el lock', async t => {
  const blockedDownload = gate(), x = setup(t, { failMedia: true, blockedDownload });
  await x.receive('image', 'A', 'bad'); await x.receive('audio'); await x.tick(5000);
  assert.equal(x.c.estados.size, 1); assert.equal(x.sent.length, 0);
  await x.receive('text'); await x.tick(5000); assert.equal(x.runs, 1);
  blockedDownload.resolve(); await settle();
  assert.equal(x.runs, 2); assert.equal(x.maximum, 1); assert.equal(x.sent.length, 1);
  assert.equal(x.transcripts.length, 1); assert.equal(x.c.estados.size, 0);
});
