// Petshop orders use the active catalog, not a live inventory feed. Keep legacy
// stock in stored records for compatibility, but never give it decision power.
const INSTRUCCIONES_SIN_EXISTENCIAS = "Acepta pedidos de referencias y presentaciones activas verificadas en el catalogo, con sus precios reales. No consultes, menciones ni condiciones la compra a stock, inventario, existencias, agotados o confirmacion de disponibilidad. Los faltantes se gestionan manualmente fuera del agente. Esta regla no autoriza referencias inexistentes, variantes ambiguas, sustituciones ni precios inventados; consulta o aclara su identidad antes de agregar. Una consulta de precio o disponibilidad no autoriza comprar.";

function serializarContextoComercial(contexto) {
  return JSON.stringify(contexto, (campo, valor) => campo === 'stock' ? undefined : valor);
}

function mencionaExistencias(texto = '') {
  return /\b(?:stock|existencias|inventario|agotad[oa]s?)\b|(?:confirmar|verificar|validar|revisar|consultar|comprobar)(?:\s+\w+){0,4}\s+disponibilidad|disponibilidad\s+(?:pendiente|por confirmar|no confirmada)/i.test(texto) ||
    /\bno\s+(?:est[aá]n?|se encuentra[n]?)\s+disponibles?\b|\bsin\s+disponibilidad\b|\bno\s+hay\s+(?:m[aá]s\s+)?unidades\b|\b(?:confirmar|verificar|revisar|consultar|comprobar)\s+si\s+(?:lo\s+|la\s+|las\s+|los\s+)?(?:tenemos|hay)\b/i.test(texto);
}

module.exports = { INSTRUCCIONES_SIN_EXISTENCIAS, serializarContextoComercial, mencionaExistencias };
