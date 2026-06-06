const test = require("node:test");
const assert = require("node:assert/strict");

const { clasificarInteraccion } = require("../src/services/interactionClassifier");
const { seleccionarCatalogoParaIA } = require("../src/services/catalogContextService");
const { construirMemoriaOperativa } = require("../src/services/contextBuilder");
const { modeloInterprete, modeloHumanizador } = require("../src/services/modelRouter");

const catalogo = [
  {
    marca: "Dog Chow",
    referencias: [
      {
        nombre: "Adulto Mini y Pequeno",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "adulto",
        descripcion: "Para perros adultos raza pequena",
        presentaciones: [{ peso: "2kg", precio: 36000 }],
      },
    ],
  },
  {
    marca: "Boehringer",
    referencias: [
      {
        nombre: "Bravecto Perro 10 a 20kg",
        especie: "perro",
        categoria: "medicamento",
        subcategoria: "antipulgas",
        descripcion: "Pastilla para pulgas y garrapatas",
        presentaciones: [{ peso: "unidad", precio: 95000 }],
      },
    ],
  },
  {
    marca: "Chunky",
    referencias: [
      {
        nombre: "Adulto Todas las Razas",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        presentaciones: [{ peso: "x 2 kg", precio: 18900 }],
      },
    ],
  },
];

test("clasifica interacciones simples y busquedas sin llamar a OpenAI", () => {
  const saludo = clasificarInteraccion({ mensaje: "hola", estado: {} });
  assert.equal(saludo.intencion, "saludo");
  assert.equal(saludo.complejidad, "simple");
  assert.equal(saludo.requiereBusquedaProducto, false);
  assert.equal(saludo.requiereOpenAI, false);

  const busqueda = clasificarInteraccion({ mensaje: "pastilla para garrapatas de perro", estado: {} });
  assert.equal(busqueda.intencion, "busqueda_producto");
  assert.equal(busqueda.requiereBusquedaProducto, true);
  assert.equal(busqueda.requiereOpenAI, true);
});

test("filtra catalogo para OpenAI con tolerancia a errores y limite configurable", async () => {
  const envAnterior = process.env.CATALOG_CONTEXT_MAX_REFERENCES;
  process.env.CATALOG_CONTEXT_MAX_REFERENCES = "1";

  try {
    const clasificacion = clasificarInteraccion({ mensaje: "brabecto para garrapatas", estado: {} });
    const resultado = await seleccionarCatalogoParaIA({
      catalogo,
      mensaje: "brabecto para garrapatas",
      estado: {},
      clasificacion,
    });

    assert.equal(resultado.metadata.totalReferencias, 3);
    assert.equal(resultado.metadata.referenciasEnviadas, 1);
    assert.equal(resultado.catalogo[0].marca, "Boehringer");
    assert.equal(resultado.catalogo[0].referencias[0].nombre, "Bravecto Perro 10 a 20kg");
  } finally {
    if (envAnterior === undefined) delete process.env.CATALOG_CONTEXT_MAX_REFERENCES;
    else process.env.CATALOG_CONTEXT_MAX_REFERENCES = envAnterior;
  }
});

test("no envia catalogo al modelo cuando no hay busqueda de producto", async () => {
  const clasificacion = clasificarInteraccion({ mensaje: "gracias", estado: {} });
  const resultado = await seleccionarCatalogoParaIA({ catalogo, mensaje: "gracias", estado: {}, clasificacion });

  assert.equal(resultado.metadata.estrategia, "sin_busqueda");
  assert.equal(resultado.metadata.referenciasEnviadas, 0);
  assert.deepEqual(resultado.catalogo, []);
});

test("construye memoria por niveles sin reenviar historial completo", () => {
  const memoria = construirMemoriaOperativa(
    {
      carrito: [{ marca: "Chunky", referencia: "Adulto", peso: "2kg" }],
      datosDomicilio: { nombre: "Cliente", direccion: "Cuba" },
      ultimoPedidoConfirmado: { carrito: [{ marca: "Dog Chow" }], metodoPago: "efectivo" },
    },
    [{ body: "mensaje 1" }, { body: "mensaje 2" }]
  );

  assert.equal(memoria.nivel1ConversacionActiva.carrito.length, 1);
  assert.equal(memoria.nivel2PerfilCliente.datosDomicilio.direccion, "Cuba");
  assert.equal(memoria.nivel3HistorialDisponible.conservadoEnSupabase, true);
  assert.equal(memoria.nivel3HistorialDisponible.mensajesRecientesEnviadosAlModelo, 2);
});

test("router de modelos respeta variables por complejidad", () => {
  const envAnterior = {
    OPENAI_INTERPRETER_MODEL_SIMPLE: process.env.OPENAI_INTERPRETER_MODEL_SIMPLE,
    OPENAI_HUMANIZER_MODEL_COMPLEX: process.env.OPENAI_HUMANIZER_MODEL_COMPLEX,
  };
  process.env.OPENAI_INTERPRETER_MODEL_SIMPLE = "modelo-simple";
  process.env.OPENAI_HUMANIZER_MODEL_COMPLEX = "modelo-humano-complejo";

  try {
    assert.equal(modeloInterprete({ complejidad: "simple" }), "modelo-simple");
    assert.equal(modeloHumanizador({ complejidad: "compleja" }), "modelo-humano-complejo");
  } finally {
    Object.entries(envAnterior).forEach(([clave, valor]) => {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    });
  }
});
