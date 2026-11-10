const { normalizar } = require('./text');

// Catalog vocabulary, independent of brand or conversational intent.
function formatoAlimento(texto = '') {
  const valor = normalizar(texto).replace(/_/g, ' ');
  if (/\b(humed[oa]s?|pouche?s?|sobres?|sachets?|latas?)\b/.test(valor)) return 'comida_humeda';
  if (/\b(concentrado|cuido|sec[oa]s?)\b/.test(valor)) return 'concentrado';
  return null;
}

function formatoReferencia(referencia) {
  // Packaging alone does not turn medicine or accessories into food.
  if (referencia.categoria && !/^(comida|alimento)$/.test(normalizar(referencia.categoria))) return null;
  return formatoAlimento([referencia.nombre, referencia.subcategoria,
    ...(referencia.metadata?.aliases || []), ...(referencia.metadata?.original_names || [])].join(' '));
}

const VOCABULARIO_ENVASE = /\b(?:latas?|pouche?s?|sobres?|sachets?)\b/g;
// Resolve explicit linguistic corrections, never a weight-to-format heuristic.
function textoFormatoVigente(texto = '') {
  let valor = normalizar(texto).replace(/_/g, ' ');
  valor = valor.replace(/\bno\s+(?:en\s+)?(?:latas?|sobres?|pouche?s?|sachets?|concentrado|sec[oa]|humed[oa])\b/g, ' ');
  const partes = valor.split(/\b(?:sino|mejor|quise decir|queria decir)\b/);
  if (partes.length > 1 && (formatoAlimento(partes.at(-1)) || /\b(?:latas?|sobres?)\b/.test(partes.at(-1)))) valor = partes.at(-1);
  return valor.trim();
}
function dimensionesAlimento(texto = '') {
  const valor = textoFormatoVigente(texto);
  // CAN is also a catalog abbreviation for canine; never treat it as a can.
  const lata = /\blatas?\b/.test(valor);
  const sobre = /\b(?:pouche?s?|sobres?|sachets?)\b/.test(valor);
  const humedo = lata || sobre || /\bhumed[oa]s?\b/.test(valor);
  const seco = /\b(?:concentrado|cuido|sec[oa]s?)\b/.test(valor);
  return { forma: humedo && seco ? null : humedo ? 'comida_humeda' : seco ? 'concentrado' : null,
    envase: lata && sobre ? null : lata ? 'lata' : sobre ? 'sobre' : null,
    conflictoForma: humedo && seco, conflictoEnvase: lata && sobre };
}
function dimensionesReferencia(referencia = {}) {
  if (referencia.categoria && !/^(comida|alimento)$/.test(normalizar(referencia.categoria))) return { forma:null, envase:null };
  const dimensiones = dimensionesAlimento([referencia.nombre, referencia.subcategoria,
    referencia.metadata?.forma_alimento, referencia.metadata?.envase,
    ...(referencia.metadata?.original_names || [])].filter(Boolean).join(' '));
  const declarada = dimensionesAlimento([referencia.subcategoria, referencia.metadata?.forma_alimento].filter(Boolean).join(' '));
  const nombreSinEnvase = normalizar([referencia.nombre, ...(referencia.metadata?.original_names || [])].join(' ')).replace(VOCABULARIO_ENVASE, ' ');
  const formaNominal = dimensionesAlimento(nombreSinEnvase).forma;
  // Explicit food form is independent of packaging: dry food can also be sold
  // in a can. Preserve genuine conflicting form labels as unverified.
  if (declarada.forma && (!formaNominal || formaNominal === declarada.forma)) {
    dimensiones.forma = declarada.forma; dimensiones.conflictoForma = false;
  }
  return dimensiones;
}
function sinFormato(texto = '') {
  // Preserve printed codes such as EN while removing only format vocabulary.
  return String(texto).replace(/_/g, ' ')
    .replace(new RegExp(VOCABULARIO_ENVASE.source, 'gi'), ' ')
    .replace(/\b(?:comida\s+|alimento\s+)?(?:h[uú]med[oa]s?|concentrado|cuido|sec[oa]s?)\b/gi, ' ')
    .replace(/\s+/g,' ').trim();
}
module.exports = { formatoAlimento, formatoReferencia, dimensionesAlimento, dimensionesReferencia, textoFormatoVigente, sinFormato };
