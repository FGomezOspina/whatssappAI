// Offline evaluation: real catalog snapshot; semantic router outputs are fixtures.
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'../..');
const catalogo=JSON.parse(fs.readFileSync(path.join(root,'docs/reports/product-context-2026-10-28/catalog-snapshot.json')));
let service=require('../../src/services/conversationService');
if(process.env.PRODUCT_CONTEXT_BASELINE_FILE){
 const file=require.resolve('../../src/services/conversationService'),mod={exports:{}};
 require('node:vm').runInNewContext(fs.readFileSync(process.env.PRODUCT_CONTEXT_BASELINE_FILE,'utf8'),
  {module:mod,require:require('node:module').createRequire(file),process,console});
 service=mod.exports;
}
const {continuarSolicitudProducto}=service._internals;
const {seleccionarCatalogoLocal}=require('../../src/services/catalogContextService')._internals;
const {validarCoincidenciaProducto}=require('../../src/services/productMatchValidator');
const clasificacion={perfilContexto:'pedido',intencion:'busqueda_producto',requiereBusquedaProducto:true};
const outcomes=[];
const refs=catalogo.flatMap(m=>m.referencias.map(r=>({marca:m.marca,...r})));
// Deterministic breadth sample, independent of the incident's brand.
const sample=refs.filter((r,i)=>i%11===0 && r.nombre && r.presentaciones?.length);
for(const r of sample){for(const kind of ['exact','weight']){
 const mensaje=r.nombre+(kind==='weight'?' '+r.presentaciones[0].peso:'');const start=performance.now();
 const candidatos=seleccionarCatalogoLocal({catalogo,mensaje,clasificacion}).catalogo;
 const v=validarCoincidenciaProducto({mensaje,catalogo:candidatos,clasificacion});
 const targets=[v.coincidencia?.referencia,v.coincidencia?.referenciaCatalogo,...(v.coincidencia?.referenciasEquivalentes||[])];
 const recall=candidatos.some(m=>m.marca===r.marca&&m.referencias.some(p=>p.nombre===r.nombre));
 outcomes.push({kind,query:mensaje,recall,selected:v.nivel==='alta',correct:targets.includes(r.nombre),clarification:!!v.aclaracion,ms:performance.now()-start});
}}
for(const [marca,ref,expanded,species] of [['PRO PLAN','UR','CANINE UR','perro'],['PRO PLAN','UR','FELINE UR','gato'],['PRO PLAN','NF','CANINE NF','perro'],['ROYALCANIN','GASTROINTESTINAL','GASTROINTESTINAL PERRO','perro']]){
 for(const mensaje of [species==='perro'?'Para perrito':'Para gatito','Es para un '+species,'La especie que falta es '+species]){
 const p={marca,referencia:ref,especie:null};const state={ultimaConsultaProducto:{creadoEn:new Date().toISOString(),terminos:(marca+' '+ref).toLowerCase().split(' '),aclaracion:{campo:'especie',valores:['perro','gato']},solicitudOriginal:{intencion:'consulta_producto',accion:'consultar',producto:p}}};
 const d={intencion:'consulta_producto',accion:'consultar',confianza:.99,seguimientoProducto:'aclaracion',producto:{...p,referencia:expanded,especie:species},consultaCatalogo:{necesaria:true,consulta:[marca,expanded,species].join(' ')}};
 const start=performance.now(), result=continuarSolicitudProducto(d,state,mensaje),query=result._consultaContinuada||mensaje;
 const candidatos=seleccionarCatalogoLocal({catalogo,mensaje:query,clasificacion}).catalogo;
 const v=validarCoincidenciaProducto({mensaje:query,catalogo:candidatos,clasificacion,interpretacion:result});
 const target=refs.find(r=>r.marca===marca&&r.nombre===marca+' '+expanded)?.nombre;
 outcomes.push({kind:'continuation',query,continued:!!result._consultaContinuada,recall:candidatos.some(m=>m.referencias.some(r=>r.nombre===target)),selected:v.nivel==='alta',correct:v.coincidencia?.referencia===target,clarification:!!v.aclaracion,reason:v.razon,ms:performance.now()-start});
 }}
const latencies=outcomes.map(o=>o.ms).sort((a,b)=>a-b);
const summary={fixture:'Supabase snapshot 2026-10-28; no live LLM',cases:outcomes.length,recalled:outcomes.filter(o=>o.recall).length,selected:outcomes.filter(o=>o.selected).length,correctSelections:outcomes.filter(o=>o.selected&&o.correct).length,falseSelections:outcomes.filter(o=>o.selected&&!o.correct).length,clarifications:outcomes.filter(o=>o.clarification).length,continuations:outcomes.filter(o=>o.continued).length,p50ms:latencies[Math.floor(latencies.length*.5)],p95ms:latencies[Math.floor(latencies.length*.95)]};
const out=process.argv[2];if(out)fs.writeFileSync(out,JSON.stringify({summary,outcomes},null,2));console.log(JSON.stringify(summary));
