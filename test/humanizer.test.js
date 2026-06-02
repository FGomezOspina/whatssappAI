const test = require("node:test");
const assert = require("node:assert/strict");

const { conservaAccionOperativa } = require("../src/services/humanizer");

test("rechaza una humanizacion que confirma el pedido antes del si del cliente", () => {
  const respuestaBase =
    "Pedido:\n- 2 x Dog Chow Adulto Mini y Pequeño 2kg: $72.000\nTotal: $72.000\n\n¿Está todo correcto para confirmar el pedido?";
  const respuestaHumanizada =
    "¡Perfecto! Queda confirmado tu pedido, ya lo dejamos programado para despacho.";

  assert.equal(conservaAccionOperativa(respuestaBase, respuestaHumanizada), false);
});

test("acepta una humanizacion que conserva la pregunta de confirmacion", () => {
  const respuestaBase =
    "Pedido:\n- 2 x Dog Chow Adulto Mini y Pequeño 2kg: $72.000\nTotal: $72.000\n\n¿Está todo correcto para confirmar el pedido?";
  const respuestaHumanizada =
    "Pedido:\n- 2 x Dog Chow Adulto Mini y Pequeño 2kg: $72.000\nTotal: $72.000\n\n¿Me confirmas si está todo correcto para confirmar el pedido?";

  assert.equal(conservaAccionOperativa(respuestaBase, respuestaHumanizada), true);
});

test("rechaza convertir el siguiente paso del carrito en confirmacion final", () => {
  const respuestaBase =
    "Pedido:\n- 1 x Dog Chow Cachorros Mini y Pequeño 1kg: $20.000\nTotal: $20.000\n\n¿Quieres agregar algo más o avanzamos con la entrega?";
  const respuestaHumanizada =
    "Pedido:\n- 1 x Dog Chow Cachorros Mini y Pequeño 1kg: $20.000\nTotal: $20.000\n\n¿Está todo correcto para confirmar el pedido?";

  assert.equal(conservaAccionOperativa(respuestaBase, respuestaHumanizada), false);
});
