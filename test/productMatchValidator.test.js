const assert = require("node:assert/strict");
const test = require("node:test");

const {
  aplicarCoincidenciaValidada,
  construirConsultaProductoContextual,
  respuestaValidacionProducto,
  validarCoincidenciaProducto,
} = require("../src/services/productMatchValidator");
const {
  crearEstadoInicial,
} = require("../src/conversation/conversationStore");
const {
  resolverConsultaCatalogo,
} = require("../src/verticals/petshop/orderLogic");

const clasificacionTexto = {
  intencion: "busqueda_producto",
  perfilContexto: "producto",
  requiereVision: false,
};

const catalogo = [
  {
    marca: "BR",
    referencias: [
      {
        nombre: "BR CORDERO",
        metadata: {},
        presentaciones: [{ peso: "2 kg", precio: 32000 }],
      },
    ],
  },
  {
    marca: "BOMBONERA",
    referencias: [
      {
        nombre: "BOMBONERA BR GATO BOLA PELO",
        metadata: {},
        presentaciones: [{ peso: "unidad", precio: 12000 }],
      },
    ],
  },
  {
    marca: "NUTRECAN",
    referencias: [
      {
        nombre: "ADULTO RP",
        metadata: { original_names: ["Nutrecan adulto raza pequena"] },
        presentaciones: [{ peso: "4 kg", precio: 37200 }],
      },
    ],
  },
  {
    marca: "CHUNKY",
    referencias: [
      {
        nombre: "ADULTO RP",
        metadata: {},
        presentaciones: [{ peso: "4 kg", precio: 37200 }],
      },
    ],
  },
  {
    marca: "DOG CHOW",
    referencias: [
      {
        nombre: "ADULTOS RAZAS PEQUENAS",
        metadata: {},
        presentaciones: [{ peso: "2 kg", precio: 36000 }],
      },
    ],
  },
  {
    marca: "MSD",
    referencias: [
      {
        nombre: "BRAVECTO 10 A 20 KG",
        metadata: {},
        presentaciones: [{ peso: "unidad", precio: 95000 }],
      },
    ],
  },
];

test("rechaza una marca corta inexistente sin sustituirla por candidatos similares", () => {
  const validacion = validarCoincidenciaProducto({
    mensaje: "tienes br adulto r pequena?",
    catalogo,
    catalogoCandidatos: catalogo.slice(0, 4),
    clasificacion: clasificacionTexto,
  });

  assert.equal(validacion.nivel, "baja");
  assert.deepEqual(validacion.terminos, ["br", "adulto", "perro", "pequeno"]);
  const respuesta = respuestaValidacionProducto(validacion);
  assert.match(respuesta, /no encuentro BR ADULTO PEQUENO en el catálogo actual/i);
  assert.doesNotMatch(respuesta, /NUTRECAN|CHUNKY/);
});

test("acepta una marca exacta aunque existan varias referencias de esa marca", () => {
  const validacion = validarCoincidenciaProducto({
    mensaje: "tienes dog chow adulto pequena?",
    catalogo,
    catalogoCandidatos: [catalogo[4]],
    clasificacion: clasificacionTexto,
  });

  assert.equal(validacion.nivel, "alta");
  assert.equal(validacion.coincidencia.marca, "DOG CHOW");
  assert.equal(validacion.coincidencia.tipoCoincidencia, "referencia");
});

test("texto usa detalle adicional para resolver marcas internas con for dog o for cat", () => {
  const catalogoFor = [
    {
      marca: "BR DOG",
      referencias: [
        {
          nombre: "BR DOG ADULTO",
          especie: "perro",
          etapa: "adulto",
          metadata: {},
          presentaciones: [{ peso: "3kg", precio: 30000 }],
        },
        {
          nombre: "BR DOG CACHORRO",
          especie: "perro",
          metadata: {},
          presentaciones: [{ peso: "3kg", precio: 32000 }],
        },
      ],
    },
    {
      marca: "BR CAT",
      referencias: [
        {
          nombre: "BR CAT ADULTO",
          especie: "gato",
          etapa: "adulto",
          metadata: {},
          presentaciones: [{ peso: "3kg", precio: 31000 }],
        },
      ],
    },
  ];
  const validacion = validarCoincidenciaProducto({
    mensaje: "precio br for dog adulto 3kg",
    catalogo: catalogoFor,
    catalogoCandidatos: catalogoFor,
    clasificacion: {
      intencion: "precio",
      perfilContexto: "producto",
      requiereVision: false,
    },
  });

  assert.equal(validacion.nivel, "alta");
  assert.equal(validacion.coincidencia.marca, "BR DOG");
  assert.equal(validacion.coincidencia.referencia, "BR DOG ADULTO");
  assert.deepEqual(
    validacion.alternativas.map((item) => item.referencia),
    ["BR DOG ADULTO"]
  );
});

test("audio transcrito usa las mismas equivalencias de identidad que texto", () => {
  const catalogoAudio = [
    {
      marca: "BR CAT",
      referencias: [
        {
          nombre: "BR CAT ADULTO",
          especie: "gato",
          etapa: "adulto",
          metadata: {},
          presentaciones: [{ peso: "3kg", precio: 31000 }],
        },
      ],
    },
    {
      marca: "NUTRA NUGGETS",
      referencias: [
        {
          nombre: "NUTRA NUGGETS MAINTENANCE CAT",
          especie: "gato",
          metadata: {},
          presentaciones: [{ peso: "3kg", precio: 70000 }],
        },
        {
          nombre: "NUTRA NUGGETS PROFESSIONAL DOG",
          especie: "perro",
          metadata: {},
          presentaciones: [{ peso: "15kg", precio: 190000 }],
        },
      ],
    },
  ];
  const brCat = validarCoincidenciaProducto({
    mensaje: "br for cat adulto 3kg",
    catalogo: catalogoAudio,
    catalogoCandidatos: catalogoAudio,
    clasificacion: {
      intencion: "audio",
      perfilContexto: "multimedia",
      requiereVision: false,
    },
  });
  const nuggets = validarCoincidenciaProducto({
    mensaje: "nutra nuggets maintenance cat 3kg",
    catalogo: catalogoAudio,
    catalogoCandidatos: catalogoAudio,
    clasificacion: {
      intencion: "audio",
      perfilContexto: "multimedia",
      requiereVision: false,
    },
  });

  assert.equal(brCat.nivel, "alta");
  assert.equal(brCat.coincidencia.referencia, "BR CAT ADULTO");
  assert.equal(nuggets.nivel, "alta");
  assert.equal(
    nuggets.coincidencia.referencia,
    "NUTRA NUGGETS MAINTENANCE CAT"
  );
});

test("texto descarta condiciones no solicitadas y entiende abreviaturas internas", () => {
  const catalogoAgility = [
    {
      marca: "AGILITY",
      referencias: [
        {
          nombre: "AGILITY GATO ESTERILIZADO",
          especie: "gato",
          metadata: {},
          presentaciones: [{ peso: "1.5kg", precio: 43600 }],
        },
        {
          nombre: "AGILITY EN LATA PERRO",
          especie: "perro",
          metadata: {},
          presentaciones: [{ peso: "360gr", precio: 16800 }],
        },
        {
          nombre: "AGILITY OBESOS",
          especie: "perro",
          metadata: {},
          presentaciones: [{ peso: "7kg", precio: 133900 }],
        },
        {
          nombre: "AGILITY GRAND ADUL",
          especie: "perro",
          etapa: "adulto",
          metadata: {},
          presentaciones: [
            { peso: "1.5kg", precio: 30500 },
            { peso: "3kg", precio: 59800 },
          ],
        },
        {
          nombre: "AGILITY GRAND ADUL PIEL",
          especie: "perro",
          etapa: "adulto",
          metadata: {},
          presentaciones: [{ peso: "8kg", precio: 162500 }],
        },
        {
          nombre: "AGILITY PEQ ADUL",
          especie: "perro",
          etapa: "adulto",
          metadata: {},
          presentaciones: [{ peso: "3kg", precio: 68900 }],
        },
      ],
    },
  ];

  const generico = validarCoincidenciaProducto({
    mensaje: "y que costo tiene agility gold perro adulto?",
    catalogo: catalogoAgility,
    catalogoCandidatos: catalogoAgility,
    clasificacion: {
      intencion: "precio",
      perfilContexto: "producto",
      requiereVision: false,
    },
  });
  const grande = validarCoincidenciaProducto({
    mensaje: "agility grandes adulto?",
    catalogo: catalogoAgility,
    catalogoCandidatos: catalogoAgility,
    clasificacion: {
      intencion: "precio",
      perfilContexto: "producto",
      requiereVision: false,
    },
  });

  assert.equal(generico.nivel, "media");
  assert.deepEqual(
    generico.alternativas.map((item) => item.referencia).sort(),
    ["AGILITY GRAND ADUL", "AGILITY PEQ ADUL"].sort()
  );
  assert.doesNotMatch(
    JSON.stringify(generico.alternativas),
    /GATO ESTERILIZADO|LATA|OBESOS/
  );
  assert.equal(grande.nivel, "alta");
  assert.equal(grande.coincidencia.referencia, "AGILITY GRAND ADUL");
});

test("texto usa una presentacion unica para subir confianza sin nombre literal", () => {
  const catalogoAgility = [
    {
      marca: "AGILITY",
      referencias: [
        {
          nombre: "AGILITY GRAN ADUL",
          especie: "perro",
          etapa: "adulto",
          metadata: {},
          presentaciones: [{ peso: "15kg", precio: 278900 }],
        },
        {
          nombre: "AGILITY PEQ ADUL",
          especie: "perro",
          etapa: "adulto",
          metadata: {},
          presentaciones: [{ peso: "7kg", precio: 147900 }],
        },
      ],
    },
  ];

  const validacion = validarCoincidenciaProducto({
    mensaje: "agility gold perro adulto 15kg",
    catalogo: catalogoAgility,
    catalogoCandidatos: catalogoAgility,
    clasificacion: {
      intencion: "precio",
      perfilContexto: "producto",
      requiereVision: false,
    },
  });

  assert.equal(validacion.nivel, "alta");
  assert.equal(validacion.coincidencia.referencia, "AGILITY GRAN ADUL");
  assert.equal(validacion.presentacionSolicitada, "15kg");
});

test("tolera un error de escritura cercano cuando la coincidencia es única", () => {
  const validacion = validarCoincidenciaProducto({
    mensaje: "tienes brabecto?",
    catalogo,
    catalogoCandidatos: [catalogo[5]],
    clasificacion: clasificacionTexto,
  });

  assert.equal(validacion.nivel, "alta");
  assert.equal(validacion.coincidencia.referencia, "BRAVECTO 10 A 20 KG");
});

test("la presentación desempata referencias similares existentes", () => {
  const catalogoSimilar = [
    {
      marca: "NUTRILINE",
      referencias: [
        {
          nombre: "NUTRILINE CAT URINARY",
          metadata: {},
          presentaciones: [{ peso: "3kg", precio: 150000 }],
        },
        {
          nombre: "NUTRILINE URINARY",
          metadata: {},
          presentaciones: [{ peso: "1.5kg", precio: 92000 }],
        },
      ],
    },
  ];
  const validacion = validarCoincidenciaProducto({
    mensaje: "precio nutriline urinary 1.5kg",
    catalogo: catalogoSimilar,
    catalogoCandidatos: catalogoSimilar,
    clasificacion: {
      ...clasificacionTexto,
      intencion: "precio",
    },
  });

  assert.equal(validacion.nivel, "alta");
  assert.equal(validacion.coincidencia.referencia, "NUTRILINE CAT URINARY");
  assert.equal(validacion.coincidencia.referenciaCatalogo, "NUTRILINE URINARY");
  assert.deepEqual(
    [...validacion.coincidencia.referenciasEquivalentes].sort(),
    ["NUTRILINE URINARY", "NUTRILINE CAT URINARY"].sort()
  );
  assert.equal(validacion.presentacionValida, true);
  const interpretacionValidada = aplicarCoincidenciaValidada(
    {
      producto: {
        marca: "NUTRILINE",
        referencia: "NUTRILINE URINARY",
      },
    },
    validacion
  );
  assert.equal(
    interpretacionValidada.producto.referencia,
    "NUTRILINE URINARY"
  );
});

test("sin presentación consolida nombres equivalentes como un solo producto", () => {
  const catalogoSimilar = [
    {
      marca: "NUTRILINE",
      referencias: [
        {
          nombre: "NUTRILINE CAT URINARY",
          metadata: {},
          presentaciones: [{ peso: "3kg", precio: 150000 }],
        },
        {
          nombre: "NUTRILINE URINARY",
          metadata: {},
          presentaciones: [{ peso: "1.5kg", precio: 92000 }],
        },
      ],
    },
  ];
  const validacion = validarCoincidenciaProducto({
    mensaje: "precio nutriline urinary",
    catalogo: catalogoSimilar,
    catalogoCandidatos: catalogoSimilar,
    clasificacion: {
      ...clasificacionTexto,
      intencion: "precio",
    },
  });
  assert.equal(validacion.nivel, "alta");
  assert.equal(validacion.alternativas.length, 1);
  assert.deepEqual(
    validacion.coincidencia.presentaciones.map((item) => item.peso).sort(),
    ["1.5kg", "3kg"]
  );

  const interpretacion = aplicarCoincidenciaValidada(
    {
      confianza: 0.96,
      intencion: "consulta_producto",
      accion: "consultar",
      producto: {
        marca: "NUTRILINE",
        referencia: "NUTRILINE URINARY",
        condiciones: ["urinario"],
      },
    },
    validacion
  );
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo(
    "precio nutriline urinary",
    estado,
    catalogoSimilar,
    interpretacion
  );

  assert.match(respuesta, /NUTRILINE CAT URINARY/i);
  assert.match(respuesta, /3kg: \$150\.000/i);
  assert.match(respuesta, /1\.5kg: \$92\.000/i);
  assert.equal(estado.productosConsultados.length, 2);
});

test("una consulta genérica de categoría no confirma una referencia específica", () => {
  const validacion = validarCoincidenciaProducto({
    mensaje: "tienes pastillas para pulgas y garrapatas?",
    catalogo,
    catalogoCandidatos: [catalogo[5]],
    clasificacion: clasificacionTexto,
  });

  assert.equal(validacion.nivel, "no_aplica");
  assert.equal(validacion.razon, "consulta_generica");
});

test("una consulta exploratoria por productos para garrapatas llega al motor de categorías", () => {
  const validacion = validarCoincidenciaProducto({
    mensaje: "Que productos tienes para garrapatas",
    catalogo,
    catalogoCandidatos: [catalogo[5]],
    clasificacion: clasificacionTexto,
  });

  assert.equal(validacion.nivel, "no_aplica");
  assert.equal(validacion.razon, "consulta_generica");
});

test("especie y etapa sin marca siguen siendo una búsqueda de categoría", () => {
  const validacion = validarCoincidenciaProducto({
    mensaje: "que comida tienes para perro adulto",
    catalogo,
    catalogoCandidatos: catalogo,
    clasificacion: clasificacionTexto,
  });

  assert.equal(validacion.nivel, "no_aplica");
  assert.equal(validacion.razon, "consulta_categoria");
});

test("la IA no convierte una consulta de categoría en una referencia específica", () => {
  const validacion = validarCoincidenciaProducto({
    mensaje: "Que productos tienes para garrapatas",
    interpretacion: {
      confianza: 0.99,
      producto: {
        marca: "MSD",
        referencia: "BRAVECTO 10 A 20 KG",
      },
    },
    catalogo,
    catalogoCandidatos: [catalogo[5]],
    clasificacion: clasificacionTexto,
  });

  assert.equal(validacion.nivel, "no_aplica");
  assert.equal(validacion.razon, "consulta_generica");
});

test("valida el producto interpretado desde una imagen contra catálogo", () => {
  const validacion = validarCoincidenciaProducto({
    mensaje: "El cliente envió una imagen",
    interpretacion: {
      confianza: 0.96,
      producto: {
        marca: "DOG CHOW",
        referencia: "ADULTOS RAZAS PEQUENAS",
      },
    },
    catalogo,
    catalogoCandidatos: [catalogo[4]],
    clasificacion: {
      intencion: "imagen",
      perfilContexto: "multimedia",
      requiereVision: true,
    },
  });

  assert.equal(validacion.nivel, "alta");
  assert.equal(validacion.usaInterpretacion, true);
});

test("vision combina linea especie y presentación para confirmar la referencia real", () => {
  const catalogoVision = [
    {
      marca: "NUTRILINE",
      referencias: [
        {
          nombre: "NUTRILINE CAT RENAL",
          especie: "gato",
          metadata: {},
          presentaciones: [{ peso: "1.5kg", precio: 108000 }],
        },
        {
          nombre: "NUTRILINE URINAY",
          especie: "gato",
          metadata: {},
          presentaciones: [{ peso: "1.5kg", precio: 108000 }],
        },
        {
          nombre: "NUTRILINE CAT URINARY",
          especie: "gato",
          metadata: {},
          presentaciones: [{ peso: "3kg", precio: 196000 }],
        },
      ],
    },
  ];
  const validacion = validarCoincidenciaProducto({
    mensaje: "El cliente envió una imagen. Qué costo tiene",
    interpretacion: {
      confianza: 0.96,
      producto: {
        marca: "NUTRILINE",
        referencia: "NUTRILINE CAT URINARY",
        especie: "gato",
        presentacion: "1.5kg",
        condiciones: ["urinario"],
      },
    },
    catalogo: catalogoVision,
    catalogoCandidatos: catalogoVision,
    clasificacion: {
      intencion: "imagen",
      perfilContexto: "multimedia",
      requiereVision: true,
    },
  });

  assert.equal(validacion.nivel, "alta");
  assert.equal(validacion.coincidencia.referencia, "NUTRILINE CAT URINARY");
  assert.equal(validacion.coincidencia.referenciaCatalogo, "NUTRILINE URINAY");
  assert.deepEqual(
    [...validacion.coincidencia.referenciasEquivalentes].sort(),
    ["NUTRILINE CAT URINARY", "NUTRILINE URINAY"].sort()
  );
  assert.doesNotMatch(
    JSON.stringify(validacion.alternativas),
    /NUTRILINE CAT RENAL/
  );
  assert.equal(validacion.presentacionValida, true);
  assert.equal(validacion.etiqueta, "nutriline cat urinary");
  assert.ok(validacion.diferencia >= 0.08);
});

test("vision mapea nombre comercial visible a la referencia interna equivalente", () => {
  const catalogoVision = [
    {
      marca: "ADVANCE",
      referencias: [
        {
          nombre: "ADVANCE CAT URINARY",
          especie: "gato",
          metadata: {},
          presentaciones: [{ peso: "3kg", precio: 196000 }],
        },
        {
          nombre: "ADVANCE URINAY",
          especie: "perro",
          metadata: {},
          presentaciones: [{ peso: "1.5kg", precio: 108000 }],
        },
        {
          nombre: "ADVANCE CAT RENAL",
          especie: "gato",
          metadata: {},
          presentaciones: [{ peso: "1.5kg", precio: 108000 }],
        },
      ],
    },
  ];
  const validacion = validarCoincidenciaProducto({
    mensaje: "El cliente envió una imagen. ¿Qué costo tiene?",
    interpretacion: {
      confianza: 0.95,
      producto: {
        marca: "ADVANCE",
        referencia: "ADVANCE VETERINARY DIETS URINARY GATO",
        presentacion: "1.5kr",
      },
    },
    catalogo: catalogoVision,
    catalogoCandidatos: catalogoVision,
    clasificacion: {
      intencion: "imagen",
      perfilContexto: "multimedia",
      requiereVision: true,
    },
  });

  assert.equal(validacion.nivel, "alta");
  assert.equal(validacion.coincidencia.referencia, "ADVANCE CAT URINARY");
  assert.equal(validacion.coincidencia.referenciaCatalogo, "ADVANCE URINAY");
  assert.equal(validacion.presentacionSolicitada, "1.5kg");
  assert.equal(validacion.presentacionValida, true);
  assert.deepEqual(
    [...validacion.coincidencia.referenciasEquivalentes].sort(),
    ["ADVANCE CAT URINARY", "ADVANCE URINAY"].sort()
  );
  assert.doesNotMatch(JSON.stringify(validacion.alternativas), /RENAL/);
});

test("vision tolera submarcas visibles que no existen literal en la marca interna", () => {
  const catalogoVision = [
    {
      marca: "AGILITY",
      referencias: [
        {
          nombre: "AGILITY GATO AD",
          especie: "gato",
          etapa: "adulto",
          metadata: {},
          presentaciones: [
            { peso: "1.5kg", precio: 54000 },
            { peso: "3kg", precio: 94000 },
          ],
        },
        {
          nombre: "AGILITY GATITO",
          especie: "gato",
          metadata: {},
          presentaciones: [{ peso: "1.5kg", precio: 56000 }],
        },
        {
          nombre: "AGILITY EN LATA PERRO",
          especie: "perro",
          metadata: {},
          presentaciones: [{ peso: "360gr", precio: 9000 }],
        },
      ],
    },
  ];
  const validacion = validarCoincidenciaProducto({
    mensaje: "El cliente envió una imagen. Precio",
    interpretacion: {
      confianza: 0.94,
      producto: {
        marca: "AGILITY GOLD",
        referencia: "AGILITY GOLD GATO ADULTO",
        presentacion: "1.5kg",
      },
    },
    catalogo: catalogoVision,
    catalogoCandidatos: catalogoVision,
    clasificacion: {
      intencion: "imagen",
      perfilContexto: "multimedia",
      requiereVision: true,
    },
  });

  assert.equal(validacion.nivel, "alta");
  assert.equal(validacion.coincidencia.marca, "AGILITY");
  assert.equal(validacion.coincidencia.referencia, "AGILITY GATO AD");
  assert.deepEqual(
    validacion.alternativas.map((item) => item.referencia),
    ["AGILITY GATO AD"]
  );
});

test("vision usa etapa tamano y peso para elegir solo la referencia compatible", () => {
  const catalogoVision = [
    {
      marca: "CHUNKY",
      referencias: [
        {
          nombre: "CHUNKY ADULTO",
          especie: "perro",
          etapa: "adulto",
          metadata: {},
          presentaciones: [{ peso: "1.5kg", precio: 18000 }],
        },
        {
          nombre: "CHUNKY ADULTO RP",
          especie: "perro",
          etapa: "adulto",
          metadata: {},
          presentaciones: [{ peso: "1.5kg", precio: 16900 }],
        },
        {
          nombre: "CHUNKY ADULTOS MAYORES",
          especie: "perro",
          etapa: "adulto",
          metadata: {},
          presentaciones: [{ peso: "1.5kg", precio: 26200 }],
        },
        {
          nombre: "CHUNKY CACH RP",
          especie: "perro",
          metadata: {},
          presentaciones: [{ peso: "1.5kg", precio: 20300 }],
        },
      ],
    },
  ];
  const validacion = validarCoincidenciaProducto({
    mensaje: "El cliente envió una imagen. ¿Qué precio tiene?",
    interpretacion: {
      confianza: 0.78,
      producto: {
        marca: "CHUNKY",
        referencia: null,
        especie: "perro",
        etapa: "adulto",
        tamano: "pequeno",
        presentacion: "1.5kg",
      },
    },
    catalogo: catalogoVision,
    catalogoCandidatos: catalogoVision,
    clasificacion: {
      intencion: "imagen",
      perfilContexto: "multimedia",
      requiereVision: true,
    },
  });

  assert.equal(validacion.nivel, "alta");
  assert.equal(validacion.razon, "senales_visuales_convergentes");
  assert.equal(validacion.coincidencia.referencia, "CHUNKY ADULTO RP");
  assert.deepEqual(
    validacion.alternativas.map((item) => item.referencia),
    ["CHUNKY ADULTO RP"]
  );
});

test("vision no confirma una referencia cuando solo reconoce la marca", () => {
  const catalogoVision = [
    {
      marca: "MARCA DEMO",
      referencias: [
        {
          nombre: "ADULTO",
          metadata: {},
          presentaciones: [{ peso: "2kg", precio: 20000 }],
        },
        {
          nombre: "CACHORRO",
          metadata: {},
          presentaciones: [{ peso: "2kg", precio: 22000 }],
        },
      ],
    },
  ];
  const validacion = validarCoincidenciaProducto({
    mensaje: "El cliente envió una imagen",
    interpretacion: {
      confianza: 0.95,
      producto: {
        marca: "MARCA DEMO",
        referencia: null,
      },
    },
    catalogo: catalogoVision,
    catalogoCandidatos: catalogoVision,
    clasificacion: {
      intencion: "imagen",
      perfilContexto: "multimedia",
      requiereVision: true,
    },
  });

  assert.notEqual(validacion.nivel, "alta");
  assert.equal(validacion.coincidencia, null);
});

test("agrupa equivalentes de cualquier marca y excluye líneas terapéuticas distintas", () => {
  const catalogoGenerico = [
    {
      marca: "VETLIFE",
      referencias: [
        {
          nombre: "VETLIFE DOG GASTROINTESTINAL",
          metadata: {},
          presentaciones: [{ peso: "2kg", precio: 87000 }],
        },
        {
          nombre: "VETLIFE GASTRO",
          metadata: {},
          presentaciones: [{ peso: "7.5kg", precio: 240000 }],
        },
        {
          nombre: "VETLIFE DOG RENAL",
          metadata: {},
          presentaciones: [{ peso: "2kg", precio: 91000 }],
        },
      ],
    },
  ];
  const validacion = validarCoincidenciaProducto({
    mensaje: "El cliente envió una imagen. ¿Cuánto cuesta?",
    interpretacion: {
      confianza: 0.96,
      producto: {
        marca: "VETLIFE",
        referencia: "VETLIFE DOG GASTROINTESTINAL",
        especie: "perro",
        condiciones: ["gastrointestinal"],
      },
    },
    catalogo: catalogoGenerico,
    catalogoCandidatos: catalogoGenerico,
    clasificacion: {
      intencion: "imagen",
      perfilContexto: "multimedia",
      requiereVision: true,
    },
  });

  assert.equal(validacion.nivel, "alta");
  assert.deepEqual(validacion.coincidencia.referenciasEquivalentes, [
    "VETLIFE DOG GASTROINTESTINAL",
    "VETLIFE GASTRO",
  ]);
  assert.doesNotMatch(JSON.stringify(validacion), /VETLIFE DOG RENAL/);
});

test("la respuesta ambigua es natural y no usa instrucciones numeradas", () => {
  const respuesta = respuestaValidacionProducto({
    nivel: "media",
    etiqueta: "nutriline urinary",
    diferencia: 0,
    usaInterpretacion: true,
    alternativas: [
      {
        marca: "NUTRILINE",
        referencia: "NUTRILINE URINARY",
        presentaciones: [{ peso: "1.5kg", precio: 92000 }],
      },
      {
        marca: "NUTRILINE",
        referencia: "NUTRILINE CAT URINARY",
        presentaciones: [{ peso: "3kg", precio: 150000 }],
      },
    ],
  });

  assert.match(respuesta, /Veo estas referencias muy parecidas/i);
  assert.match(
    respuesta,
    /¿Buscas NUTRILINE URINARY o NUTRILINE CAT URINARY\?/i
  );
  assert.doesNotMatch(
    respuesta,
    /Revisando la foto|¿Es esa\?|No encontré una coincidencia exacta|posibles coincidencias|responder con el nombre o el número|^\d+\./im
  );
});

test("rechaza un producto interpretado desde imagen que no existe", () => {
  const validacion = validarCoincidenciaProducto({
    mensaje: "El cliente envió una imagen",
    interpretacion: {
      confianza: 0.99,
      producto: {
        marca: "BR",
        referencia: "ADULTO RAZA PEQUENA",
      },
    },
    catalogo,
    catalogoCandidatos: catalogo.slice(0, 2),
    clasificacion: {
      intencion: "imagen",
      perfilContexto: "multimedia",
      requiereVision: true,
    },
  });

  assert.equal(validacion.nivel, "baja");
});

test("valida una imagen que devuelve un arreglo con un solo producto", () => {
  const validacion = validarCoincidenciaProducto({
    mensaje: "El cliente envió una imagen",
    interpretacion: {
      confianza: 0.96,
      productos: [
        {
          marca: "DOG CHOW",
          referencia: "ADULTOS RAZAS PEQUENAS",
        },
      ],
    },
    catalogo,
    catalogoCandidatos: [catalogo[4]],
    clasificacion: {
      intencion: "imagen",
      perfilContexto: "multimedia",
      requiereVision: true,
    },
  });

  assert.equal(validacion.nivel, "alta");
});

test("aplica la misma validación al texto transcrito de un audio", () => {
  const validacion = validarCoincidenciaProducto({
    mensaje: "tienen br adulto raza pequena",
    catalogo,
    catalogoCandidatos: catalogo.slice(0, 4),
    clasificacion: {
      intencion: "audio",
      perfilContexto: "multimedia",
      requiereVision: false,
    },
  });

  assert.equal(validacion.nivel, "baja");
});

test("traduce RP y errores de pequenas para validar la referencia especifica", () => {
  const catalogoChunky = [
    {
      marca: "CHUNKY",
      referencias: [
        {
          nombre: "CHUNKY ADULTO",
          especie: "perro",
          categoria: "comida",
          subcategoria: "concentrado",
          etapa: "adulto",
          descripcion: "CHUNKY ADULTO",
          metadata: { original_names: ["CHUNKY ADULTO X 2 KL"] },
          presentaciones: [{ peso: "x 2 kg", precio: 18900 }],
        },
        {
          nombre: "CHUNKY ADULTO RP",
          especie: "perro",
          categoria: "comida",
          subcategoria: "concentrado",
          etapa: "adulto",
          descripcion: "CHUNKY ADULTO RP",
          metadata: {
            original_names: ["CHUNKY ADULTO RP X 1.5 KL"],
          },
          presentaciones: [{ peso: "x 1.5 kg", precio: 16900 }],
        },
      ],
    },
  ];
  const validacion = validarCoincidenciaProducto({
    mensaje: "chunky adultos razas pquenas",
    catalogo: catalogoChunky,
    catalogoCandidatos: catalogoChunky,
    clasificacion: clasificacionTexto,
  });

  assert.equal(validacion.nivel, "alta");
  assert.equal(validacion.coincidencia.referencia, "CHUNKY ADULTO RP");
});

test("valida una búsqueda nueva aunque ya exista un pedido activo", () => {
  const validacion = validarCoincidenciaProducto({
    mensaje: "agrega br adulto raza pequena",
    catalogo,
    catalogoCandidatos: catalogo.slice(0, 4),
    clasificacion: {
      intencion: "busqueda_producto",
      perfilContexto: "pedido",
      requiereVision: false,
    },
  });

  assert.equal(validacion.nivel, "baja");
});

test("solo corrige la referencia interpretada cuando se validó una referencia", () => {
  const interpretacion = {
    producto: {
      marca: "Brabecto",
      referencia: "10-20",
      presentacion: "unidad",
    },
  };
  const resultado = aplicarCoincidenciaValidada(interpretacion, {
    nivel: "alta",
    coincidencia: {
      marca: "MSD",
      referencia: "BRAVECTO 10 A 20 KG",
      tipoCoincidencia: "referencia",
    },
  });

  assert.equal(resultado.producto.marca, "MSD");
  assert.equal(resultado.producto.referencia, "BRAVECTO 10 A 20 KG");
  assert.equal(resultado.producto.presentacion, "unidad");
});

const catalogoArenasSimilares = [
  {
    marca: "ARENA",
    referencias: [
      {
        nombre: "ARENA FOFICAT",
        especie: "gato",
        categoria: "arena_sustrato",
        subcategoria: "arena",
        metadata: {},
        presentaciones: [{ peso: "5kg", precio: 19000 }],
      },
    ],
  },
  {
    marca: "ARENA FOFICAT TOFU",
    referencias: [
      {
        nombre: "ARENA FOFICAT TOFU",
        especie: "gato",
        categoria: "arena_sustrato",
        subcategoria: "arena",
        metadata: {},
        presentaciones: [{ peso: "2.5kg", precio: 25900 }],
      },
    ],
  },
  {
    marca: "CAT",
    referencias: [
      {
        nombre: "CAT BALANCE",
        especie: "gato",
        categoria: "medicamento",
        metadata: {},
        presentaciones: [{ peso: "unidad", precio: 1000 }],
      },
    ],
  },
];

test("une palabras separadas y tolera orden distinto al buscar en todo el catalogo", () => {
  for (const mensaje of ["fofi cat tofu", "arena tofu fofi", "tofu cat"]) {
    const validacion = validarCoincidenciaProducto({
      mensaje,
      catalogo: catalogoArenasSimilares,
      catalogoCandidatos: [],
      clasificacion: clasificacionTexto,
    });

    assert.equal(validacion.nivel, "alta", mensaje);
    assert.equal(validacion.coincidencia.referencia, "ARENA FOFICAT TOFU");
    assert.notEqual(validacion.coincidencia.referencia, "CAT BALANCE");
  }
});

test("corrige un error de OCR usando nombre categoria especie y presentacion", () => {
  const validacion = validarCoincidenciaProducto({
    mensaje: "Que costo tiene",
    catalogo: catalogoArenasSimilares,
    catalogoCandidatos: [],
    clasificacion: {
      intencion: "imagen",
      perfilContexto: "multimedia",
      requiereVision: true,
    },
    interpretacion: {
      intencion: "consulta_producto",
      accion: "consultar",
      confianza: 0.8,
      producto: {
        marca: null,
        referencia: "FOEI CAT TOFU",
        categoria: "arena_sustrato",
        especie: "gato",
        presentacion: "2.5kg",
      },
    },
  });

  assert.equal(validacion.nivel, "alta");
  assert.equal(validacion.coincidencia.referencia, "ARENA FOFICAT TOFU");
});

test("una correccion corta completa señales del intento anterior sin conservar la hipotesis equivocada", () => {
  const contextoProducto = {
    terminos: ["foei", "cat", "tofu"],
    etiqueta: "foei cat tofu",
    fuente: "imagen",
    creadoEn: new Date().toISOString(),
  };
  const validacion = validarCoincidenciaProducto({
    mensaje: "no, es arena foffi",
    contextoProducto,
    catalogo: catalogoArenasSimilares,
    catalogoCandidatos: [],
    clasificacion: clasificacionTexto,
  });

  assert.equal(validacion.nivel, "alta");
  assert.equal(validacion.coincidencia.referencia, "ARENA FOFICAT TOFU");
  assert.equal(
    construirConsultaProductoContextual("no, es dog chow", contextoProducto),
    "dog chow"
  );
});

test("una marca corta solo limita el catalogo cuando completa una referencia real", () => {
  const productoCompuesto = validarCoincidenciaProducto({
    mensaje: "fofi cat tofu",
    catalogo: catalogoArenasSimilares,
    catalogoCandidatos: [],
    clasificacion: clasificacionTexto,
  });
  const referenciaCat = validarCoincidenciaProducto({
    mensaje: "cat balance",
    catalogo: catalogoArenasSimilares,
    catalogoCandidatos: [],
    clasificacion: clasificacionTexto,
  });

  assert.equal(productoCompuesto.coincidencia.referencia, "ARENA FOFICAT TOFU");
  assert.equal(referenciaCat.nivel, "alta");
  assert.equal(referenciaCat.coincidencia.referencia, "CAT BALANCE");
});
