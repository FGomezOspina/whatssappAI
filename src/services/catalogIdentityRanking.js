const { normalizar } = require('../utils/text');

// Rarity is measured within this request's tenant-scoped candidate catalog.
// Only registered commercial names contribute; operational metadata cannot
// create identity evidence. This ranks retrieval, never confirms a product.
function palabras(texto) {
  return normalizar(texto).split(/\s+/).filter(t => /^[a-z]{3,}$/.test(t));
}
function crearRankingIdentidad(items, consulta) {
  const documentos = items.map(({ marca, referencia }) => new Set(palabras([
    marca.marca, referencia.nombre,
    ...(Array.isArray(referencia.metadata?.original_names) ? referencia.metadata.original_names : []),
    ...(Array.isArray(referencia.metadata?.aliases) ? referencia.metadata.aliases : []),
  ].filter(Boolean).join(' '))));
  const frecuencias = new Map();
  for (const doc of documentos) for (const token of doc) {
    frecuencias.set(token, (frecuencias.get(token) || 0) + 1);
  }
  const originales = normalizar(consulta).split(/\s+/);
  const tokens = new Set(palabras(consulta));
  // Recover split names only when the concatenation exists in this catalog.
  for (let i = 0; i < originales.length - 1; i++) {
    const unido = originales[i] + originales[i + 1];
    if (/^[a-z]{5,}$/.test(unido) && frecuencias.has(unido)) tokens.add(unido);
  }
  return documentos.map(doc => [...tokens].reduce((score, token) => {
    if (!doc.has(token)) return score;
    const informacion = Math.log(1 + items.length / frecuencias.get(token));
    return score + 16 * informacion;
  }, 0));
}

module.exports = { crearRankingIdentidad };
