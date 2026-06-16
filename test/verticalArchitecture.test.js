const test = require("node:test");
const assert = require("node:assert/strict");

const petshopOrderLogic = require("../src/verticals/petshop/orderLogic");
const { obtenerVerticalCliente } = require("../src/verticals");

test("la logica conversacional actual se importa directo desde la vertical petshop", () => {
  assert.equal(typeof petshopOrderLogic.resolverConsultaCatalogo, "function");
  assert.equal(typeof petshopOrderLogic.buscarMarca, "function");
});

test("selecciona petshop desde el tipo de negocio del cliente", () => {
  assert.equal(obtenerVerticalCliente({ vertical: "petshop" }).key, "petshop");
  assert.equal(obtenerVerticalCliente({ tipo_negocio: "tienda mascotas" }).key, "petshop");
  assert.equal(obtenerVerticalCliente({ businessType: "mascotas" }).key, "petshop");
});

test("registra guarderia como vertical preparada sin usar petshop como fallback", () => {
  const vertical = obtenerVerticalCliente({ business_type: "guarderia" });
  assert.equal(vertical.key, "guarderia");
  assert.equal(vertical.implemented, false);
});

test("una vertical no registrada no usa una logica alternativa silenciosa", () => {
  assert.equal(obtenerVerticalCliente({ vertical: "restaurant" }), null);
});
