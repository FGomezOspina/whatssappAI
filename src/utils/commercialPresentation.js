const { normalizar, normalizarPeso } = require('./text');

// Local food retail convention, not a physical pounds-to-grams conversion.
// Apply only after identifying a food reference and checking its catalog sizes.
function resolverLibraComercial(solicitud, referencia) {
  if (!['comida', 'alimento'].includes(normalizar(referencia?.categoria))) return null;
  if (!/^(?:una?\s+|1\s*)?(?:libra|lb)$/.test(normalizar(solicitud))) return null;
  const presentaciones = referencia.presentaciones || [];
  if (presentaciones.some(p => /^(?:1)?lb$/.test(normalizarPeso(p.peso)))) return null;
  const compatibles = presentaciones.filter(p => normalizarPeso(p.peso) === '500g');
  return compatibles.length === 1 ? compatibles[0] : null;
}

module.exports = { resolverLibraComercial };
