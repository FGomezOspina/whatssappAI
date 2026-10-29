const { normalizar } = require('../utils/text');
const { consultaEstructurada, solicitudEstructurada } = require('./productRequestContext');
const { validarCoincidenciaProducto } = require('./productMatchValidator');

function planRecuperacion({literal,consulta,solicitud,variantes=[]}) {
  const vistas=new Map();
  const atributos=solicitudEstructurada(solicitud);
  return [
    {etapa:'literal_fts',query:literal || consulta},
    {etapa:'atributos',query:solicitud && [consultaEstructurada(atributos),
      atributos.categoria,...(atributos.condiciones || [])].filter(Boolean).join(' ')},
    {etapa:'linguistica',query:consulta},
    ...variantes.map(v=>({etapa:'recuperacion',...v})),
  ].filter(p=>{
    p.query=normalizar(p.query || '').trim();
    if(!p.query)return false;
    if(vistas.has(p.query)) {
      // Keep recovery capabilities when a short identity is also the literal.
      if(p.recuperarMarcaAproximada)vistas.get(p.query).recuperarMarcaAproximada=true;
      return false;
    }
    vistas.set(p.query,p);return true;
  }).slice(0,6);
}
function evaluarCandidatos(catalogo,mensaje) {
  const v=validarCoincidenciaProducto({mensaje,catalogo,catalogoCandidatos:catalogo,
    clasificacion:{perfilContexto:'producto',intencion:'busqueda_producto',requiereBusquedaProducto:true}});
  return {estado:v.nivel==='alta'?'confirmada':v.aclaracion?'probable':'sin_coincidencia_confiable',
    razon:v.razon,campo:v.aclaracion?.campo || null};
}
async function recuperarConLimites({plan,buscar,combinar,mensaje,solicitud,timeoutMs}) {
  const inicio=Date.now();
  const presupuesto=Math.max(50,Math.min(Number(timeoutMs)||4000,10000));
  const controller=new AbortController();
  let temporizador;
  const vencimiento=new Promise((_,reject)=>{temporizador=setTimeout(()=>{
    controller.abort();reject(new Error('Catalog recovery deadline exceeded'));
  },presupuesto);});
  const respuestas=[],intentos=[];let catalogo=[],evaluacion={estado:'sin_coincidencia_confiable'};
  try {
    for(const paso of plan.slice(0,6)) {
      if(controller.signal.aborted)break;
      const t=Date.now();
      try {
        const r=await Promise.race([buscar(paso,controller.signal),vencimiento]);
        respuestas.push(r);catalogo=combinar(catalogo,r.catalogo);
        evaluacion=evaluarCandidatos(catalogo,mensaje);
        intentos.push({etapa:paso.etapa,query:paso.query,ms:Date.now()-t,estado:evaluacion.estado});
        // A useful missing-attribute question is a valid outcome, not a miss.
        if(['confirmada','probable'].includes(evaluacion.estado))break;
      } catch(e) {
        intentos.push({etapa:paso.etapa,query:paso.query,ms:Date.now()-t,error:true});
        if(controller.signal.aborted)break;
      }
    }
  } finally {clearTimeout(temporizador);controller.abort();}
  return {catalogo,respuestas,metadata:{solicitud:solicitudEstructurada(solicitud),
    intentosRecuperacion:intentos,consultasEjecutadas:intentos.length,limiteConsultas:6,
    presupuestoMs:presupuesto,duracionRecuperacionMs:Date.now()-inicio,evaluacion,
    recuperacionIncompleta:intentos.some(i=>i.error)}};
}
module.exports={planRecuperacion,recuperarConLimites,evaluarCandidatos};
