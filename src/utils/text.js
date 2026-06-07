function expandirAbreviaturasProducto(texto = "") {
  return texto
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
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function formatearPrecio(precio) {
  return `$${precio.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

module.exports = {
  expandirAbreviaturasProducto,
  formatearPrecio,
  normalizar,
  normalizarPeso,
};
