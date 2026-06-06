const test = require("node:test");
const assert = require("node:assert/strict");

const { clasificarInteraccion } = require("../src/services/interactionClassifier");
const { seleccionarCatalogoParaIA } = require("../src/services/catalogContextService");
const { construirMemoriaOperativa } = require("../src/services/contextBuilder");
const { modeloInterprete, modeloHumanizador } = require("../src/services/modelRouter");
const {
  construirPromptInterprete,
  construirSolicitudHumanizador,
  construirSolicitudInterprete,
} = require("../src/services/aiContextOptimizer");

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
    OPENAI_INTERPRETER_MODEL_PRODUCT: process.env.OPENAI_INTERPRETER_MODEL_PRODUCT,
    OPENAI_HUMANIZER_MODEL_COMPLEX: process.env.OPENAI_HUMANIZER_MODEL_COMPLEX,
  };
  process.env.OPENAI_INTERPRETER_MODEL_SIMPLE = "modelo-simple";
  process.env.OPENAI_INTERPRETER_MODEL_PRODUCT = "modelo-producto";
  process.env.OPENAI_HUMANIZER_MODEL_COMPLEX = "modelo-humano-complejo";

  try {
    assert.equal(modeloInterprete({ complejidad: "simple" }), "modelo-simple");
    assert.equal(
      modeloInterprete({ complejidad: "normal", perfilContexto: "producto" }),
      "modelo-producto"
    );
    assert.equal(modeloHumanizador({ complejidad: "compleja" }), "modelo-humano-complejo");
  } finally {
    Object.entries(envAnterior).forEach(([clave, valor]) => {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    });
  }
});

test("consulta simple de producto usa contexto compacto dentro del presupuesto", () => {
  const referencias = Array.from({ length: 12 }, (_, index) => ({
    nombre: `BR Adulto Raza Pequena ${index + 1}`,
    especie: "perro",
    categoria: "comida",
    subcategoria: "concentrado",
    etapa: "adulto",
    descripcion:
      "Alimento completo para perros adultos de raza pequena con nutricion balanceada y texto comercial adicional.",
    metadata: { id: `interno-${index}`, original_names: ["texto interno"] },
    presentaciones: [
      { peso: "2kg", precio: 30000 + index, stock: true, metadata: { id: "interno" } },
      { peso: "4kg", precio: 50000 + index, stock: true },
    ],
  }));
  const mensaje = "tienes br adulto r pequena?";
  const clasificacion = clasificarInteraccion({ mensaje, estado: {} });
  const solicitud = construirSolicitudInterprete({
    mensaje,
    estado: {},
    catalogo: [{ marca: "BR", referencias }],
    historialReciente: Array.from({ length: 10 }, () => ({
      direction: "inbound",
      body: "mensaje historico que no debe enviarse",
    })),
    ejemplosEntrenamiento: Array.from({ length: 5 }, () => ({
      customer_message: "ejemplo historico",
      ideal_response: "respuesta historica",
    })),
    clasificacion,
    cliente: { name: "Distrifinca", vertical: "petshop", prompts: {} },
    vertical: { prompts: {} },
    model: "gpt-5.4-mini",
  });
  const payload = JSON.stringify(solicitud.contexto);

  assert.equal(clasificacion.perfilContexto, "producto");
  assert.equal(clasificacion.limiteHistorial, 0);
  assert.equal(clasificacion.limiteEjemplos, 0);
  assert.deepEqual(solicitud.contexto.historial, []);
  assert.deepEqual(solicitud.contexto.ejemplos, []);
  assert.ok(solicitud.diagnostico.tokensEstimados < 2000);
  assert.doesNotMatch(payload, /interno-/);
  assert.doesNotMatch(payload, /original_names|metadata|stock/);
});

test("humanizador compacto queda por debajo de mil tokens", () => {
  const mensaje = "tienes br adulto r pequena?";
  const clasificacion = clasificarInteraccion({ mensaje, estado: {} });
  const solicitud = construirSolicitudHumanizador({
    mensaje,
    respuestaBase:
      "Sí, manejo BR Adulto Raza Pequeña.\n- 2kg: $30.000\n- 4kg: $50.000\n¿Cuál presentación necesitas?",
    interpretacion: {
      intencion: "consulta_producto",
      accion: "consultar",
      producto: { marca: "BR", etapa: "adulto", tamano: "pequeno" },
    },
    clasificacion,
    estado: {},
    cliente: { prompts: {} },
    vertical: { prompts: {} },
    model: "gpt-5.4-mini",
  });

  assert.ok(solicitud.diagnostico.tokensEstimados < 1000);
  assert.deepEqual(solicitud.contexto.contextoActivo, {});
  assert.equal(solicitud.excedePresupuesto, false);
});

test("prompts por perfil conservan las reglas criticas del flujo", () => {
  const producto = construirPromptInterprete({ perfil: "producto" });
  const pedido = construirPromptInterprete({ perfil: "pedido" });
  const multimedia = construirPromptInterprete({ perfil: "multimedia" });
  const complejo = construirPromptInterprete({ perfil: "complejo" });

  assert.match(producto, /a\.r\.p\/arp significa adulto raza pequena/i);
  assert.match(producto, /Consultar precio o disponibilidad usa accion consultar/i);
  assert.match(producto, /varias opciones plausibles deja referencia null/i);

  assert.match(pedido, /Prioriza estado\.esperando y el carrito activo/i);
  assert.match(pedido, /pedido anterior es memoria historica/i);
  assert.match(pedido, /quitar, mantener_solo o modificar_cantidad/i);

  assert.match(multimedia, /audio corrige errores foneticos/i);
  assert.match(multimedia, /imagen lee marca, linea, especie, etapa, tamano, peso y siglas/i);
  assert.match(multimedia, /receta o formula se interpreta como cotizacion/i);

  assert.match(complejo, /Consolida todos los mensajes del lote/i);
  assert.match(complejo, /Separa productos y cantidades/i);
});

test("pedido activo conserva contexto limitado sin reenviar memoria duplicada", () => {
  const estado = {
    carrito: [{ marca: "BR", referencia: "Adulto Pequeno", peso: "4kg", cantidad: 1, precio: 50000 }],
    datosDomicilio: { nombre: "Cliente", direccion: "Cra 10 # 20-30" },
    esperandoMetodoPago: true,
  };
  const clasificacion = clasificarInteraccion({ mensaje: "efectivo", estado });
  const solicitud = construirSolicitudInterprete({
    mensaje: "efectivo",
    estado,
    catalogo: [],
    historialReciente: Array.from({ length: 10 }, (_, index) => ({
      direction: index % 2 ? "outbound" : "inbound",
      body: `mensaje ${index}`,
    })),
    ejemplosEntrenamiento: [],
    clasificacion,
    model: "gpt-5.2",
  });

  assert.equal(clasificacion.perfilContexto, "pedido");
  assert.equal(solicitud.contexto.historial.length, 3);
  assert.equal(solicitud.contexto.contextoActivo.carrito.length, 1);
  assert.equal(solicitud.contexto.contextoActivo.esperando.metodoPago, true);
  assert.equal("memoriaOperativa" in solicitud.contexto, false);
  assert.equal("estado" in solicitud.contexto, false);
  assert.ok(solicitud.diagnostico.tokensEstimados < 4200);
});

test("pedido confirmado anterior no infla una nueva busqueda de producto", () => {
  const estado = {
    pedidoConfirmado: true,
    carrito: [{ marca: "Dog Chow", referencia: "Adulto", peso: "4kg", cantidad: 1 }],
    ultimoPedidoConfirmado: {
      carrito: [{ marca: "Dog Chow", referencia: "Adulto", peso: "4kg", cantidad: 1 }],
    },
    datosDomicilio: { direccion: "Cra 10 # 20-30" },
  };
  const mensaje = "tienes br adulto r pequena?";
  const clasificacion = clasificarInteraccion({ mensaje, estado });
  const solicitud = construirSolicitudInterprete({
    mensaje,
    estado,
    catalogo: catalogo.slice(0, 1),
    clasificacion,
    model: "gpt-5.4-mini",
  });

  assert.equal(clasificacion.perfilContexto, "producto");
  assert.deepEqual(solicitud.contexto.contextoActivo, {});
  assert.equal(clasificacion.limiteHistorial, 0);
});
