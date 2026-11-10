// Opt-in isolated production-pipeline replay: real OpenAI and read-only catalog,
// in-memory conversation persistence. No Kapso sends, customer data or orders.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const dir = path.join(root, 'docs/reports/multimedia-2026-10-30');
async function main(args) {
  if (!args.includes('--authorized-openai-test') || !args.includes('--reviewed-product-image')) throw Error('Explicit authorized test and privacy review required');
  const run = args.find(a => a.startsWith('--run='))?.slice(6);
  if (!/^[a-z0-9-]+$/.test(run || '')) throw Error('Unique run label required');
  const output = path.join(dir, run + '.jsonl');
  if (fs.existsSync(output)) throw Error('Run already exists; no automatic paid retry');
  require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
  const { Completions } = require('openai/resources/chat/completions/completions');
  const originalCreate = Completions.prototype.create;
  let calls = [];
  Completions.prototype.create = async function(body, options) {
    const start = Date.now();
    try {
      const r = await originalCreate.call(this, body, { ...options, maxRetries: 0 });
      calls.push({ model: body.model, ms: Date.now() - start, usage: r.usage });
      return r;
    } catch (e) { calls.push({ model: body.model, ms: Date.now() - start, error: { status: e.status, code: e.code } }); throw e; }
  };
  const { crearEstadoInicial } = require('../../src/conversation/conversationStore');
  const { respuestaParaHistorial } = require('../../src/utils/responseMessages');
  const interpreter = require('../../src/services/aiInterpreter');
  const trace = require('../../src/services/productRecognitionTrace');
  const file = path.join(root, 'src/services/conversationService.js'), req = createRequire(file);
  const corpus = JSON.parse(fs.readFileSync(path.join(dir, 'cases-v1.json')));
  const selected = args.find(a => a.startsWith('--cases='))?.slice(8).split(',');
  const continuedRun = args.find(a => a.startsWith('--continue-from='))?.slice(16);
  if (continuedRun && !/^[a-z0-9-]+$/.test(continuedRun)) throw Error('Invalid continuation source');
  const previous = continuedRun ? fs.readFileSync(path.join(dir, continuedRun + '.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) : [];
  for (const c of corpus.cases.filter(c => !selected || selected.includes(c.id))) {
    let state = crearEstadoInicial(), history = [], traces = [], interpretations = [];
    if (continuedRun) {
      const rows = previous.filter(r => r.id === c.id);
      if (!rows.length) throw Error('No saved state for selected case');
      state = structuredClone(rows.at(-1).state);
      history = rows.flatMap(r => [{ role: 'user', content: r.text }, { role: 'assistant', content: r.response }]);
    }
    const module = { exports: {} };
    const mocks = {
      './clients.service': { obtenerClienteActual: async () => ({ id: '1d2d79c4-19e0-4a6d-83f1-cf714ee7618b', slug: 'distrifinca', vertical: 'petshop' }) },
      '../conversation/conversationStore': { obtenerConversacionPersistida: async () => state,
        obtenerHistorialRecientePersistido: async () => history,
        guardarConversacionPersistida: async (_id, s, m = {}) => {
          state = structuredClone(s);
          if (m.mensaje) history.push({ role: 'user', content: m.mensaje });
          if (m.respuesta) history.push({ role: 'assistant', content: m.respuesta });
        } },
      '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
      './mediaProcessor': { procesarMultimedia: async e => ({ text: e.text || '', imageUrl: e.media ?
        'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, 'private/original-two-products.jpeg')).toString('base64') : null }) },
      './productRecognitionTrace': { ...trace, trazar: (stage, data) => traces.push({ stage, ...data }) },
      './aiInterpreter': { ...interpreter, interpretarMensajeCliente: async a => {
        const r = await interpreter.interpretarMensajeCliente(a);
        interpretations.push({ router: !!a.clasificacion.decisionHerramientas, vision: !!a.imageUrls?.length, result: r });
        return r;
      } },
    };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require: n => mocks[n] || req(n), process, console });
    const image = c.id === 'original-image-two-products';
    const turns = continuedRun ? [] : [{ text: c.message, image }];
    const followupStart = Number(args.find(a => a.startsWith('--followup-start='))?.slice(17) || 0);
    if (!Number.isInteger(followupStart) || followupStart < 0 || followupStart > 3 || followupStart && !continuedRun) throw Error('Invalid follow-up start');
    if (image && args.includes('--followups')) turns.push(...['Que presentación tienes', 'y el advance urinary?', 'que presentación tienes de Hills', 'gato'].slice(followupStart).map(text => ({ text })));
    for (const [index, turn] of turns.entries()) {
      calls = []; traces = []; interpretations = [];
      const start = Date.now();
      const response = respuestaParaHistorial(await module.exports.responderEventosEntrantes([
        { channelUserId: 'multireference-anonymous-replay', text: turn.text,
          media: turn.image ? { type: 'image', url: 'local-reviewed-original' } : null } ]));
      const row = { id: c.id, index, at: new Date().toISOString(), text: turn.text, image: !!turn.image,
        mode: 'Isolated production service, real OpenAI and read-only Supabase, in-memory state; no WhatsApp transport',
        ms: Date.now() - start, response, interpretations, traces, calls, state };
      fs.appendFileSync(output, JSON.stringify(row) + '\n');
      console.log(JSON.stringify({ id: row.id, index, response, ms: row.ms, calls: calls.length }));
      if (calls.some(c => c.error)) throw Error('API failure recorded; stop without retry');
      if (state.carrito?.length || state.pedidoConfirmado) throw Error('Unexpected commerce mutation in isolated query');
    }
  }
  Completions.prototype.create = originalCreate;
}
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { main };
