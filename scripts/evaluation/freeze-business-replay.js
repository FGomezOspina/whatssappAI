// Creates a new immutable audit corpus; never reads .env or contacts services.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'docs/reports/real-conversations-2026-10-29');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const catalogBytes=fs.readFileSync(path.join(dir,'catalog.json')),catalog=JSON.parse(catalogBytes);
const {_internals:{seleccionarCatalogoLocal}}=require('../../src/services/catalogContextService');
const {validarCoincidenciaProducto}=require('../../src/services/productMatchValidator');
const clasificacion={intencion:'busqueda_producto',perfilContexto:'producto',requiereBusquedaProducto:true};
const files=['distrifinca-business-2026-10-29.json','distrifinca-business-followup-2026-10-29.json','distrifinca-business-continuation-2026-10-29.json','distrifinca-business-media-resumption-2026-10-29.json'];
const cases=new Map(),sources=[];
for(const name of files){const p='test/fixtures/'+name,b=fs.readFileSync(path.join(root,p));sources.push({path:p,sha256:sha(b)});for(const c of JSON.parse(b).cases)cases.set(c.id,{...c,sourceFixture:p});}
const refs=catalog.flatMap(m=>m.referencias.map(r=>({...r,brand:m.marca})));
const rows=[...cases.values()].map(c=>{
 const excluded=c.gold==='incomplete_media', query=c.query||'';
 const candidates=excluded?[]:seleccionarCatalogoLocal({catalogo:catalog,mensaje:query,clasificacion}).catalogo;
 const local=excluded?null:validarCoincidenciaProducto({mensaje:query,catalogo:candidates,clasificacion});
 const expected=refs.filter(r=>r.nombre===c.expectedReference);
 return {id:c.id,origin:'real_business_evidence',provenance:c,
  input:{message:query,contextState:null,history:[],derivation:c.inputDerivation||c.kind,contextLimit:'The frozen component input is exactly the earlier benchmark query. Evidence notes are for reviewers, never added as model input or invented dialogue.'},
  expected:{historicalGold:c.gold,referenceIds:c.referenceId?[c.referenceId]:expected.map(r=>r.metadata?.id).filter(Boolean),reference:c.expectedReference||null,presentationId:c.presentationId||null,weight:c.expectedWeight||null,
   decision:excluded?'excluded':c.id==='C16-01'?'clarify_food_form':c.expectedReference?'identify':'abstain_or_clarify',
   annotation:c.id==='C16-01'?'Historical nominal gold retained; frozen query lacks current food form. Old October10 context is not fabricated as fresh state.':null},
  media:{files:[],status:excluded?'missing_not_evaluable':/image|manual/i.test(c.kind||'')?'manual_reconstruction_no_image_bytes':'text_only'},
  candidates:candidates.flatMap(m=>m.referencias.map(r=>({referenceId:r.metadata?.id||null,reference:r.nombre,brand:m.marca}))),
  localResult:local?{level:local.nivel,selected:local.coincidencia?.referenciaCatalogo||local.coincidencia?.referencia||null,reason:local.razon,clarification:local.aclaracion||null,weight:local.presentacionSolicitada||null,presentationValid:local.presentacionValida}:null};
});
const syntheticPath='test/foodIdentityDimensions.test.js',syntheticBytes=fs.readFileSync(path.join(root,syntheticPath));
const out={schemaVersion:1,corpusVersion:'distrifinca-2026-10-30-v1',createdAt:new Date().toISOString(),window:{from:'2026-10-28T00:00:00-05:00',through:'2026-10-29T18:46:00-05:00'},
 scope:'Anonymized partial audit; outgoing account messages are not proof of human authorship. No Sandbox, no synthetic customer history. No independent holdout or E2E claim.',
 catalog:{path:'docs/reports/real-conversations-2026-10-29/catalog.json',sha256:sha(catalogBytes),capturedAt:'2026-10-29T23:52:19.742Z',tenantId:'1d2d79c4-19e0-4a6d-83f1-cf714ee7618b',references:refs.length},
 sources,syntheticControls:{path:syntheticPath,sha256:sha(syntheticBytes),source:syntheticBytes.toString(),scope:'Separate synthetic component controls; observed visual attributes are mocked, never real image understanding. Not sent to OpenAI by this replay.'},cases:rows};
const output=path.join(dir,'frozen-business-replay-v1.json');fs.writeFileSync(output,JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({path:output,cases:rows.length,sha256:sha(fs.readFileSync(output))}));
