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
  assert.match(prompt, /Nunca afirmes que el pedido ya quedo confirmado o programado para despacho/);
  assert.match(prompt, /Conserva las preguntas operativas del backend/);
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

test("el agente distingue repetir pedido de reutilizar datos de entrega", () => {
  const interpreterPrompt = leerServicio("aiInterpreter.js");
  const humanizerPrompt = leerServicio("humanizer.js");

  assert.match(interpreterPrompt, /tratelo como memoria historica/);
  assert.match(interpreterPrompt, /usa accion "nuevo_pedido"/i);
  assert.match(interpreterPrompt, /nuevo carrito debe contener solo lo pedido en el mensaje actual/);
  assert.match(interpreterPrompt, /datos anteriores de cliente y entrega si son memoria reutilizable/);
  assert.match(humanizerPrompt, /no lo mezcles con productos anteriores/);
});

test("el interprete no confunde una cedula con presupuesto", () => {
  const prompt = leerServicio("aiInterpreter.js");

  assert.match(prompt, /Nunca interpretes una cedula, celular, direccion o presentacion de producto como presupuesto/);
  assert.match(prompt, /"1004755939".*es una cedula dentro de datos_envio/);
});

test("el interprete usa el contexto pendiente para afirmaciones con errores ortograficos", () => {
  const prompt = leerServicio("aiInterpreter.js");

  assert.match(prompt, /Tolera errores ortograficos, letras omitidas y variantes informales tambien en respuestas cortas/);
  assert.match(prompt, /respuesta corta a una pregunta de confirmacion no reemplaza nunca nombre/);
});

test("el interprete entiende mala ortografia y direcciones colombianas informales", () => {
  const prompt = leerServicio("aiInterpreter.js");

  assert.match(prompt, /números metidos accidentalmente entre letras|numeros metidos accidentalmente entre letras/i);
  assert.match(prompt, /apertura de compra/);
  assert.match(prompt, /manzana\/mz/i);
  assert.match(prompt, /casa\/cs/i);
  assert.match(prompt, /tratala como direccion completa/i);
});

test("el interprete mapea empaques visuales contra referencias internas del catalogo", () => {
  const prompt = leerServicio("aiInterpreter.js");

  assert.match(prompt, /Vision de empaques/);
  assert.match(prompt, /El caption puede ser solo "manejan esta referencia"; la imagen es la fuente principal/);
  assert.match(prompt, /no exijas coincidencia textual exacta entre empaque y referencia interna/i);
  assert.match(prompt, /sabor visible no aparece en el nombre interno/);
  assert.match(prompt, /Si dice "para todas las razas", usa tamano "todas"/);
  assert.match(prompt, /ignora el sabor para elegir la referencia por etapa y tamano/);
  assert.match(prompt, /Busca el peso\/presentacion en zonas pequenas del empaque/);
  assert.match(prompt, /normalizalo como presentacion exacta del catalogo/);
  assert.match(prompt, /para todas las razas.*gana sobre la foto de un perro/i);
  assert.match(prompt, /detail: "high"/);
  assert.match(prompt, /OPENAI_VISION_MODEL/);
});

test("el procesador multimedia usa un modelo moderno de transcripcion por defecto", () => {
  const servicio = leerServicio("mediaProcessor.js");

  assert.match(servicio, /OPENAI_TRANSCRIPTION_MODEL \|\| "gpt-4o-transcribe"/);
  assert.match(servicio, /OPENAI_TRANSCRIPTION_FALLBACK_MODEL \|\| "gpt-4o-mini-transcribe"/);
  assert.match(servicio, /construirPromptTranscripcion/);
});

test("el interprete contempla errores foneticos de audios de WhatsApp", () => {
  const prompt = leerServicio("aiInterpreter.js");

  assert.match(prompt, /Audio y transcripciones/);
  assert.match(prompt, /transcritas de forma fonetica/);
  assert.match(prompt, /dog show/);
  assert.match(prompt, /intencion "consulta_producto"/);
});

test("el interprete usa timeout especifico para vision", () => {
  const servicio = leerServicio("aiInterpreter.js");

  assert.match(servicio, /OPENAI_VISION_TIMEOUT_MS/);
  assert.match(servicio, /timeoutInterpretacion\(urlsImagen\)/);
});
