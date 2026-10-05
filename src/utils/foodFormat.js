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

module.exports = { formatoAlimento, formatoReferencia };
