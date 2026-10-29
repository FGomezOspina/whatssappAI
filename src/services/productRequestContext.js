const { normalizar } = require('../utils/text');
const { _internals: { tokensDistintivos, normalizarAtributoIdentidad } } = require('./productMatchValidator');

function solicitudRespaldada(producto, terminos) {
  if (!Array.isArray(terminos) || !terminos.length) return { ...producto };
  const evidencia=new Set(tokensDistintivos(terminos.join(' ')).map(normalizarAtributoIdentidad));
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
  return Object.fromEntries(['marca','linea','referencia','especie','categoria','etapa','tamano',
    'presentacion','cantidad','duracion','sabores','condiciones'].map(campo =>
      [campo, Array.isArray(p[campo]) ? [...p[campo]] : p[campo] ?? null]));
}
function consultaEstructurada(producto) {
  const p = solicitudEstructurada(producto);
  // Purpose can aid retrieval separately; it must not replace a named reference.
  return [...new Set([p.marca,p.linea,p.referencia,p.especie,p.etapa,p.tamano,
    ...(p.sabores || []),p.presentacion,p.duracion].filter(Boolean))].join(' ');
}
function identidadCompatibleAlAclarar(previa, actual, campos, aclaracionSemantica) {
  const canonicos = valor => normalizar(valor || '').split(/\s+/).filter(Boolean).map(normalizarAtributoIdentidad);
  const atributos = new Set(campos.flatMap(c => [...canonicos([previa[c]].flat().filter(Boolean).join(' ')),
    ...canonicos([actual[c]].flat().filter(Boolean).join(' '))]));
  const identidad = p => [...new Set(['marca','linea','referencia'].filter(c=>!campos.includes(c))
    .flatMap(c=>canonicos(p[c])).filter(t=>!atributos.has(t)))];
  const antes=identidad(previa), ahora=identidad(actual);
  if (!antes.length) return aclaracionSemantica;
  // An explicit conflicting brand always denotes another identity, unless brand
  // itself is the missing field. Species/size synonyms cannot erase a brand.
  if (!campos.includes('marca') && previa.marca && actual.marca &&
      normalizar(previa.marca)!==normalizar(actual.marca)) return false;
  if (!ahora.length) return aclaracionSemantica;
  return antes.length===ahora.length && antes.every(t=>ahora.includes(t));
}
module.exports={solicitudEstructurada,consultaEstructurada,identidadCompatibleAlAclarar,solicitudRespaldada};
