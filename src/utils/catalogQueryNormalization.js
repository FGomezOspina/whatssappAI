// Search-only normalization: no learned aliases, catalog mutations or prices.

const numeros = { un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5,
  seis:6, siete:7, ocho:8, nueve:9, diez:10, once:11, doce:12,
  cien:100, ciento:100, doscientos:200, trescientos:300, cuatrocientos:400,
  quinientos:500, seiscientos:600, setecientos:700, ochocientos:800, novecientos:900, mil:1000 };
const fracciones = { medio:0.5, media:0.5, cuarto:0.25 };
const numero = `(?:\\d+(?:[.,]\\d+)?|${Object.keys(numeros).join('|')})`;
const fraccion = `(?:${Object.keys(fracciones).join('|')})`;
const unidad = '(?:kilogramos?|kilos?|kg|gramos?|gr|g|mililitros?|ml|litros?|l)';
const valor = token => numeros[token] ?? fracciones[token] ?? Number(token.replace(',', '.'));

function normalizarMedidasBusqueda(texto = '') {
  // Full measurement spans only: "medio" in a product name is not a quantity.
  // Canonical mass/volume use existing catalog units; never infer package size.
  const convertir = (_, cantidad, unidades, parte) => {
    const n = valor(cantidad.toLowerCase()) + (parte ? valor(parte.toLowerCase()) : 0);
    const u = unidades.toLowerCase();
    if (/^(kg|kilo)/.test(u)) return n < 1 ? `${n*1000}g` : `${n}kg`;
    if (/^(g|gr)/.test(u)) return n >= 1000 ? `${n/1000}kg` : `${n}g`;
    if (/^(l|litro)/.test(u)) return `${n*1000}ml`;
    return `${n}ml`;
  };
  return texto.replace(new RegExp(`\\b(${numero}|${fraccion})\\s*(${unidad})(?:\\s+y\\s+(${fraccion}))?\\b`, 'gi'), convertir);
}

function corregirTokensCatalogo(texto, catalogo, { normalizar, tokensDistintivos }) {
  const { distanciaDamerauLevenshtein } = require('../services/catalogConsolidationService')._internals;
  const vocabulario = new Set(catalogo.flatMap(m => m.referencias.flatMap(r =>
    [m.marca, r.nombre, ...(r.metadata?.aliases || [])].flatMap(n => tokensDistintivos(n)))));
  const candidatos = [...vocabulario].filter(t => /^[a-z]{5,}$/.test(t));
  const permitidos = new Set(tokensDistintivos(texto));
  return texto.replace(/[a-záéíóúñ]+/gi, token => {
    const t = normalizar(token);
    if (!permitidos.has(t) || vocabulario.has(t) || !/^[a-z]{5,}$/.test(t)) return token;
    const cercanos = candidatos.filter(c => Math.abs(c.length-t.length)<=1 && distanciaDamerauLevenshtein(c,t)===1);
    // Ambiguous corrections and short commercial codes remain untouched.
    return cercanos.length === 1 ? cercanos[0] : token;
  });
}

// Commercial shorthand is interpreted only against the provided tenant catalog.
// An actual SKU named X2K wins over a possible weight; bare "2k" can be money.
function normalizarKilosAbreviadosCatalogo(texto = '', catalogo = []) {
  if (!/\bx\s*\d+(?:[.,]\d+)?\s*k\b/i.test(texto)) return texto;
  const { normalizar, normalizarMarcasCatalogo, normalizarPeso } = require('./text');
  const comercial = normalizarMarcasCatalogo(texto, catalogo);
  const familias = catalogo.filter(m => ` ${normalizar(comercial)} `.includes(` ${normalizar(m.marca)} `));
  if (!familias.length) return texto;
  const nombres = catalogo.flatMap(m => [m.marca, ...m.referencias.flatMap(r =>
    [r.nombre, ...(Array.isArray(r.metadata?.aliases) ? r.metadata.aliases : [])])]);
  return texto.replace(/\bx\s*(\d+(?:[.,]\d+)?)\s*k\b/gi, (token, cantidad, offset) => {
    const compacto = token.replace(/\s+/g, '').toLowerCase();
    if (nombres.some(n => (String(n).match(/\bx\s*\d+(?:[.,]\d+)?\s*k\b/gi) || [])
      .some(codigo => codigo.replace(/\s+/g, '').toLowerCase() === compacto))) return token;
    if (/\$\s*$/.test(texto.slice(0, offset)) || /^\s*(?:pesos|cop)\b/i.test(texto.slice(offset + token.length))) return token;
    const peso = `${Number(cantidad.replace(',', '.'))}kg`;
    if (!familias.some(m => m.referencias.some(r => r.presentaciones?.some(p => normalizarPeso(p.peso) === peso)))) return token;
    return peso;
  });
}
module.exports = { normalizarMedidasBusqueda, corregirTokensCatalogo, normalizarKilosAbreviadosCatalogo };
