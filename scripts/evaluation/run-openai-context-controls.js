// Separate v1 supplement: one retained literal context + synthetic format controls.
// Uses existing interpreter/humanizer only. No event handler, orders, DB or WhatsApp.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {authorize,modelCatalog}=require('./run-authorized-openai-replay');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'docs/reports/openai-validation-2026-10-30');
function fixtures(){
 const source='docs/reports/real-conversations-2026-10-30/today-corpus-v2.json',bytes=fs.readFileSync(path.join(root,source)),today=JSON.parse(bytes);
 const sequence=today.chats.find(c=>c.id==='T02').sequence,idx=sequence.findIndex(m=>m.text==='Me  envía dos  de adulto de kilo porfa');
 const history=sequence.slice(0,idx).filter(m=>m.text).map(m=>({direction:m.direction==='customer'?'inbound':'outbound',body:m.text}));
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'docs/reports/real-conversations-2026-10-30/catalog-after-v2.json'))).filter(m=>/EXCELLENT/.test(m.marca));
 const toy=[{marca:'NUBE',referencias:[['NUBE GATO ADULTO','concentrado','1kg'],['NUBE LATA GATO ADULTO','comida_humeda','85g'],['NUBE POUCH GATO ADULTO','comida_humeda','85g']].map(([nombre,subcategoria,peso])=>({nombre,categoria:'comida',subcategoria,especie:'gato',etapa:'adulto',presentaciones:[{peso,precio:null,stock:null}]}))}];
 return [
 {id:'CONTEXT-T02',kind:'real_literal_retained_context',source,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),message:sequence[idx].text,history,catalog,expected:{brand:'EXCELLENT',reference:'EXCELLENT GATO ADULT',presentation:'1kg',quantity:2},limits:'Audio antecedent absent and excluded. Exact retained text history only; no invented dry-food antecedent. Interpretation fields + catalog identity checked; not end-to-end conversation flow.'},
 {id:'S-WET-UNSPECIFIED',kind:'synthetic',message:'Cuánto vale la comida húmeda Nube gato adulto?',history:[],catalog:toy,expected:{form:'comida_humeda',container:null,decision:'clarify'}},
 {id:'S-CAN-CORRECTION',kind:'synthetic',message:'No, mejor en lata, dos por favor',history:[{direction:'inbound',body:'Quiero sobre Nube gato adulto de 85g'},{direction:'outbound',body:'¿Quieres dos sobres Nube gato adulto de 85g?'}],catalog:toy,expected:{container:'lata',quantity:2}},
 {id:'S-DRY-CONTEXT',kind:'synthetic',message:'De un kilo, por favor',history:[{direction:'inbound',body:'Cuánto vale el concentrado seco Nube gato adulto?'},{direction:'outbound',body:'¿Qué presentación necesitas del concentrado Nube gato adulto?'}],catalog:toy,expected:{form:'concentrado',container:null,presentation:'1kg'}},
 {id:'S-MULTI-TYPO',kind:'synthetic',message:'Cotízame 2 latas Nube gato adulto de 85g y 3 sobres Nuebe gato adulto de 85g',history:[],catalog:toy,expected:{action:'consultar',list:[{container:'lata',quantity:2},{container:'sobre',quantity:3}]}}
 ];
}
async function main(){
 const args=process.argv.slice(2);authorize(args);const output=path.resolve(args.find(a=>a.startsWith('--output='))?.slice(9)||path.join(dir,'context-controls-results-v1.jsonl'));if(fs.existsSync(output))throw Error('Supplement already executed; no duplicate billing');
 const inputFile=path.join(dir,'context-controls-inputs-v1.json');
 const cases=fs.existsSync(inputFile)?JSON.parse(fs.readFileSync(inputFile)):fixtures();
 if(!fs.existsSync(inputFile))fs.writeFileSync(inputFile,JSON.stringify(cases,null,2),{flag:'wx'});
 // Each string was reviewed; history is product-only. No full export or media.
 for(const c of cases)if(/(?:\+?57)?3\d{9}|[\w.+-]+@[\w.-]+|https?:\/\/|sk-[a-z0-9_-]{12,}/i.test(JSON.stringify([c.message,c.history])))throw Error('Privacy review required');
 require('dotenv').config({quiet:true});const {Completions}=require('openai/resources/chat/completions/completions'),orig=Completions.prototype.create;let call;
 Completions.prototype.create=async function(body,options){const start=Date.now();try{const r=await orig.call(this,body,{...options,maxRetries:0});call={model:body.model,ms:Date.now()-start,usage:r.usage};return r;}catch(e){call={model:body.model,ms:Date.now()-start,error:{status:e.status,code:e.code}};throw e;}};
 const log=console.log,warn=console.warn;console.log=()=>{};console.warn=()=>{};
 const interpret=require('../../src/services/aiInterpreter').interpretarMensajeCliente,validate=require('../../src/services/productMatchValidator').validarCoincidenciaProducto;
 const cl={intencion:'busqueda_producto',perfilContexto:'producto',requiereBusquedaProducto:true,limiteHistorial:12};const model=require('../../src/services/modelRouter').modeloInterprete(cl);
 try{for(const c of cases){call=null;const interpretation=await interpret({mensaje:c.message,historialReciente:c.history,estado:{},catalogo:modelCatalog(c.catalog),ejemplosEntrenamiento:[],clasificacion:cl,model,channelUserId:'audit-'+c.id});
 if(!interpretation){fs.appendFileSync(output,JSON.stringify({id:c.id,error:'No interpretation',call})+'\n');throw Error('Stopped on API failure');}
 // Context comprehension is scored from model fields. Catalog matching of that
 // extraction is separate: it does NOT certify runtime context routing.
 const extracted=interpretation.productos?.length>1?interpretation.productos:[interpretation.producto];
 const matches=extracted.map(producto=>{const query=require('../../src/services/productRequestContext').consultaEstructurada(producto);return{query,result:validate({mensaje:query,interpretacion:{...interpretation,producto,productos:[producto]},catalogo:c.catalog,clasificacion:cl})};});
 fs.appendFileSync(output,JSON.stringify({id:c.id,kind:c.kind,call,interpretation,matches})+'\n');log(JSON.stringify({id:c.id,tokens:call?.usage?.total_tokens,ms:call?.ms}));}
 if(args.includes('--skip-humanizer'))return;
 const humanize=require('../../src/services/humanizer').humanizarRespuesta;
 for(const [id,message,base] of [['H-UNKNOWN','Tienes Novalux gastrointestinal para perro?','Todavía no he podido confirmar esa referencia. ¿Puedes compartir una foto del empaque para identificarla contigo?'],['H-FORMAT','Cuánto vale la comida húmeda Nube gato adulto?','Claro, te ayudo. ¿La comida húmeda la necesitas en sobre o en lata?']]){call=null;let usage;const response=await humanize(message,base,{clasificacion:cl,estado:{},onUsage:r=>usage=r});fs.appendFileSync(output,JSON.stringify({id,kind:'synthetic_humanizer',message,base,response,call,usage})+'\n');log(JSON.stringify({id,called:Boolean(call),tokens:call?.usage?.total_tokens}));if(call?.error)throw Error('Stopped on API failure');}
 }finally{console.log=log;console.warn=warn;Completions.prototype.create=orig;}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});module.exports={fixtures};
