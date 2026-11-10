// Offline, no .env, no model, messaging or database calls. Freeze fixture before tuning.
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const fixtureArgument = process.argv.find(arg=>arg.startsWith('--fixture='));
const fixture = fixtureArgument ? require(require('node:path').resolve(fixtureArgument.slice('--fixture='.length)))
  : require('../../test/fixtures/distrifinca-business-2026-10-29.json');
const path = 'docs/reports/real-conversations-2026-10-29/catalog.json';
const catalog = JSON.parse(fs.readFileSync(path));
// Reproducible ablation of this audit's only runtime change. The original
// pre-edit capture remains before.json; --baseline disables only this helper.
if(process.argv.includes('--baseline')) require('../../src/utils/catalogQueryNormalization').normalizarKilosAbreviadosCatalogo = text => text;
const { validarCoincidenciaProducto } = require('../../src/services/productMatchValidator');
const { _internals: { seleccionarCatalogoLocal } } = require('../../src/services/catalogContextService');
const clasificacion = { intencion:'busqueda_producto', perfilContexto:'producto', requiereBusquedaProducto:true };
const rows = fixture.cases.map(c => {
  if(c.gold==='incomplete_media') return {id:c.id,chat:c.chat,split:c.split,outcome:'not_evaluable',reason:c.evidence};
  const samples=[]; let result;
  for(let i=0;i<4;i++) {
    const begin=performance.now();
    const candidates=seleccionarCatalogoLocal({catalogo:catalog,mensaje:c.query,clasificacion}).catalogo;
    result=validarCoincidenciaProducto({mensaje:c.query,catalogo:candidates,clasificacion});
    if(i) samples.push(performance.now()-begin);
  }
  const selected=result.coincidencia?.referenciaCatalogo || result.coincidencia?.referencia || null;
  const confident=result.nivel==='alta';
  const exact=selected===c.expectedReference;
  const weightOK=!c.expectedWeight || result.presentacionSolicitada===c.expectedWeight && result.presentacionValida===true;
  const outcome=c.expectedReference ? (confident&&exact&&weightOK?'correct':confident&&!exact?'false_positive':'missed') : confident?'false_positive':'safe_abstention';
  return {id:c.id,chat:c.chat,split:c.split,gold:c.gold,scope:c.kind,direction:c.direction,expectedReference:c.expectedReference||null,
    outcome,selected,level:result.nivel,weight:result.presentacionSolicitada||null,presentationValid:result.presentacionValida,
    reason:result.razon,samplesMs:samples};
});
const summarize = list => Object.fromEntries(['correct','missed','false_positive','safe_abstention','not_evaluable'].map(k=>[k,list.filter(r=>r.outcome===k).length]));
const times=rows.flatMap(r=>r.samplesMs||[]).sort((a,b)=>a-b);
console.log(JSON.stringify({mode:'Local candidate retrieval + identity validator; not model, media perception, cart or WhatsApp E2E accuracy',
  normalizationAblated:process.argv.includes('--baseline'),
  fixtureSha256:createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),
  catalogSha256:createHash('sha256').update(fs.readFileSync(path)).digest('hex'),
  total:summarize(rows),development:summarize(rows.filter(r=>r.split==='development')),
  evaluation:summarize(rows.filter(r=>r.split==='evaluation')),
  latencyLocalMs:{median:times[Math.floor(times.length/2)],p95:times[Math.ceil(times.length*.95)-1]},rows},null,2));
