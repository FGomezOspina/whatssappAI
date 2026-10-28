const { normalizar } = require('./text');
const { formatoAlimento, formatoReferencia } = require('./foodFormat');

// Resolve omitted punctuation from codes actually declared in the requested
// brand and food format. Do not turn arbitrary initials or stage words into
// catalog codes. Retrieval remains responsible for bringing the candidates.
function resolverCodigoDeclarado(mensaje, catalogo = []) {
  const formato = formatoAlimento(mensaje);
  if (!formato) return mensaje;
  const texto = ` ${normalizar(mensaje)} `;
  const familias = catalogo.filter(m => normalizar(m.marca).length >= 3 &&
    texto.includes(` ${normalizar(m.marca)} `));
  if (familias.length !== 1) return mensaje;
  const referencias = familias[0].referencias.filter(r => formatoReferencia(r) === formato);
  const codigos = new Map();
  for (const r of referencias) for (const code of r.nombre.match(/\b[A-Z]\/[A-Z]\b/g) || []) {
    const compact = code.replace('/', '').toLowerCase();
    if (!codigos.has(compact)) codigos.set(compact, new Set());
    codigos.get(compact).add(code);
  }
  return mensaje.replace(/\b[a-z]{2}\b/gi, token => {
    const compact = token.toLowerCase(), codes = codigos.get(compact);
    // A bare token registered elsewhere in this format is a competing meaning.
    const conflicto = referencias.some(r => ` ${normalizar(r.nombre)} `.includes(` ${compact} `));
    return codes?.size === 1 && !conflicto ? [...codes][0] : token;
  });
}
module.exports = { resolverCodigoDeclarado };
