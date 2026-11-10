// Opt-in harness only. No WhatsApp, DB clients, persistence services or orders.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'docs/reports/openai-validation-2026-10-30');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function authorize(args){if(!args.includes('--authorized-openai-test')||!args.includes('--anonymized-inputs-reviewed'))throw Error('Paid replay disabled; requires explicit authorization and reviewed inputs.');}
function modelCatalog(c){return c.map(b=>({marca:b.marca,referencias:b.referencias.map(r=>({nombre:r.nombre,especie:r.especie,categoria:r.categoria,subcategoria:r.subcategoria,etapa:r.etapa,descripcion:r.nombre,metadata:{id:r.metadata?.id},presentaciones:r.presentaciones.map(p=>({peso:p.peso,precio:null,stock:null}))}))}));}
function score(c,r){const name=r.coincidencia?.referenciaCatalogo||r.coincidencia?.referencia||null,ids=r.coincidencia?.presentaciones?.map(p=>p.metadata?.id)||[];if(c.group==='original_frozen')return c.expected.reference?(r.nivel==='alta'&&name===c.expected.reference&&(!c.expected.weight||r.presentacionSolicitada===c.expected.weight&&r.presentacionValida)?'correct':r.nivel==='alta'&&name!==c.expected.reference?'wrong':'missed'):(r.nivel==='alta'?'wrong':'safe_abstention');if(c.expected.decision==='clarify')return r.nivel!=='alta'&&r.alternativas?.some(a=>c.expected.referenceNames.includes(a.referencia))?'useful_clarification':r.nivel==='alta'?'wrong':'missed';if(c.expected.decision==='abstain')return r.nivel==='alta'?'wrong':'safe_abstention';const identity=r.nivel==='alta'&&c.expected.referenceNames.includes(name),pack=c.expected.presentationId?ids.includes(c.expected.presentationId)&&r.presentacionValida:c.expected.presentationVerified===false?!r.presentacionValida:true;return identity?(pack?'correct':'presentation_mismatch'):r.nivel==='alta'?'wrong':'missed';}
async function main(args=process.argv.slice(2)){
 authorize(args);
 if(!JSON.parse(fs.readFileSync(path.join(dir,'availability-diagnostic.json'))).successful)throw Error('Availability not confirmed.');
 const output=path.resolve(args.find(a=>a.startsWith('--output='))?.slice(9)||path.join(dir,'api-results-v1.jsonl'));
 if(fs.existsSync(output)&&!args.includes('--resume'))throw Error('Output exists; explicit resume required to avoid duplicate billing.');
 const prior=fs.existsSync(output)?fs.readFileSync(output,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 if(prior.some(r=>r.error))throw Error('Prior API failure needs review, not an automatic retry.');
 const manifestBytes=fs.readFileSync(path.join(dir,'anonymized-replay-v1.json')),manifest=JSON.parse(manifestBytes),manifestHash=hash(manifestBytes);
 if(prior.some(r=>r.manifestSha256!==manifestHash))throw Error('Manifest changed since run.');
 const {assertProductOnly}=require('./prepare-authorized-openai-replay');
 const selected=args.find(a=>a.startsWith('--cases='))?.slice(8).split(',');
 if(selected?.some(id=>!manifest.cases.some(c=>!c.excluded&&c.id===id)))throw Error('Unknown or excluded case');
 const cases=manifest.cases.filter(c=>!c.excluded&&(!selected||selected.includes(c.id)));for(const c of cases){assertProductOnly(c.input);if(hash(fs.readFileSync(path.join(root,c.sourcePath)))!==c.sourceSha256)throw Error('Source changed');}
 require('dotenv').config({quiet:true});
 const cl={intencion:'busqueda_producto',perfilContexto:'producto',requiereBusquedaProducto:true};
 const model=require('../../src/services/modelRouter').modeloInterprete(cl);
 const {Completions}=require('openai/resources/chat/completions/completions');const create=Completions.prototype.create;let callMeta=null;
 Completions.prototype.create=async function(body,options){const start=Date.now();try{const result=await create.call(this,body,{...options,maxRetries:0});callMeta={model:body.model,ms:Date.now()-start,usage:result.usage};return result;}catch(e){callMeta={model:body.model,ms:Date.now()-start,error:{status:e.status||null,code:e.code||null,name:e.name}};throw e;}};
 const originalLog=console.log,originalWarn=console.warn;console.log=()=>{};console.warn=()=>{};
 const interpreter=require('../../src/services/aiInterpreter').interpretarMensajeCliente;
 const validate=require('../../src/services/productMatchValidator').validarCoincidenciaProducto;
 const retrieve=require('../../src/services/catalogContextService')._internals.seleccionarCatalogoLocal;
 const catalogs=new Map();
 try{for(const c of cases){if(prior.some(r=>r.id===c.id))continue;let catalog=catalogs.get(c.catalog.path);if(!catalog){const bytes=fs.readFileSync(path.join(root,c.catalog.path));if(hash(bytes)!==c.catalog.sha256)throw Error('Frozen catalog changed');catalog=JSON.parse(bytes);catalogs.set(c.catalog.path,catalog);}
 const candidates=retrieve({catalogo:catalog,mensaje:c.input.message,clasificacion:cl}).catalogo;
 const baseline=validate({mensaje:c.input.message,catalogo:candidates,clasificacion:cl});callMeta=null;
 const interpretation=await interpreter({mensaje:c.input.message,estado:{},historialReciente:c.input.history,catalogo:modelCatalog(candidates),ejemplosEntrenamiento:[],clasificacion:cl,model,channelUserId:'audit-'+c.id});
 const common={id:c.id,group:c.group,kind:c.kind,at:new Date().toISOString(),manifestSha256:manifestHash,catalogSha256:c.catalog.sha256,model,call:callMeta};
 if(!interpretation){fs.appendFileSync(output,JSON.stringify({...common,error:'No interpretation returned; stopped without retry'})+'\n');throw Error('API failed at '+c.id);}
 const matched=validate({mensaje:c.input.message,catalogo:candidates,clasificacion:cl,interpretacion:interpretation});
 const row={...common,input:c.input,interpretation,baseline:{outcome:score(c,baseline),result:baseline},withOpenAI:{outcome:score(c,matched),result:matched}};fs.appendFileSync(output,JSON.stringify(row)+'\n');originalLog(JSON.stringify({id:c.id,local:row.baseline.outcome,withOpenAI:row.withOpenAI.outcome,tokens:callMeta?.usage?.total_tokens,ms:callMeta?.ms}));
 }}finally{console.log=originalLog;console.warn=originalWarn;Completions.prototype.create=create;}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={authorize,modelCatalog,score};
