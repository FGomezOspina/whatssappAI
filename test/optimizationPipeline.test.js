const test = require("node:test");
const assert = require("node:assert/strict");

const { clasificarInteraccion } = require("../src/services/interactionClassifier");
const {
  seleccionarCatalogoParaIA,
  seleccionarCatalogoRefinadoVision,
  _internals: catalogContextInternals,
} = require("../src/services/catalogContextService");
const { construirMemoriaOperativa } = require("../src/services/contextBuilder");
const { modeloInterprete, modeloHumanizador } = require("../src/services/modelRouter");
const {
  construirPromptInterprete,
  construirSolicitudHumanizador,
  construirSolicitudInterprete,
  _internals: contextOptimizerInternals,
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

test("rechazo con producto como contexto pasa por IA sin buscar catalogo", () => {
  const clasificacion = clasificarInteraccion({
    mensaje: "Ahh si, no esa arena no me funciono. Te agradezco mucho",
    estado: {},
  });

  assert.equal(clasificacion.intencion, "cierre_contextual");
  assert.equal(clasificacion.requiereOpenAI, true);
  assert.equal(clasificacion.requiereBusquedaProducto, false);
  assert.equal(clasificacion.perfilContexto, "simple");
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

test("una consulta explícita no mezcla la referencia anterior en el ranking", () => {
  const catalogoSimilar = [
    {
      marca: "NUTRILINE",
      referencias: [
        {
          nombre: "NUTRILINE CAT URINARY",
          presentaciones: [{ peso: "3kg", precio: 150000 }],
        },
        {
          nombre: "NUTRILINE URINARY",
          presentaciones: [{ peso: "1.5kg", precio: 92000 }],
        },
      ],
    },
  ];
  const clasificacion = clasificarInteraccion({
    mensaje: "nutriline urinary 1.5kg",
    estado: {},
  });
  const resultado = catalogContextInternals.seleccionarCatalogoLocal({
    catalogo: catalogoSimilar,
    mensaje: "nutriline urinary 1.5kg",
    estado: {
      marca: "NUTRILINE",
      ultimaSeleccion: {
        marca: "NUTRILINE",
        referencia: "NUTRILINE CAT URINARY",
      },
      criterios: { especie: "gato" },
    },
    clasificacion: {
      ...clasificacion,
      requiereBusquedaProducto: true,
    },
  });

  assert.equal(
    resultado.catalogo[0].referencias[0].nombre,
    "NUTRILINE URINARY"
  );
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

test("el historial estructurado conserva diez cotizaciones sin enviar conversaciones completas", () => {
  const historialProductosConsultados = Array.from(
    { length: 15 },
    (_, index) => ({
      indice: index + 1,
      marca: `Marca ${index + 1}`,
      referencia: `Producto ${index + 1}`,
      presentaciones: [
        { peso: `${index + 1}kg`, precio: 10000 + index },
      ],
    })
  );
  const compacto = contextOptimizerInternals.compactarEstado(
    {
      productosConsultados: [{ marca: "Marca 15", referencia: "Producto 15" }],
      historialProductosConsultados,
    },
    "producto"
  );

  assert.equal(compacto.historialProductosConsultados.length, 10);
  assert.equal(compacto.historialProductosConsultados[0].referencia, "Producto 6");
  assert.equal(compacto.historialProductosConsultados[9].referencia, "Producto 15");
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

test("una imagen nueva omite el foco anterior pero conserva el carrito activo", () => {
  const estado = {
    marca: "Chunky",
    criterios: { etapa: "adulto" },
    ultimaSeleccion: { marca: "Chunky", referencia: "CHUNKY ADULTO" },
    productosConsultados: [
      { marca: "Chunky", referencia: "CHUNKY ADULTO", peso: "2kg" },
    ],
    historialProductosConsultados: [
      {
        marca: "Chunky",
        referencia: "CHUNKY ADULTO",
        presentaciones: [{ peso: "2kg", precio: 18900 }],
      },
    ],
    ultimaInteraccionProducto: {
      intencionOriginal: "foto anterior",
      tipoIntencion: "consulta_producto",
    },
    carrito: [
      {
        marca: "Dog Chow",
        referencia: "Adulto Mini y Pequeno",
        peso: "2kg",
        cantidad: 1,
      },
    ],
    entrega: { tipo: "domicilio" },
  };
  const mensaje =
    "El cliente envió una imagen. Analízala para entender su solicitud.";
  const clasificacion = clasificarInteraccion({
    mensaje,
    estado,
    contenidos: [{ metadata: { tipo: "image" } }],
    imageUrls: ["data:image/jpeg;base64,abc"],
  });
  const solicitud = construirSolicitudInterprete({
    mensaje,
    estado,
    catalogo: [],
    historialReciente: [
      { direction: "outbound", body: "CHUNKY ADULTO 2kg: $18.900" },
    ],
    ejemplosEntrenamiento: [
      {
        customer_message: "Chunky adulto",
        ideal_response: "Mostrar Chunky adulto",
      },
    ],
    clasificacion,
    model: "gpt-4.1",
  });

  assert.equal(clasificacion.limiteHistorial, 0);
  assert.equal(clasificacion.limiteEjemplos, 0);
  assert.deepEqual(solicitud.contexto.historial, []);
  assert.deepEqual(solicitud.contexto.ejemplos, []);
  assert.equal(solicitud.contexto.contextoActivo.marca, null);
  assert.deepEqual(
    solicitud.contexto.contextoActivo.historialProductosConsultados,
    []
  );
  assert.equal(solicitud.contexto.contextoActivo.carrito.length, 1);
  assert.equal(solicitud.contexto.contextoActivo.entrega.tipo, "domicilio");
  assert.doesNotMatch(
    JSON.stringify(solicitud.contexto),
    /CHUNKY ADULTO 2kg/
  );
});

test("prompts por perfil conservan las reglas criticas del flujo", () => {
  const producto = construirPromptInterprete({ perfil: "producto" });
  const pedido = construirPromptInterprete({ perfil: "pedido" });
  const multimedia = construirPromptInterprete({ perfil: "multimedia" });
  const complejo = construirPromptInterprete({ perfil: "complejo" });

  assert.match(producto, /RP\/raza pequena\/mini\/small indican tamano pequeno/i);
  assert.match(producto, /Consultar precio o disponibilidad usa accion consultar/i);
  assert.match(producto, /varias opciones plausibles deja referencia null/i);

  assert.match(pedido, /Prioriza estado\.esperando y el carrito activo/i);
  assert.match(pedido, /pedido anterior es memoria historica/i);
  assert.match(pedido, /quitar, mantener_solo o modificar_cantidad/i);

  assert.match(multimedia, /audio corrige errores foneticos/i);
  assert.match(multimedia, /transcribe en textoVisible/i);
  assert.match(multimedia, /revisionVision esta activa/i);
  assert.match(multimedia, /imagen lee marca, linea, especie, etapa, tamano, peso y siglas/i);
  assert.match(multimedia, /devuelve la referencia exacta del candidato con confianza alta/i);
  assert.match(multimedia, /submarcas o claims comerciales/i);
  assert.match(multimedia, /No incluyas referencias que contradigan texto visible/i);
  assert.match(multimedia, /receta o formula se interpreta como cotizacion/i);

  assert.match(complejo, /Consolida todos los mensajes del lote/i);
  assert.match(complejo, /Separa productos y cantidades/i);
});

test("la segunda lectura visual recibe la familia detectada y sus variantes", () => {
  const catalogoVision = [
    {
      marca: "EXCELLENT",
      referencias: [
        {
          nombre: "EXCELLENT GATO ADULT",
          especie: "gato",
          presentaciones: [{ peso: "3kg", precio: 74700 }],
        },
        {
          nombre: "EXCELLENT GATO URINARY",
          especie: "gato",
          presentaciones: [
            { peso: "1kg", precio: 34000 },
            { peso: "3kg", precio: 81900 },
            { peso: "7.5kg", precio: 163700 },
          ],
        },
      ],
    },
    {
      marca: "OTRA",
      referencias: [
        {
          nombre: "OTRA GATO ADULTO",
          especie: "gato",
          presentaciones: [{ peso: "3kg", precio: 50000 }],
        },
      ],
    },
  ];
  const resultado = seleccionarCatalogoRefinadoVision({
    catalogo: catalogoVision,
    interpretacion: {
      producto: {
        marca: "EXCELLENT",
        referencia: "EXCELLENT GATO ADULT",
        textoVisible: "Excellent gatos adultos 3 kg",
        presentacion: "3kg",
      },
    },
    clasificacion: {
      requiereVision: true,
      requiereBusquedaProducto: true,
    },
  });

  assert.equal(resultado.metadata.estrategia, "vision_refinada_por_entidad");
  assert.ok(
    resultado.catalogo[0].referencias.some(
      (referencia) => referencia.nombre === "EXCELLENT GATO URINARY"
    )
  );
});

test("combina recuperacion fuzzy local con candidatos remotos sin exceder el limite", () => {
  const local = [
    {
      marca: "RINGO",
      referencias: [
        { nombre: "RINGO CROQUETAS", metadata: {}, presentaciones: [] },
        { nombre: "RINGO PREMIUM", metadata: {}, presentaciones: [] },
      ],
    },
  ];
  const remoto = [
    {
      marca: "OTRA",
      referencias: [
        { nombre: "OTRA ORIGINAL", metadata: {}, presentaciones: [] },
      ],
    },
  ];
  const combinado = catalogContextInternals.combinarCatalogosCandidatos(
    local,
    remoto,
    3
  );
  const nombres = combinado.flatMap((marca) =>
    marca.referencias.map((referencia) => referencia.nombre)
  );

  assert.deepEqual(nombres, [
    "RINGO CROQUETAS",
    "RINGO PREMIUM",
    "OTRA ORIGINAL",
  ]);
  assert.equal(nombres.length, 3);
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
