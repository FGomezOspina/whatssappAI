const petshop = require("./petshop");
const guarderia = require("./guarderia");

const registry = {
  petshop,
  tienda_mascotas: petshop,
  mascotas: petshop,
  guarderia,
  daycare: guarderia,
  pet_daycare: guarderia,
  hotel_mascotas: guarderia,
};

function normalizarVertical(valor = "") {
  return valor
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function obtenerVerticalCliente(cliente = {}) {
  const tipoNegocio = cliente.businessType || cliente.business_type || cliente.tipo_negocio || cliente.vertical || "";
  const key = normalizarVertical(tipoNegocio);
  return registry[key] || null;
}

module.exports = {
  obtenerVerticalCliente,
  normalizarVertical,
  registry,
};
