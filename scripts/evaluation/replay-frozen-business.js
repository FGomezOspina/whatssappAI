// Default is strictly offline. No .env, model import, messages, orders or DB writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function authorize(args,env){
 const provider=(args.find(x=>x.startsWith('--provider='))||'--provider=local').slice(11);
 if(!['local','openai'].includes(provider))throw Error('Unknown provider');
 if(provider==='openai' && !(args.includes('--allow-paid-openai') && args.includes('--confirm-user-recharge') && args.some(x=>x.startsWith('--case='))))throw Error('OpenAI disabled. Requires explicit user recharge authorization, both opt-in flags and an explicit case selection.');
 if(provider==='openai' && (!env.OPENAI_API_KEY || env.AI_INTERPRETER==='false'))throw Error('Authorized replay requires configured API key and enabled interpreter. Nothing was called.');
 return provider;
}
function modelInput(c,catalogo,clasificacion){return {mensaje:c.input.message,estado:c.input.contextState||{},historialReciente:c.input.history,catalogo,ejemplosEntrenamiento:[],clasificacion,channelUserId:'audit-'+c.id};}
function outputPath(args){
 const arg=args.find(x=>x.startsWith('--output='));
 const target=arg?path.resolve(arg.slice(9)):null;
 if(target&&fs.existsSync(target))throw Error('Output already exists; preserve the frozen corpus and earlier results by choosing a new file.');
 return target;
}
async function main(args=process.argv.slice(2)){
 const provider=authorize(args,process.env);
 const target=outputPath(args);
 const manifestPath=path.join(root,'docs/reports/real-conversations-2026-10-29/frozen-business-replay-v1.json');
 const bytes=fs.readFileSync(manifestPath),manifest=JSON.parse(bytes);
 const catalogBytes=fs.readFileSync(path.join(root,manifest.catalog.path));if(sha(catalogBytes)!==manifest.catalog.sha256)throw Error('Frozen catalog hash mismatch; refusing changed inputs.');
 const catalog=JSON.parse(catalogBytes);
 const {validarCoincidenciaProducto}=require('../../src/services/productMatchValidator');
 const {_internals:{seleccionarCatalogoLocal}}=require('../../src/services/catalogContextService');
 const clasificacion={intencion:'busqueda_producto',perfilContexto:'producto',requiereBusquedaProducto:true};
 const selected=(args.find(x=>x.startsWith('--case='))||'--case=all').slice(7);
 if(selected!=='all'&&!manifest.cases.some(c=>c.id===selected))throw Error('Unknown frozen case');
 // Imports capable of calling OpenAI occur only after the authorization checks.
 const interpreter=provider==='openai'?require('../../src/services/aiInterpreter').interpretarMensajeCliente:null;
 const model=provider==='openai'?require('../../src/services/modelRouter').modeloInterprete(clasificacion):null;
 const rows=[];
 for(const c of manifest.cases.filter(c=>selected==='all'||c.id===selected)){
  if(c.expected.decision==='excluded'){rows.push({id:c.id,outcome:'not_evaluable',media:c.media.status});continue;}
  const candidates=seleccionarCatalogoLocal({catalogo:catalog,mensaje:c.input.message,clasificacion}).catalogo;
  const started=performance.now();
  const interpretation=interpreter?await interpreter({...modelInput(c,candidates,clasificacion),model}):null;
  if(interpreter&&!interpretation)throw Error(`Interpreter failed for ${c.id}; stopped without processing later cases.`);
  const r=validarCoincidenciaProducto({mensaje:c.input.message,catalogo:candidates,clasificacion,interpretacion:interpretation});
  const ref=r.coincidencia?.referenciaCatalogo||r.coincidencia?.referencia||null;
  const historical=c.expected.reference?(r.nivel==='alta'&&ref===c.expected.reference&&(!c.expected.weight||r.presentacionSolicitada===c.expected.weight&&r.presentacionValida)?'correct':r.nivel==='alta'&&ref!==c.expected.reference?'false_positive':'missed'):r.nivel==='alta'?'false_positive':'safe_abstention';
  rows.push({id:c.id,level:r.nivel,selected:ref,reason:r.razon,clarification:r.aclaracion||null,weight:r.presentacionSolicitada||null,presentationValid:r.presentacionValida,
   historicalOutcome:historical,currentExpectationMet:c.expected.decision==='clarify_food_form'?r.nivel!=='alta'&&r.aclaracion?.campo==='forma_alimento':['correct','safe_abstention'].includes(historical),ms:performance.now()-started,...(interpretation?{interpretation}:{} )});
 }
 const output={provider,model,corpusVersion:manifest.corpusVersion,manifestSha256:sha(bytes),catalogSha256:sha(catalogBytes),runAt:new Date().toISOString(),scope:provider==='local'?'Offline candidate retrieval + validator':'OpenAI interpreter with frozen locally retrieved candidates + validator; not router, humanizer, actual media, cart or WhatsApp E2E',rows};
 if(target)fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n',{flag:'wx'});else console.log(JSON.stringify(output,null,2));
 return output;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={authorize,modelInput,outputPath,main};
