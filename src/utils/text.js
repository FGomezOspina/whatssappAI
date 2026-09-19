function textoSeguro(valor = "") {
  return valor == null ? "" : valor.toString();
}

function expandirAbreviaturasProducto(texto = "") {
  return textoSeguro(texto)
    .toString()
    .replace(/\bdog\s+chow\s+a(?=\s+\d|\s*$)/gi, "dog chow adulto")
    .replace(/\ba[\s.,-]*r[\s.,-]*g\b/gi, "adulto raza grande")
    .replace(/\ba[\s.,-]*m[\s.,-]*g\b/gi, "adulto raza grande")
    .replace(/\ba[\s.,-]*r[\s.,-]*p\b/gi, "adulto raza pequena")
    .replace(/\ba[\s.,-]*m[\s.,-]*p\b/gi, "adulto raza pequena")
    .replace(/\badul\b/gi, "adulto")
    .replace(/\badultos\b/gi, "adulto")
    .replace(/\bpquenas\b/gi, "pequenas")
    .replace(/\bpquenos\b/gi, "pequenos")
    .replace(/\bpquena\b/gi, "pequena")
    .replace(/\bpqueno\b/gi, "pequeno")
    .replace(/\btodos\s+los\s+tama(?:ñ|n)os\b/gi, "todas las razas")
    .replace(/\bc[\s.,-]*r[\s.,-]*g\b/gi, "cachorro raza grande")
    .replace(/\bc[\s.,-]*m[\s.,-]*g\b/gi, "cachorro raza grande")
    .replace(/\bc[\s.,-]*r[\s.,-]*p\b/gi, "cachorro raza pequena")
    .replace(/\bc[\s.,-]*m[\s.,-]*p\b/gi, "cachorro raza pequena");
}

function normalizar(texto = "") {
  return expandirAbreviaturasProducto(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Une o separa solo secuencias completas que identifican una marca del
// catalogo. No borra los limites entre marca, variante, peso y otras palabras.
function normalizarMarcasCatalogo(texto = "", catalogo = []) {
  let palabras = textoSeguro(texto).split(/\s+/);
  const marcas = new Map();
  for (const item of catalogo) {
    const nombre = normalizar(item.marca);
    const clave = nombre.replace(/\s/g, "");
    if (clave.length < 4) continue;
    if (!marcas.has(clave)) marcas.set(clave, new Set());
    marcas.get(clave).add(nombre);
  }
  for (let inicio = 0; inicio < palabras.length; inicio++) {
    let unidas = "";
    for (let fin = inicio; fin < Math.min(palabras.length, inicio + 5); fin++) {
      unidas += normalizar(palabras[fin]);
      const nombres = marcas.get(unidas);
      if (nombres?.size === 1) {
        palabras.splice(inicio, fin - inicio + 1, [...nombres][0]);
        break;
      }
    }
  }
  return palabras.join(" ");
}

function normalizarPeso(texto = "") {
  const peso = normalizar(texto)
    .replace(/,/g, ".")
    .replace(
      /\b(?:x|por)\s*(?=\d+(?:\.\d+)?\s*(?:kg|kl|kr|kilogramos?|kilos?|g|gr|gramos?|lb|libras?)\b)/g,
      ""
    )
    .replace(/\s+/g, "")
    .replace(/kl/g, "kg")
    .replace(/kr/g, "kg")
    .replace(/kilogramos?|kilos?/g, "kg")
    .replace(/gramos?/g, "g")
    .replace(/(\d+(?:\.\d+)?)gr\b/g, "$1g")
    .replace(/libras?/g, "lb");

  const gramos = peso.match(/^(\d+(?:\.\d+)?)g$/);
  if (gramos && Number(gramos[1]) >= 1000) {
    return `${Number(gramos[1]) / 1000}kg`;
  }

  return peso;
}

// Preserve short commercial identifiers before punctuation/stopword expansion.
function codigosReferencia(nombre = "", marca = "") {
  const marcaTokens = new Set(textoSeguro(marca).toUpperCase().split(/\s+/));
  return [...new Set((textoSeguro(nombre).match(/\b(?:[A-Z]\/[A-Z]|[A-Z]{2})\b/g) || [])
    .filter(token => !marcaTokens.has(token) && !/^(KG|KL|GR|ML|MG|LB|CM)$/.test(token)))];
}

function formatearPrecio(precio) {
  return `$${textoSeguro(precio).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

module.exports = {
  normalizarMarcasCatalogo,
  codigosReferencia,
  expandirAbreviaturasProducto,
  formatearPrecio,
  normalizar,
  normalizarPeso,
  textoSeguro,
};
