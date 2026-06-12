const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { _internals: aiInterpreterInternals } = require("../src/services/aiInterpreter");

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

test("el interprete trata no es como correccion de producto y no como nombre literal", () => {
  const prompt = leerServicio("aiInterpreter.js");
  const promptCompacto = leerServicio("aiContextOptimizer.js");

  assert.match(prompt, /descarta la referencia propuesta anteriormente/i);
  assert.match(prompt, /no forman parte de la marca ni de la referencia/i);
  assert.match(prompt, /ultimaConsultaProducto contiene señales crudas/i);
  assert.match(promptCompacto, /usa el texto nuevo como correccion/i);
  assert.match(promptCompacto, /el texto nuevo reemplaza lo anterior/i);
});

test("el interprete entiende mala ortografia y direcciones colombianas informales", () => {
  const prompt = leerServicio("aiInterpreter.js");

  assert.match(prompt, /números metidos accidentalmente entre letras|numeros metidos accidentalmente entre letras/i);
  assert.match(prompt, /apertura de compra/);
  assert.match(prompt, /manzana\/mz/i);
  assert.match(prompt, /casa\/cs/i);
  assert.match(prompt, /tratala como direccion completa/i);
});

test("el interprete usa criterio experto para mapear referencias veterinarias imperfectas", () => {
  const prompt = leerServicio("aiInterpreter.js");

  assert.match(prompt, /asesor experto de petshop\/veterinaria/);
  assert.match(prompt, /cuidos\/concentrados/);
  assert.match(prompt, /medicamentos, antipulgas, desparasitantes y vacunas/);
  assert.match(prompt, /referencias del catalogo pueden estar abreviadas o resumidas/);
  assert.match(prompt, /compara por contexto veterinario y comercial/);
  assert.match(prompt, /Las presentaciones son parte central de la identidad del producto/);
  assert.match(prompt, /devuelve la marca y referencia exactas del catalogo/);
  assert.match(prompt, /nombresOriginales/);
});

test("el interprete trata condiciones como senales fuertes para escoger referencias", () => {
  const prompt = leerServicio("aiInterpreter.js");

  assert.match(prompt, /Las palabras de linea o condicion del producto pesan mucho/);
  assert.match(prompt, /castrado\/castrada/);
  assert.match(prompt, /gato castrado pollo/);
  assert.match(prompt, /no preguntes entre adulto pollo, gatito pollo y castrado pollo/i);
  assert.match(prompt, /ponlo en condiciones y úsalo para elegir la referencia exacta|ponlo en condiciones y usalo para elegir la referencia exacta/i);
  assert.match(prompt, /"condiciones": \[\]/);
});

test("el interprete no usa referencias genericas cuando el cliente da linea y tamano", () => {
  const prompt = leerServicio("aiInterpreter.js");

  assert.match(prompt, /adultos todos los tamaños/);
  assert.match(prompt, /no devuelvas una referencia generica cuyo nombre sea solo la marca/i);
  assert.match(prompt, /Todos los tamaños.*tamano "todas"/i);
});

test("el interprete cruza referencias bilingues y siglas terapeuticas", () => {
  const prompt = leerServicio("aiInterpreter.js");

  assert.match(prompt, /canine\/canino\/dog\/perro/);
  assert.match(prompt, /feline\/felino\/cat\/gato/);
  assert.match(prompt, /OM, UR, NF, HA, CN o RP/);
  assert.match(prompt, /no lo reemplaces por una referencia generica de Pro Plan ni por Adult Small/i);
  assert.match(prompt, /si ves perro\/dog\/canine y la sigla OM/i);
  assert.match(prompt, /no elijas lata\/pouch\/sobre/i);
  assert.match(prompt, /no rellenes etapa o tamano con valores genericos/i);
  assert.match(prompt, /deja null cualquier criterio no visible/i);
});

test("el interprete mapea empaques visuales contra referencias internas del catalogo", () => {
  const prompt = leerServicio("aiInterpreter.js");

  assert.match(prompt, /Vision de empaques/);
  assert.match(prompt, /producto\.textoVisible transcribe/i);
  assert.match(prompt, /producto\.linea conserva la variante o especialidad distintiva/i);
  assert.match(prompt, /Una linea visible pesa mas que una coincidencia generica/i);
  assert.match(prompt, /El caption puede ser solo "manejan esta referencia"; la imagen es la fuente principal/);
  assert.match(prompt, /no exijas coincidencia textual exacta entre empaque y referencia interna/i);
  assert.match(prompt, /sabor visible no aparece en el nombre interno/);
  assert.match(prompt, /Si dice "para todas las razas", usa tamano "todas"/);
  assert.match(prompt, /ignora el sabor para elegir la referencia por etapa y tamano/);
  assert.match(prompt, /Busca el peso\/presentacion en zonas pequenas del empaque/);
  assert.match(prompt, /normalizalo como presentacion exacta del catalogo/);
  assert.match(prompt, /para todas las razas.*gana sobre la foto de un perro/i);
  assert.match(prompt, /vision_compacta/);
  assert.match(prompt, /OPENAI_VISION_DETAIL/);
  assert.match(prompt, /OPENAI_VISION_MODEL/);
});

test("el interprete usa catalogo compacto para vision y evita metadata pesada", () => {
  const catalogo = [
    {
      marca: "Marca Test",
      referencias: [
        {
          nombre: "Referencia Test",
          descripcion: "descripcion pesada que no debe ir a vision",
          metadata: { original_names: ["nombre original pesado"] },
          presentaciones: [
            { peso: "10kg", precio: 99999, stock: true },
            { peso: "20kg", precio: 199999, stock: true },
          ],
        },
      ],
    },
  ];

  const resumen = aiInterpreterInternals.resumenCatalogoParaPrompt(catalogo, { vision: true });
  const texto = JSON.stringify(resumen);

  assert.equal(resumen.modo, "vision_compacta");
  assert.deepEqual(resumen.marcas, ["Marca Test"]);
  assert.deepEqual(resumen.referencias, ["Marca Test | Referencia Test"]);
  assert.doesNotMatch(texto, /descripcion pesada/);
  assert.doesNotMatch(texto, /nombre original pesado/);
  assert.doesNotMatch(texto, /99999/);
  assert.doesNotMatch(texto, /10kg/);
});

test("el interprete convierte formulas medicas en cotizaciones de productos", () => {
  const prompt = leerServicio("aiInterpreter.js");

  assert.match(prompt, /formula medica, receta veterinaria/i);
  assert.match(prompt, /cliente quiere cotizar esos productos/i);
  assert.match(prompt, /numero de tabletas\/pastas, gotas, ml, sobres, frascos o unidades/i);
  assert.match(prompt, /Devuelve productos\[\] con intencion "consulta_producto" y accion "consultar"/);
  assert.match(prompt, /no diagnostiques, no expliques dosis/i);
  assert.match(prompt, /separa cada medicamento como un producto distinto/i);
  assert.match(prompt, /no inventes medicamentos/i);
});

test("el interprete cambia de foco cuando preguntan por categorias no comida", () => {
  const prompt = leerServicio("aiInterpreter.js");

  assert.match(prompt, /purgantes para gato/);
  assert.match(prompt, /pulgas y garrapatas para gato/);
  assert.match(prompt, /arena para gato/);
  assert.match(prompt, /cambia el foco aunque antes hubiera una referencia pendiente/i);
  assert.match(prompt, /medicamento\/desparasitante para gato/i);
  assert.match(prompt, /medicamento\/antipulgas para esa especie/i);
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
