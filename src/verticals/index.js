const petshop = require("./petshop");

const registry = {
  petshop,
  tienda_mascotas: petshop,
  mascotas: petshop,
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
  const tipoNegocio = cliente.businessType || cliente.tipo_negocio || cliente.vertical || "";
  const key = normalizarVertical(tipoNegocio);
  return registry[key] || null;
}

module.exports = {
  obtenerVerticalCliente,
  normalizarVertical,
  registry,
};
