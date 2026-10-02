// Consulta sintética: servicios de lectura e IA reales; sin persistir estado,
// pedidos, conversaciones, datos personales ni enviar mensajes de WhatsApp.
require('dotenv').config({quiet:true});
const fs=require('node:fs'),vm=require('node:vm');
const {createRequire}=require('node:module');
const {crearEstadoInicial}=require('../src/conversation/conversationStore');
const {contexto,crearContexto,medir,resumen}=require('../src/services/pipelineTelemetry');
const {obtenerClienteActual}=require('../src/services/clients.service');
const {obtenerVentanaBufferMs}=require('../src/services/inboundMessageBuffer');
(async()=>{
 const file=require.resolve('../src/services/conversationService'),req=createRequire(file),module={exports:{}};
 let state=crearEstadoInicial();
 const mocks={
  '../conversation/conversationStore':{obtenerConversacionPersistida:async()=>state,obtenerHistorialRecientePersistido:async()=>[],guardarConversacionPersistida:async(_id,s)=>{state=s;}},
  '../repositories/trainingExampleRepository':{obtenerEjemplosEntrenamiento:async()=>[]},
 };
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,require:n=>mocks[n]||req(n),process,console});
 const ctx=crearContexto('synthetic-performance');
 await contexto.run(ctx,async()=>{
   await medir('inbound_buffer',()=>new Promise(resolve=>setTimeout(resolve,obtenerVentanaBufferMs())));
   ctx.inicio=Date.now();
   const cliente=await medir('load_client',()=>obtenerClienteActual({phoneNumberId:process.env.KAPSO_PHONE_NUMBER_ID}));
   mocks['./clients.service']={obtenerClienteActual:async()=>cliente};
   await medir('agent_processing',()=>module.exports.responderEventoEntrante({channelUserId:'synthetic-performance',phoneNumberId:process.env.KAPSO_PHONE_NUMBER_ID,text:'¿Cuánto cuesta Cutamycon spray de 50 ml?',messageId:`perf-${Date.now()}`}));
   const report=resumen(ctx);
   report.scope='Consulta sintética con Supabase lectura y OpenAI reales. Historial, guardado, typing y envío no ejecutados en red.';
   report.createdAt=new Date().toISOString();
   fs.writeFileSync('docs/reports/pipeline-measurement.json',JSON.stringify(report,null,2)+'\n');
 });
})().catch(error=>{console.error(error.message);process.exitCode=1;});
