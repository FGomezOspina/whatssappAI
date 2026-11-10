// Explicit opt-in only. Uses the application's existing interpreter/client/model.
const fs=require('node:fs');
async function main(){
 if(!process.argv.includes('--authorized-openai-test'))throw Error('OpenAI test disabled without explicit authorization.');
 const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'docs/reports/openai-validation-2026-10-30/availability.json';
 if(fs.existsSync(output))throw Error('Availability result already recorded; do not repeat a billable check automatically.');
 require('dotenv').config({quiet:true});
 if(!process.env.OPENAI_API_KEY)throw Error('Configured key unavailable; nothing sent.');
 const calls=[];
 // Audit adapter keeps the production client and payload intact, disables SDK
 // retries for this one test and records only operational metadata, never keys.
 const {Completions}=require('openai/resources/chat/completions/completions');
 const original=Completions.prototype.create;
 Completions.prototype.create=async function(body,options){
  const start=Date.now();
  try{const r=await original.call(this,body,{...options,maxRetries:0});calls.push({model:body.model,status:'success',ms:Date.now()-start,usage:r.usage});return r;}
  catch(e){calls.push({model:body.model,status:'failed',ms:Date.now()-start,httpStatus:e.status||null,code:e.code||null,type:e.type||null,errorName:e.name,causeCode:e.cause?.code||null});throw e;}
 };
 const originalWarn=console.warn;console.warn=()=>{};
 const cl={intencion:'busqueda_producto',perfilContexto:'producto',requiereBusquedaProducto:true};
 const model=require('../../src/services/modelRouter').modeloInterprete(cl);
 const result=await require('../../src/services/aiInterpreter').interpretarMensajeCliente({mensaje:'Hola',estado:{},historialReciente:[],catalogo:[],ejemplosEntrenamiento:[],clasificacion:cl,model,channelUserId:'audit-availability'});
 console.warn=originalWarn;Completions.prototype.create=original;
 const report={at:new Date().toISOString(),model,payload:'Synthetic greeting Hola; empty history, state and catalog; no customer data or images.',configuredClientUsed:true,successful:!!result,calls,interpretation:result||null};
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({successful:report.successful,model,calls}));
 if(!result)process.exitCode=2;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
