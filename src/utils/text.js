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
  return normalizar(texto)
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/kl/g, "kg")
    .replace(/kilogramos?|kilos?/g, "kg")
    .replace(/gramos?/g, "g")
    .replace(/(\d+(?:\.\d+)?)gr\b/g, "$1g")
    .replace(/libras?/g, "lb");
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
