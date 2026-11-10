// Offline replay of already-authorized, saved model outputs. No AI client,
// WhatsApp transport, catalog network reads or order writes are invoked.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createHarness } = require('./sales-dialogue-harness');
const report = path.resolve(__dirname, '../../docs/reports/sales-continuity-2026-11-05');
async function run() {
  const corpusFile = path.join(report, 'sales-replay-v2-reviewed.json');
  const traceFile = path.join(report, 'openai-quote-reentry-v2-reviewed.jsonl');
  const corpus = JSON.parse(fs.readFileSync(corpusFile, 'utf8'));
  const captured = fs.readFileSync(traceFile, 'utf8').trim().split('\n').map(JSON.parse);
  const c = structuredClone(corpus.cases[0]);
  c.initialState.productosConsultados.forEach(p => p.contextoCreadoEn = new Date(Date.now() - c.relativeQuoteAgeMs).toISOString());
  c.initialState.ultimaSolicitudProductos.forEach(p => p.contextoCreadoEn = new Date(Date.now() - c.relativePendingAgeMs).toISOString());
  const catalog = JSON.parse(fs.readFileSync(path.resolve(report, corpus.catalogSnapshot), 'utf8'));
  const h = createHarness({ catalogo: catalog.filter(b => c.catalogBrands.includes(b.marca)), initialState: c.initialState,
    history: c.history, interpreter: async ({ mensaje }) => {
      const row = captured.find(r => r.text === mensaje);
      if (!row) throw new Error('No saved interpretation for this input; offline replay cannot infer new turns');
      return structuredClone(row.interpretations[0].result);
    } });
  const results = [];
  for (const turn of c.turns) {
    const result = await h.send(turn.text);
    results.push({ ...result, origin: turn.origin, previousApiResponse: captured.find(r => r.text === turn.text).response });
  }
  const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const output = { at: new Date().toISOString(), mode: 'offline-saved-router-output-base-response', apiCalls: 0,
    whatsappMessages: 0, realOrders: 0, modelHumanizer: false, corpusSha256: sha(corpusFile), traceSha256: sha(traceFile),
    productionFileSha256: sha(path.resolve(__dirname, '../../src/verticals/petshop/orderLogic.js')),
    limitations: 'Original anonymized inputs and saved router outputs; relative timestamps are synthetic. Final humanizer is a passthrough, not a new model call. No end-to-end WhatsApp validation.', results };
  const target = path.join(report, 'next-step-offline-replay.json');
  fs.writeFileSync(target, JSON.stringify(output, null, 2) + '\n');
  return target;
}
if (require.main === module) run().then(console.log).catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { run };
