// Isolated production service: all conversation/order persistence is in memory.
const fs=require('node:fs'), vm=require('node:vm');
const {createRequire}=require('node:module');
function createHarness({catalogo, initialState={}, history=[], interpreter, humanizer}) {
  const {crearEstadoInicial}=require('../../src/conversation/conversationStore');
  const {respuestaParaHistorial}=require('../../src/utils/responseMessages');
  let state={...crearEstadoInicial(),...structuredClone(initialState)};
  let messages=structuredClone(history).map(m=>({direction:m.direction || (m.role==='assistant'?'outbound':'inbound'),body:m.body??m.content})), interpretations=[];
  const file=require.resolve('../../src/services/conversationService'),req=createRequire(file),mod={exports:{}};
  const mocks={
    './clients.service':{obtenerClienteActual:async()=>({id:'isolated-sales-validation',vertical:'petshop'})},
    '../conversation/conversationStore':{obtenerConversacionPersistida:async()=>state,
      obtenerHistorialRecientePersistido:async()=>messages,
      guardarConversacionPersistida:async(_id,s,m={})=>{state=structuredClone(s);
        // The current inbound turn is supplied separately to the model. Only
        // append a completed pair, using the repository's actual row shape.
        if(m.respuesta){if(m.mensaje)messages.push({direction:'inbound',body:m.mensaje});
          messages.push({direction:'outbound',body:m.respuesta});state.ultimaPreguntaAsistente=m.respuesta;}}},
    '../repositories/trainingExampleRepository':{obtenerEjemplosEntrenamiento:async()=>[]},
    './catalogContextService':{seleccionarCatalogoParaIA:async()=>({catalogo,metadata:{source:'frozen-local-snapshot'}})},
    './aiInterpreter':{interpretarMensajeCliente:async a=>{const r=await interpreter(a);interpretations.push({router:!!a.clasificacion.decisionHerramientas,result:r});return r;}},
    './humanizer':{humanizarRespuesta:humanizer||(async(_m,base)=>base)},
    './mediaProcessor':{procesarMultimedia:async e=>({text:e.text,imageUrl:null})},
  };
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,require:n=>mocks[n]||req(n),process,console});
  return {state:()=>structuredClone(state),history:()=>structuredClone(messages),send:async text=>{
    interpretations=[];const start=performance.now();
    const response=respuestaParaHistorial(await mod.exports.responderEventoEntrante({channelUserId:'anonymous-isolated-sales',text}));
    return {text,response,ms:performance.now()-start,state:structuredClone(state),interpretations};
  }};
}
module.exports={createHarness};
