const { explorarProductosCatalogoCliente } = require('../repositories/productRepository');
const { interpretarMensajeCliente } = require('./aiInterpreter');
const { modeloInterprete } = require('./modelRouter');
const { admiteEspecie } = require('../utils/catalogCommercialRules');
const { normalizar, normalizarPeso, formatearPrecio } = require('../utils/text');

const CATEGORIAS = new Set(['comida','snack','accesorio','juguete','higiene','arena_sustrato','suplemento','medicamento','otro']);
const ETAPAS = new Set(['cachorro','adulto','senior']);
function concretarRecomendacion(decision, estado, mensaje) {
  const previa=estado.recomendacionActiva;
  if (decision.seguimientoProducto!=='aclaracion' || decision.accion!=='consultar' ||
      !previa?.criterios || Date.now()-Date.parse(previa.actualizadoEn)>30*60*1000 ||
      decision.productos?.length>1) return decision;
  const p=decision.producto || {};
  const marca=p.marca || previa.criterios.marca;
  // A supplied commercial variant narrows an earlier discovery request.
  // Send accumulated evidence through normal retrieval/validation, never
  // select a recommendation or touch the cart here.
  if (!marca || !(p.referencia || p.linea || p.sabores?.length)) return decision;
  const producto={...previa.criterios,...Object.fromEntries(Object.entries(p).filter(([,v])=>v!=null)),marca,
    accion:'consultar',presentacion:require('../utils/text').extraerPesoTexto(mensaje) || p.presentacion};
  const query=[producto.marca,producto.referencia,producto.linea,producto.especie,producto.etapa,
    producto.tamano,...(producto.sabores || []),...(producto.condiciones || []),producto.presentacion].filter(Boolean).join(' ');
  return {...decision,intencion:'consulta_producto',producto,productos:[producto],
    _consultaContinuada:query,consultaCatalogo:{...decision.consultaCatalogo,tipo:'referencia',necesaria:true,consulta:query}};
}
function esExploracion(decision) {
  return (decision?.consultaCatalogo?.tipo === 'necesidad' ||
    (decision?.intencion==='recomendacion' && decision.producto?.categoria && !decision?.consultaCatalogo?.tipo)) && decision.accion === 'consultar' &&
    !decision.producto?.referencia && !decision.producto?.linea && !(decision.productos?.length > 1);
}
function criteriosNecesidad(decision) {
  const p={...decision.producto,...(decision.productos?.length===1
    ? Object.fromEntries(Object.entries(decision.productos[0]).filter(([,v])=>v!=null)) : {})};
  return { categoria:CATEGORIAS.has(p.categoria)?p.categoria:null,
    subcategoria:typeof p.subcategoria==='string' && /^[a-z_]{2,40}$/.test(p.subcategoria)?p.subcategoria:null,
    especie:typeof p.especie==='string' && /^[a-z_]{2,30}$/.test(p.especie)?p.especie:null,
    etapa:ETAPAS.has(p.etapa)?p.etapa:null, tamano:p.tamano || null,
    marca:p.marca || null, sabores:p.sabores || [], condiciones:p.condiciones || [],
    presentacion:p.presentacion || null, presupuestoMaximo:decision.consultaCatalogo.presupuestoMaximo || null };
}
function opcionesVerificables(catalogo, criterios) {
  const opciones=[];
  for (const marca of catalogo) for (const r of marca.referencias || []) {
    if (r.requiereConfirmacion || !r.metadata?.id ||
        (criterios.marca && normalizar(marca.marca)!==normalizar(criterios.marca)) ||
        (criterios.categoria && r.categoria!==criterios.categoria) ||
        (criterios.subcategoria && r.subcategoria!==criterios.subcategoria) ||
        (criterios.especie && !admiteEspecie(r,criterios.especie)) ||
        (criterios.etapa && r.etapa!==criterios.etapa && (criterios.categoria==='comida' || r.etapa))) continue;
    const presentaciones=(r.presentaciones || []).filter(p=>p.stock!==false && p.precio!==null &&
      Number.isFinite(p.precio) && p.precio>0 && p.peso &&
      (!criterios.presentacion || normalizarPeso(p.peso)===normalizarPeso(criterios.presentacion)) &&
      (!criterios.presupuestoMaximo || p.precio<=criterios.presupuestoMaximo))
      .sort((a,b)=>a.precio-b.precio);
    if (!presentaciones.length) continue;
    opciones.push({id:r.metadata.id,marca:marca.marca,referencia:r.nombre,especie:r.especie,
      etapa:r.etapa,categoria:r.categoria,subcategoria:r.subcategoria,descripcion:r.descripcion,
      nombresOriginales:r.metadata.original_names || [],presentacion:presentaciones[0]});
  }
  // Bound model input and keep several brands represented. Price is a catalog
  // fact; this ordering is not a claim of nutritional quality.
  return opciones.sort((a,b)=>a.presentacion.precio-b.presentacion.precio).slice(0,40);
}
function validarSeleccion(lectura, candidatos, criterios={}) {
  const vistos=new Set();
  return (lectura?.recomendaciones || []).flatMap(r=>{
    const c=candidatos.find(c=>c.id===r.id);
    if (!c || vistos.has(c.id) || !r.evidencia?.length) return [];
    const fuente=normalizar(JSON.stringify({referencia:c.referencia,especie:c.especie,etapa:c.etapa,
      categoria:c.categoria,subcategoria:c.subcategoria,descripcion:c.descripcion,nombresOriginales:c.nombresOriginales,peso:c.presentacion.peso}));
    if (!r.evidencia.every(e=>normalizar(e).length>=3 && fuente.includes(normalizar(e)))) return [];
    for(const campo of ['tamano','sabores','condiciones']) {
      const valores=Array.isArray(criterios[campo])?criterios[campo]:[criterios[campo]].filter(Boolean);
      if (!valores.every(valor=>(r.atributos || []).some(a=>a.campo===campo && normalizar(a.valor)===normalizar(valor) &&
        a.evidencia && normalizar(a.evidencia).length>=3 && fuente.includes(normalizar(a.evidencia))))) return [];
    }
    vistos.add(c.id);return [c];
  }).slice(0,3);
}
async function recomendarDesdeCatalogo({decision,mensaje,estado,cliente,vertical}) {
  const criterios=criteriosNecesidad(decision);
  // The router reconstructs the current need from context. Do not merge old
  // species/brands here: a new pet or product must not inherit them implicitly.
  estado.recomendacionActiva={criterios,opciones:[],actualizadoEn:new Date().toISOString()};
  let pregunta=!criterios.categoria ? '¿Qué tipo de producto buscas para tu mascota?' :
    !criterios.especie ? '¿Para qué mascota lo estás buscando?' :
    criterios.categoria==='comida' && !criterios.etapa ? '¿Qué edad tiene tu mascota?' : null;
  if (pregunta) return {respuesta:pregunta,criterios,opciones:[],motivo:'atributo_faltante'};
  // Clinical decisions are handled by the existing handoff before this branch.
  // Never offer a drug/supplement through general commercial discovery.
  if (['medicamento','suplemento'].includes(criterios.categoria)) return {
    respuesta:'¿Tienes una referencia indicada por tu veterinario para consultar su precio?',criterios,opciones:[],motivo:'referencia_necesaria'};
  let busqueda;
  try { busqueda=await explorarProductosCatalogoCliente(cliente,criterios,{signal:AbortSignal.timeout(4500)}); }
  catch { return {respuesta:'No pude consultar las opciones en este momento. Conservo lo que me contaste para volver a revisarlas.',criterios,opciones:[],motivo:'error_catalogo'}; }
  const candidatos=opcionesVerificables(busqueda.catalogo,criterios);
  if (!candidatos.length) return {respuesta:criterios.presupuestoMaximo
    ? `No pude confirmar opciones que cumplan esos requisitos dentro de ${formatearPrecio(criterios.presupuestoMaximo)}. ¿Quieres que revisemos otro presupuesto?`
    : 'No pude confirmar una opción con todos esos requisitos. ¿Hay alguna preferencia que quieras cambiar?',
    criterios,opciones:[],motivo:busqueda.incompleto?'busqueda_limitada':'sin_opciones_verificadas'};
  const lectura=await interpretarMensajeCliente({mensaje,estado:{},catalogo:[],cliente,vertical,
    clasificacion:{perfilContexto:'producto',evaluarNecesidad:{criterios,candidatos}},
    model:modeloInterprete({perfilContexto:'producto'})});
  const opciones=validarSeleccion(lectura,candidatos,criterios);
  if (!lectura) return {respuesta:'Encontré opciones para revisar, pero no pude completar su comparación en este momento. Conservo tu consulta.',criterios,opciones:[],motivo:'error_seleccion'};
  if (!opciones.length) return {respuesta:lectura.preguntaRecomendacion ||
    'Necesito un poco más de información para recomendarte una opción adecuada. ¿Qué característica es la más importante para ti?',
    criterios,opciones:[],motivo:'aclaracion_compatibilidad'};
  estado.recomendacionActiva.opciones=opciones.map((c,i)=>({indice:i+1,marca:c.marca,referencia:c.referencia,
    presentacion:c.presentacion.peso,precio:c.presentacion.precio,referenceId:c.id}));
  // Successful discovery supersedes an earlier false commercial-name absence,
  // but does not touch the cart, checkout flags, quotes or human-attention state.
  estado.aclaracionIdentidad=null;
  const destino=[criterios.especie,criterios.etapa].filter(Boolean).join(' ');
  const intro=`Para tu ${destino}, estas opciones coinciden con lo que buscas${criterios.presupuestoMaximo ? ` y están dentro de ${formatearPrecio(criterios.presupuestoMaximo)}` : ''}:`;
  const lineas=opciones.map(c=>`- ${c.referencia} ${c.presentacion.peso}: ${formatearPrecio(c.presentacion.precio)} — ${[c.subcategoria?.replace(/_/g,' '),c.especie,c.etapa].filter(Boolean).join(', ')}.`);
  const nota=opciones.some(c=>c.presentacion.stock===null || c.presentacion.stock===undefined)
    ? 'Los precios están registrados; las existencias están por confirmar.' : '';
  return {respuesta:[intro,lineas.join('\n'),nota,'¿Cuál te gustaría revisar?'].filter(Boolean).join('\n\n'),
    criterios,opciones,motivo:'opciones_verificadas',incompleto:busqueda.incompleto};
}
module.exports={concretarRecomendacion,esExploracion,criteriosNecesidad,opcionesVerificables,validarSeleccion,recomendarDesdeCatalogo};
