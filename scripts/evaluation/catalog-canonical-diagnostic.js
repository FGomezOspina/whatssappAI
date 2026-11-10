// Offline diagnostic. Generated catalog queries are synthetic, not customer conversations.
const fs=require('node:fs'),{performance}=require('node:perf_hooks');
const {validarCoincidenciaProducto}=require('../../src/services/productMatchValidator');
const {_internals:{seleccionarCatalogoLocal}}=require('../../src/services/catalogContextService');
const {dimensionesReferencia}=require('../../src/utils/foodFormat');
const catalogo=JSON.parse(fs.readFileSync('docs/reports/real-conversations-2026-10-29/catalog.json'));
const clasificacion={intencion:'busqueda_producto',perfilContexto:'producto',requiereBusquedaProducto:true};
const fixtureArg=process.argv.find(a=>a.startsWith('--fixture='));
const frozen=fixtureArg?JSON.parse(fs.readFileSync(fixtureArg.slice(10))).rows:null;
const rows=[];
for(const marca of catalogo) for(const ref of marca.referencias){
 const f=dimensionesReferencia(ref);const query=frozen?frozen.find(r=>r.id===ref.metadata?.id).query:[ref.nombre,f.forma,f.envase].filter(Boolean).join(' ');
 const start=performance.now();const candidates=seleccionarCatalogoLocal({catalogo,mensaje:query,clasificacion}).catalogo;
 const r=validarCoincidenciaProducto({mensaje:query,catalogo:candidates,clasificacion});
 const matches=[r.coincidencia?.referencia,r.coincidencia?.referenciaCatalogo,...(r.coincidencia?.referenciasEquivalentes||[])];
 rows.push({id:ref.metadata?.id,query,expected:ref.nombre,outcome:r.nivel!=='alta'?'clarification':matches.includes(ref.nombre)?'identified':'different_reference',selected:r.coincidencia?.referencia,reason:r.razon,ms:performance.now()-start});
}
console.log(JSON.stringify({scope:frozen?'Frozen synthetic exact names; no format hints, OpenAI, typo coverage or E2E claim':'Synthetic canonical names plus catalog-declared food attributes; no OpenAI, no typo coverage or end-to-end claim',counts:Object.fromEntries(['identified','clarification','different_reference'].map(k=>[k,rows.filter(r=>r.outcome===k).length])),rows},null,2));
