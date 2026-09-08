const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { crearEstadoInicial } = require("../src/conversation/conversationStore");
const { validarCoincidenciaProducto, construirConsultaProductoContextual } = require("../src/services/productMatchValidator");
const { _internals: { seleccionarCatalogoLocal } } = require("../src/services/catalogContextService");

const catalogo = [
  { marca: "NUTRIMASCOTA", referencias: [
    { nombre: "NUTRIMASCOTA GATO AD", especie: "gato", categoria: "comida", etapa: "adulto", presentaciones: [{ peso: "3kg", precio: 78000 }] },
    { nombre: "NUTRIMASCOTA GATO CACH", especie: "gato", categoria: "comida", etapa: "cachorro", presentaciones: [{ peso: "3kg", precio: 88000 }] },
    { nombre: "NUTRIMASCOTA PERRO AD", especie: "perro", categoria: "comida", etapa: "adulto", presentaciones: [{ peso: "3kg", precio: 65000 }] },
  ] },
  { marca: "OTRAMARCA", referencias: [
    { nombre: "OTRAMARCA GATO AD", especie: "gato", categoria: "comida", etapa: "adulto", presentaciones: [{ peso: "3kg", precio: 12000 }] },
    { nombre: "ARENA CAT", especie: "gato", categoria: "arena_sustrato", presentaciones: [{ peso: "3kg", precio: 10000 }] },
  ] },
];

test("flujo completo precisa marca, especie y etapa sin mostrar ni agregar productos ajenos", async () => {
  const estado = crearEstadoInicial();
  const archivo = require.resolve("../src/services/conversationService");
  const localRequire = createRequire(archivo);
  const humanizaciones = [];
  const mocks = {
    "./clients.service": { obtenerClienteActual: async () => ({ id: "test", slug: "test", vertical: "petshop", prompts: {} }) },
    "../repositories/productRepository": { cargarCatalogoCliente: async () => catalogo },
    "../conversation/conversationStore": {
      obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [],
      guardarConversacionPersistida: async () => {},
    },
    "./catalogContextService": { seleccionarCatalogoParaIA: async opciones => seleccionarCatalogoLocal(opciones) },
    "./aiInterpreter": { interpretarMensajeCliente: async ({ mensaje }) => ({
      intencion: "consulta_producto", accion: "consultar", confianza: 0.99,
      // También prueba que un candidato no autoriza a inventar atributos ausentes.
      producto: { marca: "NUTRIMASCOTA", referencia: "NUTRIMASCOTA GATO AD", especie: "gato", etapa: "adulto", presentacion: mensaje.includes("3") ? "3kg" : null },
    }) },
    "./humanizer": { humanizarRespuesta: async (_mensaje, base, opciones) => { humanizaciones.push(opciones); return base; } },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, "utf8"), {
    require: nombre => mocks[nombre] || localRequire(nombre), module: modulo, process,
    console: { log() {}, error() {} },
  });
  const { responderEventoEntrante } = modulo.exports;
  const primera = await responderEventoEntrante({ channelUserId: "test", text: "¿Qué tienes en el catálogo de NUTRIMASCOTA?" });
  assert.match(primera, /gato.*perro|perro.*gato/);
  assert.doesNotMatch(primera, /\$|OTRAMARCA|ARENA|GATO AD/);
  assert.equal(estado.ultimaConsultaProducto.aclaracion.campo, "especie");
  const segunda = await responderEventoEntrante({ channelUserId: "test", text: "gato" });
  assert.match(segunda, /adulto.*cachorro|cachorro.*adulto/);
  assert.doesNotMatch(segunda, /perro|\$/);
  const tercera = await responderEventoEntrante({ channelUserId: "test", text: "adulto de 3 kg" });
  assert.match(tercera, /NUTRIMASCOTA GATO AD 3kg: \$78\.000/);
  assert.doesNotMatch(tercera, /OTRAMARCA|PERRO|CACH|cu[aá]l/i);
  assert.equal(estado.carrito.length, 0);
  assert.ok(humanizaciones[0].aclaracion);
  assert.ok(humanizaciones[1].aclaracion);
  Object.assign(estado, crearEstadoInicial());
  const directa = await responderEventoEntrante({ channelUserId: "test", text: "NUTRIMASCOTA gato adulto 3 kg" });
  assert.match(directa, /NUTRIMASCOTA GATO AD 3kg: \$78\.000/);
  assert.doesNotMatch(directa, /perro|cachorro|cu[aá]l|buscas para/i);
  assert.equal(estado.carrito.length, 0);
});

test("la identidad explicita limita candidatos y no rellena busquedas vacias", () => {
  const clasificacion = { requiereBusquedaProducto: true, perfilContexto: "producto" };
  const resultado = seleccionarCatalogoLocal({ catalogo, mensaje: "catálogo de NUTRIMASCOTA", clasificacion });
  assert.deepEqual(resultado.catalogo.map(m => m.marca), ["NUTRIMASCOTA"]);
  const vacio = seleccionarCatalogoLocal({ catalogo, mensaje: "xyznoexiste", clasificacion });
  assert.equal(vacio.catalogo.length, 0);
});

test("una categoria general pregunta solo atributos disponibles y un cambio de marca abandona el foco", () => {
  const v = validarCoincidenciaProducto({ mensaje: "comida", catalogo,
    clasificacion: { intencion: "busqueda_producto", perfilContexto: "producto" } });
  assert.equal(v.aclaracion.campo, "especie");
  const contexto = { terminos: ["NUTRIMASCOTA"], aclaracion: { campo: "especie", valores: ["gato", "perro"] }, creadoEn: new Date().toISOString() };
  assert.equal(construirConsultaProductoContextual("OTRAMARCA gato adulto 3kg", contexto), "OTRAMARCA gato adulto 3kg");
  assert.equal(construirConsultaProductoContextual("gracias", contexto), "gracias");
  assert.equal(construirConsultaProductoContextual("gato", { ...contexto, creadoEn: "2000-01-01" }), "gato");
});

test("pedir varias marcas conserva candidatos de todas las identidades explicitas", () => {
  const resultado = seleccionarCatalogoLocal({ catalogo,
    mensaje: "Quiero NUTRIMASCOTA y OTRAMARCA para gato adulto de 3kg",
    clasificacion: { requiereBusquedaProducto: true, perfilContexto: "producto" },
  });
  assert.deepEqual(resultado.catalogo.map(marca => marca.marca).sort(), ["NUTRIMASCOTA", "OTRAMARCA"]);
});

test("conserva el peso previo durante una aclaracion y no pregunta atributos ya proporcionados", () => {
  const contexto = { terminos: ["nutrimascota"], presentacion: "3kg",
    aclaracion: { campo: "especie", valores: ["perro", "gato"] }, creadoEn: new Date().toISOString() };
  const mensaje = construirConsultaProductoContextual("para gatos adultos", contexto);
  assert.match(mensaje, /nutrimascota.*gatos adultos.*3kg/);
  const validacion = validarCoincidenciaProducto({ mensaje, catalogo,
    clasificacion: { intencion: "busqueda_producto", perfilContexto: "producto" } });
  assert.equal(validacion.nivel, "alta");
  assert.equal(validacion.aclaracion, null);
  assert.equal(validacion.coincidencia.referenciaCatalogo, "NUTRIMASCOTA GATO AD");
  assert.equal(validacion.presentacionSolicitada, "3kg");
});
