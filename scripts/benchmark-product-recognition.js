// Offline replay: no .env, network, LLM, messaging or persistence.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const fixture = require(path.join(__dirname, '../test/fixtures/recognition-real-2026-10-28.json'));
const { cargarProductos } = require(path.join(root, 'src/repositories/productRepository'));
const { _internals: { seleccionarCatalogoLocal } } = require(path.join(root, 'src/services/catalogContextService'));
const { validarCoincidenciaProducto } = require(path.join(root, 'src/services/productMatchValidator'));
const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'producto', requiereBusquedaProducto: true };
const snapshotPath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, 'productos.json');
const catalogo = process.argv[3] ? JSON.parse(fs.readFileSync(snapshotPath,'utf8')) : cargarProductos();
const times = []; const rows = [];
for (const c of fixture.cases) {
  let result, candidates;
  const samples=[];
  for (let i=0;i<6;i++) {
    const start=performance.now();
    candidates=seleccionarCatalogoLocal({ catalogo, mensaje:c.query, clasificacion }).catalogo;
    const retrieval=performance.now();
    result=validarCoincidenciaProducto({ mensaje:c.query, catalogo:candidates, clasificacion });
    const end=performance.now();
    if(i) samples.push({ retrievalMs:retrieval-start, validationMs:end-retrieval, totalMs:end-start });
  }
  times.push(...samples);
  const names=candidates.flatMap(m=>m.referencias.map(r=>r.nombre));
  const selected=result.coincidencia?.referenciaCatalogo || result.coincidencia?.referencia || null;
  const accepted=c.acceptedReferences || [c.expectedReference];
  const matches=accepted.includes(selected) || accepted.some(n=>result.coincidencia?.referenciasEquivalentes?.includes(n));
  const confident=result.nivel==='alta';
  const outcome=c.expectedReference
    ? confident && matches ? 'correct_identity' : confident ? 'wrong_identity' : 'missed_identity'
    : confident && result.presentacionValida!==false ? 'unexpected_confirmation' : 'requires_confirmation';
  rows.push({ id:c.id, split:c.split, expected:c.expectedReference, expectation:c.expectation,
    goldStatus:c.goldStatus, outcome, retrieved:c.expectedReference?(c.acceptedReferences || [c.expectedReference]).some(n=>names.includes(n)):null,
    level:result.nivel, reason:result.razon, selected,presentationValid:result.presentacionValida,
    samples });
}
const percentile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.ceil(a.length*p)-1)];
const summarize=rows=>({cases:rows.length,identifiable:rows.filter(x=>x.expected).length,
  correct:rows.filter(x=>x.outcome==='correct_identity').length,
  missed:rows.filter(x=>x.outcome==='missed_identity').length,
  wrong:rows.filter(x=>x.outcome==='wrong_identity'||x.outcome==='unexpected_confirmation').length,
  requiresConfirmation:rows.filter(x=>x.outcome==='requires_confirmation').length,
  retrievalMisses:rows.filter(x=>x.retrieved===false).length});
const report={mode:'offline local retrieval + validator; catalog gold status recorded per case; not end-to-end production accuracy',
  catalogSha256:createHash('sha256').update(fs.readFileSync(snapshotPath)).digest('hex'),
  total:summarize(rows),development:summarize(rows.filter(x=>x.split==='development')),
  evaluation:summarize(rows.filter(x=>x.split==='evaluation')),
  latency:Object.fromEntries(['retrievalMs','validationMs','totalMs'].map(k=>[k,{median:percentile(times.map(x=>x[k]),.5),p95:percentile(times.map(x=>x[k]),.95)}])),
  responseLatency:'not measured: requires live Supabase and model; no outgoing messages sent',rows};
console.log(JSON.stringify(report,null,2));
