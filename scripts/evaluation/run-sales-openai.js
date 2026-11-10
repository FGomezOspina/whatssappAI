// Opt-in only; no calls on import. Never sends WhatsApp or writes Supabase.
const fs=require('node:fs'),path=require('node:path');
async function main(args){
  const auditOnly=args.includes('--audit-payloads-only'),reviewedV2=args.includes('--corpus=v2'),syntheticV3=args.includes('--corpus=v3');
  const guardedPayloads=reviewedV2||syntheticV3;
  if(!auditOnly&&!args.includes('--authorized-anonymized-openai'))throw Error('Anonymized OpenAI authorization flag required; no API called');
  if(reviewedV2&&!auditOnly&&!args.includes('--reviewed-payloads'))throw Error('Corpus v2 requires reviewed payloads; no API call');
  const run=args.find(a=>a.startsWith('--run='))?.slice(6);
  if(!/^[a-z0-9-]+$/.test(run||''))throw Error('Unique run required');
  const dir=path.resolve(__dirname,'../../docs/reports/sales-continuity-2026-11-05');
  const output=path.join(dir,run+'.jsonl');if(fs.existsSync(output))throw Error('Existing run; no automatic replay');
  require('dotenv').config({quiet:true});process.env.LEARNING_CAPTURE_ENABLED='false';
  const {reviewPayload,sourceDenylist,sha}=require('./sales-payload-privacy');
  const privacy=guardedPayloads?{forbidden:sourceDenylist(dir),secrets:Object.entries(process.env).filter(([k])=>/KEY|SECRET|TOKEN/.test(k)).map(([,v])=>v)}:null;
  const reviewedFile=path.join(dir,'sales-replay-v2-reviewed.json');
  if(reviewedV2&&!auditOnly){
    const approval=JSON.parse(fs.readFileSync(path.join(dir,'v2-payload-review.json')));
    if(approval.status!=='reviewed' || approval.corpusSha256!==sha(fs.readFileSync(reviewedFile,'utf8')))throw Error('Missing or changed payload review');
    fs.writeFileSync(path.join(dir,'v2-authorized-retry-started.json'),JSON.stringify({run,at:new Date().toISOString(),corpusSha256:approval.corpusSha256}),{flag:'wx'});
  }
  const nativeFetch=global.fetch;global.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input.url||input);
    if(auditOnly||url.hostname!=='api.openai.com')throw Error('Isolated replay blocked network');
    return nativeFetch(input,init);
  };
  const {Completions}=require('openai/resources/chat/completions/completions');
  const original=Completions.prototype.create;let calls=[],activeFrame=null;
  Completions.prototype.create=async function(body,opts){const start=Date.now();try{
    if(guardedPayloads){const review=reviewPayload(body,privacy);fs.appendFileSync(path.join(dir,run+'-payload-reviews.jsonl'),JSON.stringify(review)+'\n');
      if(auditOnly)fs.appendFileSync(path.join(dir,run+'-payloads.jsonl'),JSON.stringify(body)+'\n');}
    if(auditOnly){
      let content;
      if(activeFrame?.kind==='humanizer')content=activeFrame.base;
      else {const a=activeFrame.args, data=a.mensaje.includes('Nombre:');
        const result=a.clasificacion.decisionHerramientas
          ? {intencion:'datos_envio',accion:null,confianza:.99,continuarFlujo:true,consultaCatalogo:{necesaria:false},
            entrega:data?{metodoPago:'efectivo'}:{tipo:'domicilio',direccion:'Mz 8 casa 22 Conjunto Prueba, Sector de prueba'},
            datosCliente:data?{nombre:'Cliente Prueba',celular:'3000000000'}:{}}
          : {intencion:'pedido_producto',accion:'agregar',confianza:.99,producto:{marca:'ARENA MAIZ CAT',referencia:'ARENA MAIZ CAT',presentacion:'20kg',cantidad:1}};
        content=JSON.stringify(result);
      }
      return {choices:[{message:{content}}],usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0}};
    }
    const r=await original.call(this,body,{...opts,maxRetries:0});calls.push({model:body.model,ms:Date.now()-start,usage:r.usage});return r;
  }catch(e){calls.push({model:body.model,ms:Date.now()-start,error:{status:e.status,code:e.code}});throw e;}};
  const {createHarness}=require('./sales-dialogue-harness');
  const {interpretarMensajeCliente}=require('../../src/services/aiInterpreter');
  const {humanizarRespuesta}=require('../../src/services/humanizer');
  const snapshot=JSON.parse(fs.readFileSync(path.join(dir,'../real-conversations-2026-10-30/catalog.json')));
  const version=syntheticV3?'v3':reviewedV2?'v2':'v1';
  const corpus=JSON.parse(fs.readFileSync(reviewedV2?reviewedFile:path.join(dir,`sales-replay-${version}.json`)));
  const selected=args.find(a=>a.startsWith('--cases='))?.slice(8).split(',');
  const limit=Number(args.find(a=>a.startsWith('--turn-limit='))?.slice(13)||99);
  if(!Number.isInteger(limit)||limit<1)throw Error('Invalid turn limit');
  for(const c of corpus.cases.filter(c=>!selected||selected.includes(c.id))){
    let catalogo=snapshot.filter(b=>c.catalogBrands.includes(b.marca));
    const initialState=structuredClone(c.initialState);
    if(guardedPayloads){catalogo=catalogo.map(b=>({marca:b.marca,referencias:b.referencias.map(r=>({nombre:r.nombre,especie:r.especie,categoria:r.categoria,subcategoria:r.subcategoria,presentaciones:r.presentaciones.map(p=>({peso:p.peso,precio:p.precio,stock:p.stock}))}))}));
      initialState.productosConsultados.forEach(p=>p.contextoCreadoEn=new Date(Date.now()-c.relativeQuoteAgeMs).toISOString());
      initialState.ultimaSolicitudProductos.forEach(p=>p.contextoCreadoEn=new Date(Date.now()-c.relativePendingAgeMs).toISOString());}
    const h=createHarness({catalogo,initialState,history:c.history,interpreter:async a=>{activeFrame={kind:'interpreter',args:a};return interpretarMensajeCliente(a);},
      humanizer:async(m,base,opts)=>{activeFrame={kind:'humanizer',base};return humanizarRespuesta(m,base,opts);}});
    for(const [index,turn]of c.turns.slice(0,limit).entries()){
      calls=[];let row;
      try{row=await h.send(turn.text);}catch(e){fs.appendFileSync(output,JSON.stringify({id:c.id,index,error:e.message,calls})+'\n');throw e;}
      row={id:c.id,index,origin:turn.origin,at:new Date().toISOString(),...row,calls};
      fs.appendFileSync(output,JSON.stringify(row)+'\n');
      console.log(JSON.stringify({id:c.id,index,response:row.response,cart:row.state.carrito,confirmed:row.state.pedidoConfirmado,ms:row.ms,calls:calls.length}));
      if(calls.some(c=>c.error))throw Error('API error; stopped without retry');
    }
  }
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={main};
