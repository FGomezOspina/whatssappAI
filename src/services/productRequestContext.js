const { normalizar } = require('../utils/text');
const { _internals: { tokensDistintivos, normalizarAtributoIdentidad } } = require('./productMatchValidator');

function solicitudRespaldada(producto, terminos) {
  if (!Array.isArray(terminos) || !terminos.length) return { ...producto };
  const evidencia=new Set(tokensDistintivos(terminos.join(' ')).map(normalizarAtributoIdentidad));
  // Los términos del ranking pueden omitir descripciones o códigos cortos.
  // Una lectura visual previa sigue siendo evidencia de la solicitud, aun
  // cuando no haya coincidencia de catálogo; no equivale a identidad validada.
  if (Number(producto?.observado?.confianzaIdentidad) >= .85 && producto.observado.nombre) {
    for (const token of tokensDistintivos(producto.observado.nombre)) evidencia.add(normalizarAtributoIdentidad(token));
  }
  if (Number(producto?.observado?.confianzaEspecie) >= .85 && producto.observado.evidenciaEspecie)
    for (const token of tokensDistintivos(producto.observado.especie || '')) evidencia.add(normalizarAtributoIdentidad(token));
  const resultado={...producto};
  for(const campo of ['marca','linea','referencia','especie','etapa','tamano']) {
    const tokens=tokensDistintivos(producto?.[campo] || '').map(normalizarAtributoIdentidad);
    if(tokens.length && !tokens.every(t=>evidencia.has(t)))resultado[campo]=null;
  }
  return resultado;
}

// Unknowns stay unknown. This projection is retrieval evidence, not a catalog match.
function solicitudEstructurada(producto = {}) {
  const p = producto || {};
  return Object.fromEntries(['marca','linea','referencia','especie','categoria','subcategoria','envase','etapa','tamano',
    'presentacion','cantidad','duracion','sabores','condiciones'].map(campo =>
      [campo, Array.isArray(p[campo]) ? [...p[campo]] : p[campo] ?? null]));
}
function consultaEstructurada(producto) {
  const p = solicitudEstructurada(producto);
  // Purpose can aid retrieval separately; it must not replace a named reference.
  return [...new Set([p.marca,p.linea,p.referencia,p.especie,p.etapa,p.tamano,p.subcategoria,p.envase,
    ...(p.sabores || []),p.presentacion,p.duracion].filter(Boolean))].join(' ');
}
function identidadCompatibleAlAclarar(previa, actual, campos, aclaracionSemantica) {
  const canonicos = valor => normalizar(valor || '').split(/\s+/).filter(Boolean)
    .map(t => normalizarAtributoIdentidad(t === 'fel' ? 'felino' : t === 'can' ? 'canino' : t));
  const marcaCompacta = valor => normalizar(valor || '').replace(/\s+/g,'');
  for (const campo of ['especie','etapa','tamano']) {
    if (!campos.includes(campo) && previa[campo] && actual[campo] &&
        canonicos(previa[campo]).join(' ') !== canonicos(actual[campo]).join(' ')) return false;
  }
  const atributos = new Set(campos.flatMap(c => [...canonicos([previa[c]].flat().filter(Boolean).join(' ')),
    ...canonicos([actual[c]].flat().filter(Boolean).join(' '))]));
  // A catalog label can repeat the brand and species already in structured
  // fields. Remove only those grounded redundancies, not commercial variants.
  for (const campo of ['especie','etapa','tamano']) {
    if (previa[campo] && actual[campo] && canonicos(previa[campo]).join(' ')===canonicos(actual[campo]).join(' '))
      canonicos(previa[campo]).forEach(t=>atributos.add(t));
  }
  const identidad = p => {
    const marca=canonicos(p.marca);
    const limpiar=valor=>{
      let texto=normalizar(valor || '');
      if (marca.length) texto=texto.replace(new RegExp('\\b'+marca.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*')+'\\b','g'),' ');
      if (campos.includes('subcategoria') || campos.includes('envase')) texto=require('../utils/foodFormat').sinFormato(texto);
      return canonicos(texto).filter(t=>!atributos.has(t));
    };
    // Brand conflicts are checked separately below. Omitting a repeated brand
    // in a contextual correction is not a new commercial identity.
    return [...new Set(['linea','referencia'].filter(c=>!campos.includes(c)).flatMap(c=>limpiar(p[c])))];
  };
  const antes=identidad(previa), ahora=identidad(actual);
  // An explicit conflicting brand always denotes another identity, unless brand
  // itself is the missing field. Species/size synonyms cannot erase a brand.
  if (!campos.includes('marca') && previa.marca && actual.marca &&
      marcaCompacta(previa.marca)!==marcaCompacta(actual.marca)) return false;
  if (!antes.length) return !ahora.length && (aclaracionSemantica || Boolean(previa.marca && actual.marca &&
    marcaCompacta(previa.marca) === marcaCompacta(actual.marca)));
  if (!ahora.length) return aclaracionSemantica;
  // A follow-up often repeats only the brand/line. Omission is not a
  // correction; new discriminating tokens still reject continuity.
  const { codigosReferencia } = require('../utils/text');
  const codigosPrevios = codigosReferencia(previa.referencia || '', previa.marca);
  const codigosActuales = codigosReferencia(actual.referencia || '', actual.marca);
  if (!codigosActuales.every(c => codigosPrevios.includes(c))) return false;
  return aclaracionSemantica ? ahora.every(t=>antes.includes(t)) :
    antes.length===ahora.length && antes.every(t=>ahora.includes(t));
}
// Re-enter an earlier item after a different product held the conversational
// focus. This supplies retrieval evidence, never a cached price or a new alias.
function retomaPresentacionesPorMarca(decision, mensaje) {
  const p = decision.producto || {};
  if (p.intencionPresentaciones !== 'todas' || !p.marca || p.referencia || p.linea) return false;
  const nucleo = tokensDistintivos(mensaje).filter(t => !/^presentacion(?:es)?$/.test(t));
  return nucleo.length > 0 && normalizar(nucleo.join('')).replace(/\s/g,'') ===
    normalizar(p.marca).replace(/\s/g,'');
}
function recuperarConsultaCotizada(decision, estado, mensaje) {
  const actual = decision.producto;
  if (decision._consultaContinuada || decision.seguimientoProducto !== 'aclaracion' && !retomaPresentacionesPorMarca(decision, mensaje) ||
      decision.accion !== 'consultar' || decision.productos?.length > 1 || !actual?.marca ||
      Number(decision.confianza) < .55 || estado.pedidoConfirmado) return decision;
  const marca = v => normalizar(v || '').replace(/\s/g, '');
  const ultimo = estado.ultimaConsultaProducto?.solicitudOriginal?.producto;
  if (ultimo?.marca && marca(ultimo.marca) === marca(actual.marca)) return decision;
  const { codigosReferencia } = require('../utils/text');
  const codigos = codigosReferencia(actual.referencia || '', actual.marca);
  const tokens = tokensDistintivos(actual.referencia || '');
  const compatibles = (estado.seleccionesProducto || []).filter(previo => {
    if (['descartado', 'confirmado'].includes(previo.estado) || !previo.cotizacion?.length ||
        !previo.referencia || marca(previo.marca) !== marca(actual.marca)) return false;
    const historial = (estado.historialProductosConsultados || []).find(p =>
      marca(p.marca) === marca(previo.marca) && normalizar(p.referencia) === normalizar(previo.referencia));
    const fecha = Date.parse(historial?.actualizadoEn || historial?.creadoEn || previo.contextoCreadoEn);
    if (!Number.isFinite(fecha) || Date.now() - fecha > 30 * 60 * 1000 || fecha > Date.now()) return false;
    const nombre = [previo.referencia, previo.observado?.nombre, previo.textoVisible].filter(Boolean).join(' ');
    const conocidos = tokensDistintivos(nombre);
    return codigos.every(c => codigosReferencia(nombre, previo.marca).includes(c)) &&
      tokens.every(t => conocidos.includes(t)) &&
      ['especie', 'etapa', 'subcategoria', 'envase'].every(c => !actual[c] || !previo[c] ||
        normalizar(actual[c]) === normalizar(previo[c]));
  });
  const familias = [...new Map(compatibles.map(p => [marca(p.marca) + ':' + normalizar(p.referencia), p])).values()];
  if (familias.length !== 1) return decision;
  const previa = familias[0];
  const producto = { ...solicitudEstructurada(previa),
    ...Object.fromEntries(Object.entries(actual).filter(([k, v]) =>
      !['marca', 'referencia', 'linea', 'textoVisible', 'mencionOriginal'].includes(k) && v != null &&
      (!Array.isArray(v) || v.length))), marca: previa.marca, referencia: previa.referencia,
    textoVisible: previa.referencia, mencionOriginal: mensaje };
  if (actual.intencionPresentaciones === 'todas') producto.presentacion = null;
  // Quotes are re-read from the catalog. A validated code anchors the lookup;
  // the model's earlier packaging description cannot erase it on the way back.
  const consulta = consultaEstructurada(producto);
  return { ...decision, producto, productos: [], _consultaContinuada: consulta,
    _aclaracionAtributo: true, consultaCatalogo: { necesaria: true, consulta } };
}
function recuperarSolicitudPendiente(decision, estado, mensaje) {
  if (decision._consultaContinuada || decision.seguimientoProducto !== 'aclaracion' && !retomaPresentacionesPorMarca(decision, mensaje) ||
      decision.accion !== 'consultar' || decision.productos?.length > 1 ||
      Number(decision.confianza) < .55 || estado.pedidoConfirmado) return decision;
  const actual = decision.producto || {};
  const marca = v => normalizar(v || '').replace(/\s/g, '');
  const foco = estado.ultimaConsultaProducto;
  const marcaBuscada = actual.marca || foco?.solicitudOriginal?.producto?.marca;
  if (!marcaBuscada) return decision;
  const candidatos = (estado.ultimaSolicitudProductos || []).filter(p => {
    const fecha = Date.parse(p.contextoCreadoEn || (marca(p.marca) === marca(foco?.solicitudOriginal?.producto?.marca) ? foco?.creadoEn : null));
    return p.estado === 'pendiente' && p.referencia && marca(p.marca) === marca(marcaBuscada) &&
      Number.isFinite(fecha) && Date.now() >= fecha && Date.now()-fecha < 30*60*1000 &&
      identidadCompatibleAlAclarar(p, actual, ['presentacion','cantidad','subcategoria','envase'], true);
  });
  if (candidatos.length !== 1) return decision;
  const previa = candidatos[0];
  const producto = { ...previa, mencionOriginal: mensaje };
  for (const k of ['presentacion','cantidad','intencionPresentaciones'])
    if (actual[k] != null) producto[k] = actual[k];
  const formato = require('../utils/foodFormat').dimensionesAlimento(mensaje);
  if (formato.forma || formato.envase) {
    producto.subcategoria = formato.forma || producto.subcategoria;
    producto.envase = formato.envase || null;
    producto.solicitud = { ...producto.solicitud, formaAlimentoTexto: formato.forma, envaseTexto: formato.envase };
  }
  if (actual.intencionPresentaciones === 'todas') producto.presentacion = null;
  // Pending evidence remains pending: neither cached prices nor a catalog
  // identity are manufactured. The validator must resolve it again.
  for (const k of ['cotizacion','pregunta','estado','presentacionesDisponibles']) delete producto[k];
  const consulta = consultaEstructurada(producto);
  return { ...decision, producto, productos: [], _consultaContinuada: consulta,
    _aclaracionAtributo: true, consultaCatalogo: { necesaria: true, consulta } };
}
module.exports={solicitudEstructurada,consultaEstructurada,identidadCompatibleAlAclarar,solicitudRespaldada,recuperarConsultaCotizada,recuperarSolicitudPendiente};
