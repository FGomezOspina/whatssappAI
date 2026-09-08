const test = require("node:test");
const assert = require("node:assert/strict");

const { dividirRespuestaMensajes, unirMensajesRespuesta } = require("../src/utils/responseMessages");
const { formatearPrecio, normalizar, normalizarPeso } = require("../src/utils/text");

test("normalizadores de texto toleran valores null", () => {
  assert.equal(normalizar(null), "");
  assert.equal(normalizarPeso(null), "");
  assert.equal(formatearPrecio(null), "$");
});

test("divisor de respuestas tolera valores null", () => {
  assert.deepEqual(dividirRespuestaMensajes(null), []);
  assert.equal(unirMensajesRespuesta([null, " Hola "]), "Hola");
});
