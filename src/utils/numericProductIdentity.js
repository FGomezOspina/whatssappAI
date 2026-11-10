const { normalizar } = require('./text');

// A measurement is a presentation; a remaining number after a product word
// can distinguish a commercial line. Never treat the leading order quantity
// as the line number.
function variantesNumericas(texto = '') {
  const identidad = normalizar(texto).replace(/\b\d+(?:\.\d+)?\s*(?:kg|kl|kilos?|kilogramos?|g|gr|gramos?|mg|ml|l|litros?|lb|cm|mm|unidades?|und)\b/g, ' ');
  return [...identidad.matchAll(/\b([a-z]{3,})\s+(\d+(?:\.\d+)?)\b/g)]
    .filter(m => !['por', 'para', 'con', 'son', 'las', 'los', 'del', 'dame', 'quiero', 'necesito'].includes(m[1]))
    .map(m => ({ ancla: m[1], valor: m[2] }));
}

function identidadesNumericasCompatibles(a, b) {
  const izquierda = variantesNumericas(a).map(x => x.valor).sort();
  const derecha = variantesNumericas(b).map(x => x.valor).sort();
  return JSON.stringify(izquierda) === JSON.stringify(derecha);
}

function conflictoNumericoExplicito(consulta, referencia) {
  const solicitadas = variantesNumericas(consulta);
  return variantesNumericas(referencia).some(r =>
    solicitadas.some(s => s.ancla === r.ancla && s.valor !== r.valor));
}

module.exports = { variantesNumericas, identidadesNumericasCompatibles, conflictoNumericoExplicito };
