// Opt-in: real configured OpenAI models + read-only Supabase. Persistence is in memory;
// no WhatsApp send, order creation, learning write or remote conversation mutation.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
require(root + '/node_modules/dotenv').config({ path: root + '/.env', quiet: true });
if (!process.argv.includes('--live-read-only')) throw Error('Requires --live-read-only');
const label = process.argv.find(x => x.startsWith('--label='))?.split('=')[1] || 'probe';
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid label');
const report = process.argv.find(x => x.startsWith('--report='))?.split('=')[1] || 'recommendations-2026-10-29';
if (!/^[a-z0-9-]+$/.test(report)) throw Error('Invalid report directory');
const dir = root + '/docs/reports/' + report; fs.mkdirSync(dir, {recursive:true});
const realFetch = global.fetch, requests = [];
global.fetch = async (url, options={}) => {
  const u = new URL(url), method = options.method || 'GET';
  const supabase = u.origin === new URL(process.env.SUPABASE_URL).origin;
  const openai = u.origin === new URL(process.env.OPENAI_BASE_URL || 'https://api.openai.com').origin;
  if (!(supabase && (method === 'GET' || (method === 'POST' && u.pathname === '/rest/v1/rpc/search_catalog_products'))) &&
      !(openai && method === 'POST')) throw Error('Read-only evaluation blocked mutation/destination');
  const start = Date.now(); const r = await realFetch(url, options);
  const completion=openai && r.ok ? await r.clone().json() : null;
  requests.push({service:supabase?'supabase':'openai', method, path:u.pathname, ms:Date.now()-start,status:r.status,
    ...(completion ? {model:completion.model,output:completion.choices?.[0]?.message?.content,usage:completion.usage}: {})}); return r;
};
const originalLog=console.log; console.log=()=>{};
const { crearEstadoInicial }=require(root+'/src/conversation/conversationStore');
const { obtenerClienteActual }=require(root+'/src/services/clients.service');
const ai=require(root+'/src/services/aiInterpreter');
const cases = [
 ['capture',['Quiero un dimicilio para un alimento para mi gato de 6 meses que me recomienda','Qué alimento tiene para gato cachorro','No sé el nombre del producto']],
 ['kitten-budget',['Me ayudas a elegir comida para mi gatita pequeña, tiene 4 meses. Máximo 30000 pesos']],
 ['dog-puppy',['Estoy buscando comida para un cachorro de perro de raza pequeña, qué opciones hay']],
 ['adult',['¿Qué concentrado para gatos adultos me puedes recomendar?']],
 ['snack',['Quiero premios para mi perro adulto por menos de 20000 pesos']],
 ['accessory',['Estoy buscando un juguete para mi gato, ¿qué me aconsejas?']],
 ['context',['Busco comida para mi mascota, ¿qué opciones hay?','gato','tiene cinco meses','máximo 25000 pesos','Ahora es para mi perro adulto']],
 ['reference',['Cuánto vale Pro Plan UR','Para perrito','el concentrado']],
 ['absent',['Precio de marca ZetaPruebaQ9 referencia ZQ17']],
 // Deliberately fictional identity: negative control, never a customer/catalog claim.
 ['unresolved-tone',['Solo consultar: tienen marca ZetaPruebaQ9 referencia ZQ17 de 4 kilos?', 'No tengo foto ni más datos, ese es el nombre y son 4 kilos']],
 ['unresolved-paraphrase',['Me puedes mirar el ZQ17 de ZetaPruebaQ9? Es bolsa de cuatro kilos, no tengo foto']],
 ['unresolved-help',['Solo consultar: tienen marca ZetaPruebaQ9 referencia ZQ17 de 4 kilos?',
   'No tengo foto ni más datos, ese es el nombre y son 4 kilos',
   'Sí, me sirve buscar otra opción: necesito alimento para mi gato adulto, máximo 30000 pesos',
   'Muéstrame lo que ya tengo en el carrito']],
 ['typo-tone',['Solo quiero consultar precio de diamon indor para gato, el de medio kilo']],
 ['typo-clarified',['Solo quiero consultar precio de diamon indor para gato, el de medio kilo','El nombre completo es DIAMOND INDOOR CAT, 500 gramos. Solo precio']],
 ['identity-holdout-a',['Solo consulta, cuánto cuesta monelo cat salmon de un kilo?']],
 ['identity-holdout-b',['Me dices el precio de cat chow delicrne, quinientos gramos?']],
 ['identity-holdout-c',['Qué vale agilty gatito de medio kilo?']],
 ['identity-context',['Solo consulta: qué Monello hay para gato?','El de salmón, un kilo','Ahora quiero saber el precio de Nutrecan adulto raza pequeña, dos kilos']],
 ['identity-pending-discovery',['El de salmón, un kilo']],
 // Synthetic unavailable variant, not a customer or claimed real product.
 ['identity-negative',['Solo consultar precio de Monello CAT Lunar ZQ88 de un kilo']],
 ['clinical',['Mi gato no puede orinar, ¿qué comida le doy para curarlo?']],
];
const selected=process.argv.find(x=>x.startsWith('--case='))?.split('=')[1];
(async()=>{
 const cliente=await obtenerClienteActual({phoneNumberId:process.env.KAPSO_PHONE_NUMBER_ID,provider:'kapso',channel:'whatsapp'});
 const out={capturedAt:new Date().toISOString(),mode:'real models and read-only Supabase; in-memory state; not WhatsApp E2E',label,rows:[],requests};
 for(const [name,texts] of cases.filter(c=>!selected||selected.split(',').includes(c[0]))){
  let state=crearEstadoInicial(),history=[],seq=0;
  state.carrito=[{marca:'BR',referencia:'BR CAT SALMON',peso:'1kg',precio:30500,cantidad:1}];
  if(name==='identity-pending-discovery'){
   // Replay the actual failed discovery turn, including its conflicting cart.
   const seed=JSON.parse(fs.readFileSync(root+'/docs/reports/identity-language-2026-10-29/final-context.json')).rows[0];
   state.recomendacionActiva=structuredClone(seed.state.recomendacionActiva);
   state.recomendacionActiva.actualizadoEn=new Date().toISOString();
   state.ultimaPreguntaAsistente=seed.response;
   history=[{direction:'inbound',body:seed.text},{direction:'outbound',body:seed.response}];
  }
  const cart=JSON.stringify(state.carrito), decisions=[];
  const file=root+'/src/services/conversationService.js',req=createRequire(file),mod={exports:{}};
  const mocks={
   './clients.service':{obtenerClienteActual:async()=>cliente},
   '../conversation/conversationStore':{
    obtenerConversacionPersistida:async()=>structuredClone(state),
    obtenerHistorialRecientePersistido:async()=>structuredClone(history),
    guardarConversacionPersistida:async(_u,s,m)=>{state=structuredClone(s);if(m.fase!=='entrada'&&!m.soloEstado){state.mensajesProcesados=[...new Set([...(s.mensajesProcesados||[]),...(m.idsEventos||[])])];history.push({direction:'inbound',body:m.mensaje},{direction:'outbound',body:m.respuesta});}}
   },
   './aiInterpreter':{...ai,interpretarMensajeCliente:async args=>{const d=await ai.interpretarMensajeCliente(args);decisions.push({router:!!args.clasificacion?.decisionHerramientas,decision:d});return d;}},
  };
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,require:n=>mocks[n]||req(n),process,console});
  for(const text of texts){
   const start=Date.now(),first=decisions.length,network=requests.length;
   const response=await mod.exports.responderEventosEntrantes([{channelUserId:'offline-recommendation-eval',messageId:label+'-'+name+'-'+(++seq),text}]);
   const row={case:name,text,response,ms:Date.now()-start,decisions:decisions.slice(first),requests:requests.slice(network),cartUnchanged:JSON.stringify(state.carrito)===cart,
    state:{criterios:state.criterios,recomendacionActiva:state.recomendacionActiva,atencionHumana:state.atencionHumana,ultimaConsultaProducto:state.ultimaConsultaProducto}};
   out.rows.push(row);fs.writeFileSync(dir+'/'+label+'.json',JSON.stringify(out,null,2));originalLog(JSON.stringify({case:name,text,response,ms:row.ms,cartUnchanged:row.cartUnchanged}));
  }
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
