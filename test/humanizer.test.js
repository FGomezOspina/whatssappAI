const test = require("node:test");
const assert = require("node:assert/strict");

const {
  conservaAccionOperativa,
  _internals: { omitirHumanizadorProducto },
} = require("../src/services/humanizer");

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

test("omite humanizador en busqueda simple aunque el motor deje seleccion pendiente", () => {
  const anterior = process.env.HUMANIZER_PRODUCT_SEARCH;
  delete process.env.HUMANIZER_PRODUCT_SEARCH;

  try {
    assert.equal(
      omitirHumanizadorProducto("Estas son las presentaciones disponibles.", {
        clasificacion: { perfilContexto: "producto" },
        cliente: { prompts: {} },
        estado: { ultimaSeleccion: { marca: "BR", referencia: "Adulto RP" } },
      }),
      true
    );
  } finally {
    if (anterior === undefined) delete process.env.HUMANIZER_PRODUCT_SEARCH;
    else process.env.HUMANIZER_PRODUCT_SEARCH = anterior;
  }
});
