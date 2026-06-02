const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function leerServicio(nombre) {
  return fs.readFileSync(path.join(__dirname, "..", "src", "services", nombre), "utf8");
}

test("el interprete trata una direccion posterior a cotizacion como continuacion del pedido", () => {
  const prompt = leerServicio("aiInterpreter.js");

  assert.match(prompt, /Una direccion es un dato operativo para continuar el pedido/);
  assert.match(prompt, /es una aceptacion implicita para continuar/);
  assert.match(prompt, /usa productosConsultados del estado/);
  assert.match(prompt, /no politicas operativas vigentes/);
});

test("el humanizador no infiere politicas de domicilio desde ejemplos historicos", () => {
  const prompt = leerServicio("humanizer.js");

  assert.match(prompt, /productosConsultados: estado\.productosConsultados/);
  assert.match(prompt, /Nunca inventes que no hacemos domicilios en un barrio o sector/);
  assert.match(prompt, /No son una fuente de politicas operativas/);
});

test("el interprete conserva datos confirmados cuando recibe el metodo de pago", () => {
  const prompt = leerServicio("aiInterpreter.js");

  assert.match(prompt, /estado\.datosDomicilio son memoria confirmada/);
  assert.match(prompt, /Devuelve en datosCliente solo los datos nuevos o corregidos/);
  assert.match(prompt, /completa solo entrega\.metodoPago/);
  assert.match(prompt, /Nunca interpretes una forma de pago como nombre de cliente/);
  assert.match(prompt, /No reemplaces "Maria Lopez"/);
});

test("el agente interpreta mensajes consecutivos como un solo turno", () => {
  const interpreterPrompt = leerServicio("aiInterpreter.js");
  const humanizerPrompt = leerServicio("humanizer.js");

  assert.match(interpreterPrompt, /varios mensajes consecutivos del cliente/);
  assert.match(interpreterPrompt, /Devuelve una sola interpretacion consolidada/);
  assert.match(humanizerPrompt, /Responde una sola vez al conjunto/);
});
