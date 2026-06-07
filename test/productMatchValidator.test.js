const assert = require("node:assert/strict");
const test = require("node:test");

const {
  aplicarCoincidenciaValidada,
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
  assert.deepEqual(validacion.terminos, ["br", "adulto", "perro", "pequena"]);
  const respuesta = respuestaValidacionProducto(validacion);
  assert.match(respuesta, /no encuentro BR ADULTO PEQUENA en el catálogo actual/i);
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
  assert.deepEqual(validacion.coincidencia.referenciasEquivalentes, [
    "NUTRILINE URINARY",
    "NUTRILINE CAT URINARY",
  ]);
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

  assert.match(respuesta, /Revisando la foto/i);
  assert.match(
    respuesta,
    /¿Te refieres a NUTRILINE URINARY o a NUTRILINE CAT URINARY\?/i
  );
  assert.doesNotMatch(
    respuesta,
    /No encontré una coincidencia exacta|posibles coincidencias|responder con el nombre o el número|^\d+\./im
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
