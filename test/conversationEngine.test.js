const test = require("node:test");
const assert = require("node:assert/strict");

const { resolverConsultaCatalogo, extraerPresupuesto, buscarMarca } = require("../src/verticals/petshop/orderLogic");
const { crearEstadoInicial } = require("../src/conversation/conversationStore");
const { asegurarRespuestaCatalogo } = require("../src/verticals/petshop/productLogic");
const { cargarProductosDesdeJson } = require("../src/repositories/productRepository");

const catalogoConversacionalPruebas = [
  {
    marca: "Dog Chow",
    referencias: [
      {
        nombre: "Adulto Mini y Pequeño",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "adulto",
        tamano: "pequeno",
        descripcion: "Alimento para perros adultos de razas mini y pequeñas",
        presentaciones: [
          { peso: "1kg", precio: 19000, stock: true, metadata: {} },
          { peso: "2kg", precio: 36000, stock: true, metadata: {} },
          { peso: "4kg", precio: 68000, stock: true, metadata: {} },
        ],
      },
      {
        nombre: "Adulto Mediano y Grande",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "adulto",
        tamano: "grande",
        descripcion: "Alimento para perros adultos medianos y grandes",
        presentaciones: [
          { peso: "1kg", precio: 20000, stock: true, metadata: {} },
          { peso: "2kg", precio: 38000, stock: true, metadata: {} },
        ],
      },
      {
        nombre: "Cachorros Mini y Pequeño",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "cachorro",
        tamano: "pequeno",
        descripcion: "Alimento para cachorros de razas mini y pequeñas",
        presentaciones: [{ peso: "2kg", precio: 42000, stock: true, metadata: {} }],
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
        etapa: "adulto",
        tamano: "todas",
        descripcion: "Alimento para perros adultos de todas las razas",
        presentaciones: [{ peso: "2kg", precio: 32000, stock: true, metadata: {} }],
      },
      {
        nombre: "Adulto Razas Pequeñas",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "adulto",
        tamano: "pequeno",
        descripcion: "Alimento para perros adultos de razas pequeñas",
        presentaciones: [{ peso: "2kg", precio: 21000, stock: true, metadata: {} }],
      },
    ],
  },
  {
    marca: "Mirringo",
    referencias: [
      {
        nombre: "Gato Adulto",
        especie: "gato",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "adulto",
        tamano: "todas",
        descripcion: "Alimento para gatos adultos",
        presentaciones: [{ peso: "1kg", precio: 18000, stock: true, metadata: {} }],
      },
    ],
  },
  {
    marca: "Arena",
    referencias: [
      {
        nombre: "Arena Michiko Lavanda",
        especie: "gato",
        categoria: "arena_sustrato",
        subcategoria: "arena",
        descripcion: "Arena sanitaria con aroma lavanda",
        presentaciones: [
          { peso: "4kg", precio: 24000, stock: true, metadata: {} },
          { peso: "10kg", precio: 52000, stock: true, metadata: {} },
        ],
      },
      {
        nombre: "Arena Michiko Bebe",
        especie: "gato",
        categoria: "arena_sustrato",
        subcategoria: "arena",
        descripcion: "Arena sanitaria aroma bebe",
        presentaciones: [{ peso: "4kg", precio: 24000, stock: true, metadata: {} }],
      },
      {
        nombre: "Arena Aglomerante Premium",
        especie: "gato",
        categoria: "arena_sustrato",
        subcategoria: "arena",
        descripcion: "Arena aglomerante para gatos",
        presentaciones: [{ peso: "5kg", precio: 28000, stock: true, metadata: {} }],
      },
    ],
  },
];

function cargarCatalogoPruebas() {
  return JSON.parse(JSON.stringify(catalogoConversacionalPruebas));
}

const catalogoPetshopExtendido = [
  {
    marca: "BR",
    referencias: [
      {
        nombre: "BR CAT ADUL POLLO",
        especie: "gato",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "adulto",
        descripcion: "Alimento para gatos adultos sabor pollo",
        presentaciones: [{ peso: "1kg", precio: 28000, stock: true, metadata: {} }],
      },
    ],
  },
  {
    marca: "Boehringer",
    referencias: [
      {
        nombre: "NexGard",
        especie: "perro",
        categoria: "medicamento",
        subcategoria: "antipulgas",
        etapa: "todas",
        requiereConfirmacion: true,
        descripcion: "Tableta antipulgas para perros",
        metadata: { observaciones: "Confirmar peso" },
        presentaciones: [{ peso: "10 a 25 kg", precio: 85000, stock: true, metadata: {} }],
      },
    ],
  },
  {
    marca: "Bayer",
    referencias: [
      {
        nombre: "Drontal Gatos",
        especie: "gato",
        categoria: "medicamento",
        subcategoria: "desparasitante",
        requiereConfirmacion: true,
        descripcion: "Desparasitante para gatos",
        presentaciones: [{ peso: "unidad", precio: 18000, stock: true, metadata: {} }],
      },
    ],
  },
  {
    marca: "Frontline",
    referencias: [
      {
        nombre: "Frontline Gato",
        especie: "gato",
        categoria: "medicamento",
        subcategoria: "antipulgas",
        requiereConfirmacion: true,
        descripcion: "Antipulgas y garrapatas para gatos",
        presentaciones: [{ peso: "unidad", precio: 43000, stock: true, metadata: {} }],
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
        etapa: "adulto",
        descripcion: "Alimento completo para perros adultos",
        presentaciones: [{ peso: "2kg", precio: 32000, stock: true, metadata: {} }],
      },
    ],
  },
  {
    marca: "Churu",
    referencias: [
      {
        nombre: "Churu Gato Pollo",
        especie: "gato",
        categoria: "snack",
        subcategoria: "snack",
        descripcion: "Snack para gatos",
        presentaciones: [{ peso: "unidad", precio: 6500, stock: true, metadata: {} }],
      },
    ],
  },
  {
    marca: "Arena Max",
    referencias: [
      {
        nombre: "Arena Max Gato",
        especie: "gato",
        categoria: "arena_sustrato",
        subcategoria: "arena",
        descripcion: "Arena sanitaria para gatos",
        presentaciones: [{ peso: "4kg", precio: 28000, stock: true, metadata: {} }],
      },
    ],
  },
  {
    marca: "Kong",
    referencias: [
      {
        nombre: "Classic",
        especie: "perro",
        categoria: "accesorio",
        subcategoria: "juguete",
        etapa: "todas",
        descripcion: "Juguete resistente para perros",
        presentaciones: [{ peso: "M", precio: 45000, stock: true, metadata: {} }],
      },
    ],
  },
];

const catalogoConMarcaBaseYFamilia = [
  {
    marca: "BR",
    referencias: [
      {
        nombre: "BR CORDERO",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "adulto",
        descripcion: "Alimento para perros adultos",
        presentaciones: [{ peso: "3kg", precio: 78000, stock: true, metadata: {} }],
      },
    ],
  },
  {
    marca: "BR CAT",
    referencias: [
      {
        nombre: "BR CAT ADUL POLLO",
        especie: "gato",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "adulto",
        presentaciones: [{ peso: "3kg", precio: 81700, stock: true, metadata: {} }],
      },
      {
        nombre: "BR CAT CASTRADO POLLO",
        especie: "gato",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "adulto",
        presentaciones: [{ peso: "3kg", precio: 81900, stock: true, metadata: {} }],
      },
      {
        nombre: "BR CAT GATITO POLLO",
        especie: "gato",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "cachorro",
        presentaciones: [{ peso: "3kg", precio: 81900, stock: true, metadata: {} }],
      },
    ],
  },
  {
    marca: "BOLSA",
    referencias: [
      {
        nombre: "BOLSA POPIS",
        especie: "perro",
        categoria: "higiene",
        descripcion: "Bolsas sanitarias",
        presentaciones: [{ peso: "unidad", precio: 5000, stock: true, metadata: {} }],
      },
    ],
  },
];

const catalogoDogChowSimilitud = [
  {
    marca: "DOG CHOW",
    referencias: [
      {
        nombre: "DOG CHOW",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        descripcion: "Referencia generica promocional",
        presentaciones: [{ peso: "x100", precio: 13500, stock: true, metadata: {} }],
      },
      {
        nombre: "DOG CHOW A.R.P A GRANEL",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        descripcion: "Adulto raza pequena a granel",
        presentaciones: [{ peso: "unidad", precio: 10400, stock: true, metadata: {} }],
      },
      {
        nombre: "DOG CHOW ADUL TODOS LOS TAMAÑOS",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "adulto",
        descripcion: "Adulto todos los tamanos",
        presentaciones: [
          { peso: "1kg", precio: 12900, stock: true, metadata: {} },
          { peso: "2kg", precio: 23000, stock: true, metadata: {} },
          { peso: "4kg", precio: 45600, stock: true, metadata: {} },
        ],
      },
      {
        nombre: "DOG CHOW ADUL TODOS LOS TAMAÑOS 475",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "adulto",
        descripcion: "Adulto todos los tamanos 475",
        presentaciones: [{ peso: "unidad", precio: 5400, stock: true, metadata: {} }],
      },
    ],
  },
];

const catalogoProPlanBilingue = [
  {
    marca: "PRO PLAN",
    referencias: [
      {
        nombre: "PRO PLAN ADULT SMALL",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "adulto",
        presentaciones: [{ peso: "1kg", precio: 57000, stock: true, metadata: {} }],
      },
      {
        nombre: "PRO PLAN CANINE LATA OM",
        especie: "perro",
        categoria: "comida",
        subcategoria: "comida_humeda",
        presentaciones: [{ peso: "unidad", precio: 28600, stock: true, metadata: {} }],
      },
      {
        nombre: "PRO PLAN CANINE OM",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        presentaciones: [
          { peso: "2kg", precio: 122000, stock: true, metadata: {} },
          { peso: "18lb", precio: 359800, stock: true, metadata: {} },
        ],
      },
      {
        nombre: "PRO PLAN FELINE OM",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        presentaciones: [{ peso: "1.5kg", precio: 113600, stock: true, metadata: {} }],
      },
    ],
  },
];

const catalogoChunkyImportado = [
  {
    marca: "CHUNKY",
    referencias: [
      {
        nombre: "CHUNKY ADULTO",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "adulto",
        tamano: "todas",
        presentaciones: [
          { peso: "x 2 kg", precio: 18900, stock: true, metadata: {} },
          { peso: "x 4 kg", precio: 37000, stock: true, metadata: {} },
          { peso: "x 9 kg", precio: 74200, stock: true, metadata: {} },
        ],
      },
      {
        nombre: "CHUNKY ADULTO RP",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "adulto",
        presentaciones: [
          { peso: "x 1.5 kg", precio: 16900, stock: true, metadata: {} },
          { peso: "x 4 kg", precio: 37200, stock: true, metadata: {} },
          { peso: "x 500", precio: 5200, stock: true, metadata: {} },
          { peso: "x 8 kg", precio: 67600, stock: true, metadata: {} },
        ],
      },
    ],
  },
];

test("niega una presentacion inexistente aunque la referencia este ambigua", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  const mensaje = "necesito un domicilio para car 10 17.28 de un bulto de dog chow razas pequeñas x 8 kilos";

  const respuesta = resolverConsultaCatalogo(mensaje, estado, catalogo, null);

  assert.match(respuesta, /no tengo presentación de 8kg/i);
  assert.match(respuesta, /Adulto Mini y Pequeño/i);
  assert.match(respuesta, /Cachorros Mini y Pequeño/i);
  assert.equal(estado.carrito.length, 0);
});

test("entiende condiciones del producto y refina una marca base sin pedir confirmacion innecesaria", () => {
  const estado = crearEstadoInicial();
  const mensaje = "Una bolsa de cuido de BR 3 kl para gato castrado pollo";

  const respuesta = resolverConsultaCatalogo(mensaje, estado, catalogoConMarcaBaseYFamilia, null);

  assert.match(respuesta, /BR CAT CASTRADO POLLO 3kg/i);
  assert.match(respuesta, /\$81\.900/i);
  assert.doesNotMatch(respuesta, /BR CAT ADUL POLLO/i);
  assert.doesNotMatch(respuesta, /BR CAT GATITO POLLO/i);
  assert.doesNotMatch(respuesta, /cu[aá]l referencia/i);
  assert.equal(estado.carrito[0].marca, "BR CAT");
  assert.equal(estado.carrito[0].referencia, "BR CAT CASTRADO POLLO");
});

test("no confunde bolsa como empaque generico con la marca bolsa cuando el producto si la menciona", () => {
  const estado = crearEstadoInicial();

  const respuesta = resolverConsultaCatalogo("necesito bolsa popis unidad", estado, catalogoConMarcaBaseYFamilia, null);

  assert.match(respuesta, /BOLSA POPIS unidad/i);
  assert.equal(estado.carrito[0].marca, "BOLSA");
  assert.equal(estado.carrito[0].referencia, "BOLSA POPIS");
});

test("muestra alternativas cercanas cuando la referencia exacta no tiene la presentacion pedida", () => {
  const estado = crearEstadoInicial();

  const respuesta = resolverConsultaCatalogo(
    "dog chow adultos razas pequenas 2kg",
    estado,
    catalogoDogChowSimilitud,
    null
  );

  assert.match(respuesta, /DOG CHOW A\.R\.P A GRANEL no tengo presentación de 2kg/i);
  assert.match(respuesta, /referencias cercanas/i);
  assert.match(respuesta, /DOG CHOW ADUL TODOS LOS TAMAÑOS 2kg: \$23\.000/i);
  assert.doesNotMatch(respuesta, /DOG CHOW DOG CHOW/i);
});

test("una consulta explícita cambia de referencia similar y respeta su presentación", () => {
  const estado = crearEstadoInicial();
  const catalogoSimilar = [
    {
      marca: "NUTRILINE",
      referencias: [
        {
          nombre: "NUTRILINE CAT URINARY",
          especie: "gato",
          categoria: "comida",
          subcategoria: "concentrado",
          presentaciones: [{ peso: "3kg", precio: 150000, stock: true }],
        },
        {
          nombre: "NUTRILINE URINARY",
          especie: "perro",
          categoria: "comida",
          subcategoria: "concentrado",
          presentaciones: [{ peso: "1.5kg", precio: 92000, stock: true }],
        },
      ],
    },
  ];
  estado.marca = "NUTRILINE";
  estado.criterios = { especie: "gato" };
  estado.ultimaSeleccion = {
    marca: "NUTRILINE",
    referencia: "NUTRILINE CAT URINARY",
    presentacion: null,
    cantidad: 1,
  };

  const respuesta = resolverConsultaCatalogo(
    "qué precio tiene nutriline urinary 1.5kg",
    estado,
    catalogoSimilar,
    null
  );

  assert.match(respuesta, /NUTRILINE URINARY 1\.5kg: \$92\.000/i);
  assert.doesNotMatch(respuesta, /CAT URINARY/);
});

test("el texto actual gana aunque la IA arrastre una referencia similar anterior", () => {
  const estado = crearEstadoInicial();
  const catalogoSimilar = [
    {
      marca: "NUTRILINE",
      referencias: [
        {
          nombre: "NUTRILINE CAT URINARY",
          especie: "gato",
          categoria: "comida",
          subcategoria: "concentrado",
          presentaciones: [{ peso: "3kg", precio: 150000, stock: true }],
        },
        {
          nombre: "NUTRILINE URINARY",
          especie: "perro",
          categoria: "comida",
          subcategoria: "concentrado",
          presentaciones: [{ peso: "1.5kg", precio: 92000, stock: true }],
        },
      ],
    },
  ];
  estado.marca = "NUTRILINE";
  estado.criterios = { especie: "gato" };
  const interpretacionAnterior = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.95,
    producto: {
      marca: "NUTRILINE",
      referencia: "NUTRILINE CAT URINARY",
      especie: "gato",
      presentacion: "1.5kg",
      sabores: [],
      condiciones: ["urinario"],
    },
    productos: [],
  };

  const respuesta = resolverConsultaCatalogo(
    "qué precio tiene nutriline urinary 1.5kg",
    estado,
    catalogoSimilar,
    interpretacionAnterior
  );

  assert.match(respuesta, /NUTRILINE URINARY 1\.5kg: \$92\.000/i);
  assert.doesNotMatch(respuesta, /CAT URINARY/);
});

test("prioriza la referencia de todos los tamanos sobre una referencia generica interpretada por IA", () => {
  const estado = crearEstadoInicial();
  const interpretacionIA = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.92,
    producto: {
      marca: "DOG CHOW",
      referencia: "DOG CHOW",
      especie: "perro",
      etapa: "adulto",
      tamano: "todas",
      presentacion: null,
      sabores: [],
      condiciones: [],
    },
    productos: [],
  };

  const respuesta = resolverConsultaCatalogo(
    "dog chow adultos todos los tamaños",
    estado,
    catalogoDogChowSimilitud,
    interpretacionIA
  );

  assert.match(respuesta, /DOG CHOW ADUL TODOS LOS TAMAÑOS/i);
  assert.match(respuesta, /2kg: \$23\.000/i);
  assert.doesNotMatch(respuesta, /x100: \$13\.500/i);
  assert.doesNotMatch(respuesta, /cu[aá]l de estas opciones/i);
});

test("filtra por siglas terapeuticas y muestra precios sin caer en referencia generica", () => {
  const estado = crearEstadoInicial();

  const respuesta = resolverConsultaCatalogo("que precio tiene pro plan om?", estado, catalogoProPlanBilingue, null);

  assert.match(respuesta, /PRO PLAN CANINE OM 2kg: \$122\.000/i);
  assert.match(respuesta, /PRO PLAN FELINE OM 1\.5kg: \$113\.600/i);
  assert.match(respuesta, /PRO PLAN CANINE LATA OM unidad: \$28\.600/i);
  assert.doesNotMatch(respuesta, /PRO PLAN ADULT SMALL/i);
});

test("mapea una imagen con OM y perro a canine om aunque la referencia interpretada venga incompleta", () => {
  const estado = crearEstadoInicial();
  const interpretacionIA = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.95,
    producto: {
      marca: "PRO PLAN",
      referencia: "PRO PLAN OM",
      especie: "perro",
      categoria: "comida",
      subcategoria: "concentrado",
      presentacion: null,
      sabores: [],
      condiciones: [],
    },
    productos: [],
  };

  const respuesta = resolverConsultaCatalogo("manejan este que busco", estado, catalogoProPlanBilingue, interpretacionIA);

  assert.match(respuesta, /PRO PLAN CANINE OM/i);
  assert.match(respuesta, /2kg: \$122\.000/i);
  assert.doesNotMatch(respuesta, /PRO PLAN ADULT SMALL/i);
  assert.doesNotMatch(respuesta, /PRO PLAN CANINE LATA OM/i);
});

test("no descarta una referencia exacta de imagen por tamano generico todas", () => {
  const estado = crearEstadoInicial();
  const interpretacionIA = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.98,
    producto: {
      marca: "PRO PLAN",
      referencia: "PRO PLAN CANINE OM",
      especie: "perro",
      categoria: "comida",
      subcategoria: "concentrado",
      etapa: "todas",
      tamano: "todas",
      presentacion: "2kg",
      sabores: [],
      condiciones: [],
    },
    productos: [],
  };

  const respuesta = resolverConsultaCatalogo("Que costo tiene", estado, catalogoProPlanBilingue, interpretacionIA);

  assert.match(respuesta, /PRO PLAN CANINE OM 2kg: \$122\.000/i);
  assert.doesNotMatch(respuesta, /no tengo una referencia exacta/i);
  assert.doesNotMatch(respuesta, /Lo que sí tengo para perros/i);
  assert.equal(estado.productosConsultados[0].referencia, "PRO PLAN CANINE OM");
  assert.equal(estado.productosConsultados[0].peso, "2kg");
});

test("una referencia exacta del catalogo gana sobre criterios visuales incompatibles", () => {
  const estado = crearEstadoInicial();
  const interpretacionIA = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.96,
    producto: {
      marca: "PRO PLAN",
      referencia: "PRO PLAN CANINE OM",
      especie: "gato",
      categoria: "comida",
      subcategoria: "concentrado",
      etapa: "todas",
      tamano: "todas",
      presentacion: "2kg",
      sabores: [],
      condiciones: [],
    },
    productos: [],
  };

  const respuesta = resolverConsultaCatalogo("Que costo tiene", estado, catalogoProPlanBilingue, interpretacionIA);

  assert.match(respuesta, /PRO PLAN CANINE OM 2kg: \$122\.000/i);
  assert.doesNotMatch(respuesta, /no tengo una referencia exacta/i);
  assert.equal(estado.productosConsultados[0].referencia, "PRO PLAN CANINE OM");
});

test("usa feline del nombre como especie aunque el campo del catalogo venga incorrecto", () => {
  const estado = crearEstadoInicial();

  const respuesta = resolverConsultaCatalogo("que precio tiene pro plan feline om?", estado, catalogoProPlanBilingue, null);

  assert.match(respuesta, /PRO PLAN FELINE OM/i);
  assert.match(respuesta, /1\.5kg: \$113\.600/i);
  assert.doesNotMatch(respuesta, /PRO PLAN CANINE OM/i);
});

test("niega una presentacion inexistente cuando la IA detecta la referencia exacta", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  const mensaje = "necesito un domicilio para car 10 17.28 de un bulto de dog chow razas pequeñas x 8 kilos";
  const interpretacionIA = {
    intencion: "pedido_producto",
    accion: "consultar",
    confianza: 0.95,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion: "8kg",
      cantidad: 1,
    },
    entrega: {
      tipo: "domicilio",
      direccion: "car 10 17.28",
      direccionCompleta: true,
      sector: null,
      metodoPago: null,
      sede: null,
    },
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: "presentacion",
  };

  const respuesta = resolverConsultaCatalogo(mensaje, estado, catalogo, interpretacionIA);

  assert.match(respuesta, /no tengo presentación de 8kg/i);
  assert.match(respuesta, /- 4kg: \$68\.000/i);
  assert.equal(estado.carrito.length, 0);
});

test("bloquea una respuesta humanizada que afirma agregar una presentacion inexistente", () => {
  const catalogo = cargarCatalogoPruebas();
  const mensaje = "necesito un domicilio para car 10 17.28 de un bulto de dog chow razas pequeñas x 8 kilos";
  const respuestaHumanizada =
    "Perfecto, ya dejé 1 paquete de Dog Chow para razas pequeñas de 8 kilos. ¿Quieres que continuemos con algún otro producto?";

  const respuesta = asegurarRespuestaCatalogo(mensaje, respuestaHumanizada, {
    catalogo,
    interpretacionIA: {
      producto: {
        marca: "Dog Chow",
        referencia: "Adulto Mini y Pequeño",
        presentacion: "8kg",
      },
    },
  });

  assert.match(respuesta, /no tengo presentación de 8kg/i);
  assert.doesNotMatch(respuesta, /ya dejé/i);
});

test("avanza a pago cuando el cliente cierra el carrito aunque la IA reinterprete el producto anterior", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  estado.entrega = { tipo: "domicilio", sede: null };
  estado.carrito = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "4kg",
      precio: 68000,
      cantidad: 1,
    },
  ];
  estado.esperandoConfirmacionDomicilio = true;

  const interpretacionEquivocada = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.92,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion: null,
      cantidad: null,
    },
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo("asi esta bien", estado, catalogo, interpretacionEquivocada);

  assert.match(respuesta, /método de pago|metodo de pago/i);
  assert.doesNotMatch(respuesta, /presentaciones/i);
  assert.equal(estado.esperandoMetodoPago, true);
});

test("no interpreta una cedula aislada como presupuesto", () => {
  assert.equal(extraerPresupuesto("1004755939"), null);
  assert.equal(extraerPresupuesto("presupuesto 100000"), 100000);
  assert.equal(extraerPresupuesto("100000", { permitirNumeroSolo: true }), 100000);
});

test("busca productos por categoria petshop", () => {
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo("tienen medicamentos para perro", estado, catalogoPetshopExtendido, null);

  assert.match(respuesta, /NexGard/i);
  assert.doesNotMatch(respuesta, /Chunky/i);
});

test("busca productos por subcategoria petshop", () => {
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo("necesito antipulgas para perro", estado, catalogoPetshopExtendido, null);

  assert.match(respuesta, /NexGard/i);
  assert.match(respuesta, /confirmaci[oó]n responsable|veterinario/i);
});

test("lista productos para garrapatas sin tratarlos como una referencia llamada productos", () => {
  const estado = crearEstadoInicial();
  const interpretacionEquivocada = {
    confianza: 0.95,
    intencion: "consulta_producto",
    accion: "consultar",
    producto: {
      marca: "Chunky",
      referencia: "Adulto Todas las Razas",
      presentacion: null,
    },
    productos: [],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
  };

  const respuesta = resolverConsultaCatalogo(
    "Que productos tienes para garrapatas",
    estado,
    catalogoPetshopExtendido,
    interpretacionEquivocada
  );

  assert.match(respuesta, /NexGard|Frontline Gato/i);
  assert.doesNotMatch(respuesta, /no manejamos productos|Chunky/i);
  assert.match(respuesta, /perro o gato|cu[aá]nto pesa/i);
});

test("una consulta nueva por purgantes no arrastra la referencia anterior de comida", () => {
  const estado = crearEstadoInicial();
  estado.marca = "BR";
  estado.criterios = {
    especie: "gato",
    categoria: "comida",
    subcategoria: "concentrado",
    etapa: "adulto",
  };
  estado.ultimaSeleccion = {
    marca: "BR",
    referencia: "BR CAT ADUL POLLO",
    presentacion: null,
    cantidad: 1,
  };

  const respuesta = resolverConsultaCatalogo("y que purgantes tienes para gato?", estado, catalogoPetshopExtendido, null);

  assert.match(respuesta, /Drontal Gatos/i);
  assert.match(respuesta, /desparasitante|medicamento|confirmaci[oó]n responsable|veterinario/i);
  assert.doesNotMatch(respuesta, /BR CAT ADUL POLLO/i);
  assert.doesNotMatch(respuesta, /Presentaciones:\s*- 1kg/i);
});

test("entiende pulgas y garrapatas por especie sin quedarse en la marca anterior", () => {
  const estado = crearEstadoInicial();
  estado.marca = "BR";
  estado.criterios = { especie: "gato", categoria: "comida", subcategoria: "concentrado" };

  const respuesta = resolverConsultaCatalogo(
    "que tienen para pulgas y garrapatas en gatos?",
    estado,
    catalogoPetshopExtendido,
    null
  );

  assert.match(respuesta, /Frontline Gato/i);
  assert.doesNotMatch(respuesta, /NexGard/i);
  assert.doesNotMatch(respuesta, /BR CAT ADUL POLLO/i);
});

test("cambia de contexto para snacks arena y juguetes", () => {
  const estadoSnack = crearEstadoInicial();
  estadoSnack.marca = "BR";
  estadoSnack.criterios = { especie: "gato", categoria: "comida", subcategoria: "concentrado" };

  const snacks = resolverConsultaCatalogo("que snacks tienes para gato?", estadoSnack, catalogoPetshopExtendido, null);
  assert.match(snacks, /Churu Gato Pollo/i);
  assert.doesNotMatch(snacks, /BR CAT ADUL POLLO/i);

  const estadoArena = crearEstadoInicial();
  estadoArena.marca = "BR";
  estadoArena.criterios = { especie: "gato", categoria: "comida", subcategoria: "concentrado" };

  const arena = resolverConsultaCatalogo("manejan arena para gato?", estadoArena, catalogoPetshopExtendido, null);
  assert.match(arena, /Arena Max Gato/i);
  assert.doesNotMatch(arena, /BR CAT ADUL POLLO/i);

  const juguetes = resolverConsultaCatalogo("juguetes para perro", crearEstadoInicial(), catalogoPetshopExtendido, null);
  assert.match(juguetes, /Kong/i);
  assert.doesNotMatch(juguetes, /Chunky/i);
});

test("encuentra referencias parciales de arena por nombre distintivo", () => {
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo(
    "Y Arena michiko tienen?",
    estado,
    cargarCatalogoPruebas(),
    null
  );

  assert.doesNotMatch(respuesta, /no encuentro|no manejamos/i);
  assert.match(respuesta, /Arena Michiko Lavanda|Arena Michiko Bebe/i);
  assert.match(respuesta, /4kg|10kg/i);
});

test("encuentra arena michiko en el catalogo real sin caer en desodorizantes", () => {
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo(
    "Y Arena michiko tienen?",
    estado,
    cargarProductosDesdeJson(),
    null
  );

  assert.doesNotMatch(respuesta, /no encuentro|no manejamos|ARENA A GRANEL/i);
  assert.match(respuesta, /ARENA MICHIKO LIMON/i);
  assert.match(respuesta, /ARENA MICHIKO LAVANDA/i);
  assert.doesNotMatch(respuesta, /DEODORIZANTE ARENA MICHIKO/i);
});

test("reconoce una referencia exacta aunque no sea marca del catalogo", () => {
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo("buenas tardes, manejan nexgard?", estado, catalogoPetshopExtendido, null);

  assert.doesNotMatch(respuesta, /no manejamos/i);
  assert.match(respuesta, /NexGard/i);
  assert.match(respuesta, /10 a 25 kg/i);
});

test("una marca conocida no se vuelve criterio de antipulgas que oculte sus referencias", () => {
  const estado = crearEstadoInicial();
  const catalogo = [
    {
      marca: "NEXGARD",
      referencias: [
        {
          nombre: "NEXGARD",
          especie: "perro",
          categoria: "medicamento",
          subcategoria: "medicamento",
          requiereConfirmacion: true,
          presentaciones: [{ peso: "10-25 kg", precio: 49700, stock: true, metadata: {} }],
        },
      ],
    },
  ];

  const respuesta = resolverConsultaCatalogo("buenas tardes, manejan nexgard?", estado, catalogo, null);

  assert.doesNotMatch(respuesta, /no encuentro una opción exacta/i);
  assert.match(respuesta, /NEXGARD/i);
  assert.match(respuesta, /10-25 kg/i);
});

test("busca productos por especie y etapa", () => {
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo("comida para perro adulto", estado, catalogoPetshopExtendido, null);

  assert.match(respuesta, /Chunky/i);
  assert.match(respuesta, /Adulto Todas las Razas/i);
});

test("busca accesorios sin mezclarlos con comida", () => {
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo("accesorio juguete para perro", estado, catalogoPetshopExtendido, null);

  assert.match(respuesta, /Kong/i);
  assert.doesNotMatch(respuesta, /Chunky/i);
});

test("prioriza un bloque de datos de envio sobre recomendaciones por presupuesto", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  const mensaje = [
    "1004755939",
    "fabio@gmail.com",
    "Carrera 21 No 20b22 barrio providencia",
    "Dora Inés Zapata",
    "efectivo",
  ].join("\n");
  estado.carrito = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "2kg",
      precio: 36000,
      cantidad: 2,
    },
  ];
  estado.esperandoConfirmacionDomicilio = true;

  const interpretacionIA = {
    intencion: "datos_envio",
    accion: null,
    confianza: 0.99,
    entrega: {
      tipo: "domicilio",
      direccion: "Carrera 21 No 20b22 barrio providencia",
      direccionCompleta: true,
      sector: null,
      metodoPago: "efectivo",
      sede: null,
    },
    datosCliente: {
      nombre: "Dora Inés Zapata",
      cedula: "1004755939",
      correo: "fabio@gmail.com",
      celular: null,
    },
  };

  const respuesta = resolverConsultaCatalogo(mensaje, estado, catalogo, interpretacionIA);

  assert.equal(estado.datosDomicilio.cedula, "1004755939");
  assert.match(respuesta, /- celular/);
  assert.doesNotMatch(respuesta, /presupuesto/i);
});

test("no trata una apertura de pedido como marca desconocida", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();

  const respuesta = resolverConsultaCatalogo("hola, para hacer un pedido", estado, catalogo, null);

  assert.doesNotMatch(respuesta, /no manejamos/i);
  assert.match(respuesta, /Dog Chow|Chunky|marca|producto/i);
});

test("no trata errores de dedo en apertura de pedido como producto desconocido", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();

  const respuesta = resolverConsultaCatalogo("buenos dias\nnecesito u8n pedido", estado, catalogo, null);

  assert.doesNotMatch(respuesta, /no manejamos/i);
  assert.doesNotMatch(respuesta, /u8n/i);
  assert.match(respuesta, /Dog Chow|Chunky|marca|producto/i);
});

test("usa la raza de la mascota como contexto de recomendacion", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  const interpretacionIA = {
    intencion: "recomendacion",
    accion: "consultar",
    confianza: 0.95,
    producto: {
      marca: null,
      referencia: null,
      especie: "perro",
      etapa: "adulto",
      tamano: "grande",
      presentacion: null,
      cantidad: null,
    },
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  resolverConsultaCatalogo("hola necesito un pedido", estado, catalogo, null);
  const respuesta = resolverConsultaCatalogo("tengo un labrador adulto", estado, catalogo, interpretacionIA);

  assert.doesNotMatch(respuesta, /no manejamos/i);
  assert.match(respuesta, /Adulto Mediano y Grande|Adulto Todas las Razas/i);
  assert.equal(estado.criterios.especie, "perro");
  assert.equal(estado.criterios.etapa, "adulto");
  assert.equal(estado.criterios.tamano, "grande");
});

test("responde con alternativas cuando una recomendacion no tiene coincidencias exactas", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();

  const respuesta = resolverConsultaCatalogo(
    "recomiendame alimento economico para gato senior",
    estado,
    catalogo,
    null
  );

  assert.match(respuesta, /no tengo una referencia exacta|no encuentro una opción exacta/i);
});

test("agrega varios productos interpretados desde un mismo mensaje", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  const mensaje = [
    "Hola buenos días",
    "Por favor un pedido a domicilio p Arreboles Bl 1 Apto 102 Belmonte",
    "Dog chow a. rp 1kl",
    "dog choe a grande 2kl",
  ].join("\n");
  const interpretacionIA = {
    intencion: "pedido_producto",
    accion: "agregar",
    confianza: 0.96,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion: "1kg",
      cantidad: 1,
    },
    productos: [
      {
        marca: "Dog Chow",
        referencia: "Adulto Mini y Pequeño",
        especie: "perro",
        etapa: "adulto",
        tamano: "pequeno",
        presentacion: "1kg",
        cantidad: 1,
      },
      {
        marca: "Dog Chow",
        referencia: "Adulto Mediano y Grande",
        especie: "perro",
        etapa: "adulto",
        tamano: "grande",
        presentacion: "2kg",
        cantidad: 1,
      },
    ],
    entrega: {
      tipo: "domicilio",
      direccion: "Arreboles Bl 1 Apto 102 Belmonte",
      direccionCompleta: true,
      sector: null,
      metodoPago: null,
      sede: null,
    },
    datosCliente: {},
    carrito: { operacion: "agregar" },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo(mensaje, estado, catalogo, interpretacionIA);

  assert.equal(estado.carrito.length, 2);
  assert.match(respuesta, /Adulto Mini y Pequeño 1kg/i);
  assert.match(respuesta, /Adulto Mediano y Grande 2kg/i);
  assert.doesNotMatch(respuesta, /Adulto Mediano y Grande 1kg/i);
});

test("consultar precios no agrega productos al carrito", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  const interpretacionIA = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.96,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion: "1kg",
      cantidad: 1,
    },
    productos: [
      {
        marca: "Dog Chow",
        referencia: "Adulto Mini y Pequeño",
        especie: "perro",
        etapa: "adulto",
        tamano: "pequeno",
        presentacion: "1kg",
        cantidad: 1,
      },
      {
        marca: "Dog Chow",
        referencia: "Adulto Mediano y Grande",
        especie: "perro",
        etapa: "adulto",
        tamano: "grande",
        presentacion: "2kg",
        cantidad: 1,
      },
    ],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo(
    "precio dog chow a rp 1kl y dog chow adulto grande 2kl",
    estado,
    catalogo,
    interpretacionIA
  );

  assert.equal(estado.carrito.length, 0);
  assert.equal(estado.productosConsultados.length, 2);
  assert.match(respuesta, /Te confirmo esta referencia/i);
  assert.match(respuesta, /También manejamos estas presentaciones de Dog Chow Adulto Mini y Pequeño/i);
  assert.match(respuesta, /Adulto Mini y Pequeño 1kg/i);
  assert.match(respuesta, /Adulto Mini y Pequeño 2kg/i);
  assert.match(respuesta, /Adulto Mini y Pequeño 4kg/i);
  assert.match(respuesta, /Adulto Mediano y Grande 2kg/i);
  assert.match(respuesta, /Adulto Mediano y Grande 1kg/i);
  assert.match(respuesta, /\[\[AIVANCE_MESSAGE_BREAK\]\]/);
});

test("despues de cotizar puede agregar los productos consultados", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  estado.productosConsultados = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "1kg",
      precio: 19000,
      cantidad: 1,
    },
    {
      marca: "Dog Chow",
      referencia: "Adulto Mediano y Grande",
      peso: "2kg",
      precio: 38000,
      cantidad: 1,
    },
  ];
  const interpretacionIA = {
    intencion: "pedido_producto",
    accion: "agregar",
    confianza: 0.95,
    producto: {},
    productos: [],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: "agregar" },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo("agregame los dos", estado, catalogo, interpretacionIA);

  assert.equal(estado.carrito.length, 2);
  assert.equal(estado.productosConsultados.length, 0);
  assert.match(respuesta, /agregué al pedido/i);
});

test("si asi esta bien despues de armar carrito avanza a entrega sin buscar producto", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  estado.carrito = [
    {
      marca: "Agility",
      referencia: "AGILITY GATO AD",
      peso: "1.5kg",
      precio: 41000,
      cantidad: 1,
    },
    {
      marca: "Agility",
      referencia: "AGILITY GATITO",
      peso: "500gr",
      precio: 16900,
      cantidad: 1,
    },
  ];
  estado.esperandoConfirmacionDomicilio = true;
  const interpretacionErrada = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.75,
    producto: {
      marca: "SI ASI BIEN",
      referencia: null,
      presentacion: null,
    },
    productos: [],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo(
    "si asi esta bien",
    estado,
    catalogo,
    interpretacionErrada
  );

  assert.match(respuesta, /entrega|domicilio|recoger|método de pago|metodo de pago/i);
  assert.doesNotMatch(respuesta, /SI ASI BIEN/i);
  assert.doesNotMatch(respuesta, /cat[aá]logo actual/i);
  assert.equal(estado.carrito.length, 2);
});

test("consulta de precio de un solo producto no agrega al carrito", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  const interpretacionIA = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.96,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion: "4kg",
      cantidad: 1,
    },
    productos: [],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo(
    "Que precio tienen el cuido Purina dog chow a r pequeña de 4kl?",
    estado,
    catalogo,
    interpretacionIA
  );

  assert.equal(estado.carrito.length, 0);
  assert.equal(estado.productosConsultados.length, 1);
  assert.match(respuesta, /\$68\.000/);
  assert.match(
    respuesta,
    /Claro, lo tenemos|Sí, esa presentación está disponible|Te confirmo, esa referencia la manejamos/i
  );
  assert.match(respuesta, /También manejamos estas presentaciones de esa referencia/i);
  assert.match(respuesta, /Adulto Mini y Pequeño 1kg: \$19\.000/i);
  assert.match(respuesta, /Adulto Mini y Pequeño 2kg: \$36\.000/i);
  assert.match(respuesta, /Adulto Mini y Pequeño 4kg: \$68\.000/i);
  assert.doesNotMatch(respuesta, /Adulto Mediano y Grande/i);
  assert.doesNotMatch(respuesta, /Cachorros Mini y Pequeño/i);
  assert.doesNotMatch(respuesta, /Mirringo/i);
  assert.match(
    respuesta,
    /¿Cuál presentación quieres que te deje en el pedido\?|¿Te dejo alguna de estas presentaciones en el pedido\?|¿Con cuál presentación seguimos para el pedido\?/i
  );
  assert.doesNotMatch(respuesta, /Si te sirve/i);
  assert.doesNotMatch(respuesta, /Pedido:/);
});

test("una imagen con referencia exacta usa el producto interpretado aunque el caption sea generico", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  const interpretacionIA = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.95,
    producto: {
      marca: "Chunky",
      referencia: "Adulto Todas las Razas",
      especie: "perro",
      etapa: "adulto",
      tamano: "todas",
      sabores: ["pollo"],
      presentacion: "2kg",
      cantidad: 1,
    },
    productos: [],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo("Manejan esta referencia", estado, catalogo, interpretacionIA);

  assert.equal(estado.carrito.length, 0);
  assert.equal(estado.productosConsultados.length, 1);
  assert.equal(estado.productosConsultados[0].marca, "Chunky");
  assert.equal(estado.productosConsultados[0].referencia, "Adulto Todas las Razas");
  assert.equal(estado.productosConsultados[0].peso, "2kg");
  assert.match(respuesta, /Chunky Adulto Todas las Razas 2kg: \$32\.000/i);
  assert.doesNotMatch(respuesta, /no tengo una referencia exacta|no tengo exactamente/i);
});

test("normaliza presentaciones importadas con prefijo x contra imagen texto o audio", () => {
  const estado = crearEstadoInicial();
  const interpretacionIA = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.96,
    producto: {
      marca: "CHUNKY",
      referencia: "CHUNKY ADULTO",
      especie: "perro",
      etapa: "adulto",
      tamano: "todas",
      presentacion: "2kg",
      cantidad: 1,
    },
    productos: [],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo("Y este que costo tiene?", estado, catalogoChunkyImportado, interpretacionIA);

  assert.equal(estado.productosConsultados.length, 1);
  assert.equal(estado.productosConsultados[0].referencia, "CHUNKY ADULTO");
  assert.equal(estado.productosConsultados[0].peso, "x 2 kg");
  assert.match(respuesta, /CHUNKY ADULTO x 2 kg: \$18\.900/i);
  assert.doesNotMatch(respuesta, /no tengo presentación de 2kg/i);
});

test("normaliza gramos leidos desde imagen contra presentaciones en kilos", () => {
  const estado = crearEstadoInicial();
  const interpretacionIA = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.96,
    producto: {
      marca: "CHUNKY",
      referencia: "CHUNKY ADULTO",
      especie: "perro",
      etapa: "adulto",
      tamano: "todas",
      presentacion: "2000g",
      cantidad: 1,
    },
    productos: [],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo("Y este que costo tiene?", estado, catalogoChunkyImportado, interpretacionIA);

  assert.equal(estado.productosConsultados[0].peso, "x 2 kg");
  assert.match(respuesta, /CHUNKY ADULTO x 2 kg: \$18\.900/i);
  assert.doesNotMatch(respuesta, /no tengo presentación/i);
});

test("chunky adulto razas pequenas prioriza RP sobre la referencia adulta generica", () => {
  const estado = crearEstadoInicial();

  const respuesta = resolverConsultaCatalogo(
    "chunky adultos razas pquenas",
    estado,
    catalogoChunkyImportado,
    null
  );

  assert.equal(estado.ultimaSeleccion.referencia, "CHUNKY ADULTO RP");
  assert.match(respuesta, /CHUNKY ADULTO RP/i);
  assert.match(respuesta, /\$16\.900/);
  assert.doesNotMatch(respuesta, /\$178\.800/);
});

test("consulta con marca clara y referencia ambigua no lista referencias globales por especie", () => {
  const estado = crearEstadoInicial();
  estado.productosConsultados = [
    {
      marca: "ADVANCE",
      referencia: "ADVANCE CAT URINARY",
      peso: "1.5kg",
      precio: 108000,
    },
  ];
  const catalogoMixto = [
    {
      marca: "ADVANCE",
      referencias: [
        {
          nombre: "ADVANCE DOG ATOPIC MINI",
          especie: "perro",
          etapa: "adulto",
          presentaciones: [{ peso: "1.5kg", precio: 108000, stock: true, metadata: {} }],
        },
      ],
    },
    {
      marca: "AGILITY",
      referencias: [
        {
          nombre: "AGILITY EN LATA PERRO",
          especie: "perro",
          presentaciones: [{ peso: "360gr", precio: 16800, stock: true, metadata: {} }],
        },
        {
          nombre: "AGILITY GRAN ADUL",
          especie: "perro",
          etapa: "adulto",
          tamano: "grande",
          presentaciones: [{ peso: "3kg", precio: 76000, stock: true, metadata: {} }],
        },
        {
          nombre: "AGILITY PEQ ADUL",
          especie: "perro",
          etapa: "adulto",
          tamano: "pequeno",
          presentaciones: [{ peso: "1.5kg", precio: 43600, stock: true, metadata: {} }],
        },
        {
          nombre: "AGILITY OBESOS",
          especie: "perro",
          etapa: "adulto",
          presentaciones: [{ peso: "1.5kg", precio: 38900, stock: true, metadata: {} }],
        },
      ],
    },
    {
      marca: "ALPO",
      referencias: [
        {
          nombre: "ALPO ADUL",
          especie: "perro",
          etapa: "adulto",
          presentaciones: [{ peso: "2kg", precio: 20000, stock: true, metadata: {} }],
        },
      ],
    },
    {
      marca: "BR",
      referencias: [
        {
          nombre: "BR CORDERO",
          especie: "perro",
          etapa: "adulto",
          presentaciones: [{ peso: "3kg", precio: 78000, stock: true, metadata: {} }],
        },
      ],
    },
  ];
  const interpretacionIA = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.76,
    producto: {
      marca: "AGILITY",
      referencia: null,
      especie: "perro",
      etapa: "adulto",
      tamano: null,
      presentacion: null,
    },
    productos: [],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo(
    "TIENE AGILITY GOLD PERRO ADULTO?",
    estado,
    catalogoMixto,
    interpretacionIA
  );

  assert.match(respuesta, /AGILITY GRAN ADUL/i);
  assert.match(respuesta, /AGILITY PEQ ADUL/i);
  assert.doesNotMatch(respuesta, /Lo que sí tengo para perros/i);
  assert.doesNotMatch(respuesta, /ADVANCE DOG|ALPO ADUL|BR CORDERO/i);
});

test("otra pregunta de precio despues de cotizar sigue sin agregar", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  estado.productosConsultados = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "4kg",
      precio: 68000,
      cantidad: 1,
    },
  ];
  const interpretacionIA = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.95,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mediano y Grande",
      especie: "perro",
      etapa: "adulto",
      tamano: "grande",
      presentacion: "1kg",
      cantidad: 1,
    },
    productos: [],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo("y el dog chow a raza grande 1kl?", estado, catalogo, interpretacionIA);

  assert.equal(estado.carrito.length, 0);
  assert.equal(estado.productosConsultados.length, 1);
  assert.match(respuesta, /\$20\.000/);
  assert.doesNotMatch(respuesta, /agregué|Pedido:/i);
});

test("cotiza productos consecutivos y conserva su orden conversacional", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  const base = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.96,
    productos: [],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  resolverConsultaCatalogo(
    "precio dog chow adulto pequeño 1kg",
    estado,
    catalogo,
    {
      ...base,
      producto: {
        marca: "Dog Chow",
        referencia: "Adulto Mini y Pequeño",
        especie: "perro",
        etapa: "adulto",
        tamano: "pequeno",
        presentacion: "1kg",
        cantidad: 1,
      },
    }
  );
  const respuesta = resolverConsultaCatalogo(
    "y el dog chow adulto grande 2kg",
    estado,
    catalogo,
    {
      ...base,
      producto: {
        marca: "Dog Chow",
        referencia: "Adulto Mediano y Grande",
        especie: "perro",
        etapa: "adulto",
        tamano: "grande",
        presentacion: "2kg",
        cantidad: 1,
      },
    }
  );

  assert.match(respuesta, /Adulto Mediano y Grande 2kg/i);
  assert.equal(estado.productosConsultados.length, 1);
  assert.equal(
    estado.productosConsultados[0].referencia,
    "Adulto Mediano y Grande"
  );
  assert.equal(estado.historialProductosConsultados.length, 2);
  assert.deepEqual(
    estado.historialProductosConsultados.map((item) => item.referencia),
    ["Adulto Mini y Pequeño", "Adulto Mediano y Grande"]
  );
});

test("una direccion despues de cotizar continua el pedido con el producto consultado", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  estado.productosConsultados = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "4kg",
      precio: 68000,
      cantidad: 1,
    },
  ];
  const interpretacionIA = {
    intencion: "pedido_producto",
    accion: "agregar",
    confianza: 0.97,
    producto: {},
    productos: [],
    entrega: {
      tipo: "domicilio",
      direccion: "calle 18 # 10-40, CENTRO",
      direccionCompleta: true,
      sector: null,
      metodoPago: null,
      sede: null,
    },
    datosCliente: {},
    carrito: { operacion: "agregar" },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo(
    "para calle 18 # 10-40, CENTRO",
    estado,
    catalogo,
    interpretacionIA
  );

  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.productosConsultados.length, 0);
  assert.equal(estado.entrega.tipo, "domicilio");
  assert.equal(estado.datosDomicilio.direccion, "calle 18 # 10-40, CENTRO");
  assert.match(respuesta, /agregué al pedido/i);
  assert.doesNotMatch(respuesta, /no estamos realizando domicilios|recoger/i);
});

test("un metodo de pago no reemplaza el nombre confirmado del domicilio", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  estado.carrito = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "2kg",
      precio: 36000,
      cantidad: 2,
    },
  ];
  estado.entrega = { tipo: "domicilio", sede: null };
  estado.datosDomicilio = {
    nombre: "Dora Inés Zapata",
    cedula: "42105604",
    correo: "luz@gmail.com",
    celular: "3124138191",
    direccion: "Carrera 21 No 20b22 barrio providencia",
  };
  estado.esperandoDatosDomicilio = true;
  estado.esperandoMetodoPago = true;
  const interpretacionIA = {
    intencion: "metodo_pago",
    accion: null,
    confianza: 0.99,
    producto: {},
    productos: [],
    entrega: {
      tipo: null,
      direccion: null,
      direccionCompleta: null,
      sector: null,
      metodoPago: "efectivo",
      sede: null,
    },
    datosCliente: {
      nombre: null,
      cedula: null,
      correo: null,
      celular: null,
    },
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo("efectivo", estado, catalogo, interpretacionIA);

  assert.equal(estado.datosDomicilio.nombre, "Dora Inés Zapata");
  assert.equal(estado.metodoPago, "efectivo");
  assert.match(respuesta, /Nombre: Dora Inés Zapata/);
  assert.match(respuesta, /¿Está todo correcto para confirmar el pedido?/);
  assert.doesNotMatch(respuesta, /Nombre: efectivo/);
  assert.equal(estado.pedidoConfirmado, false);

  const confirmacion = resolverConsultaCatalogo("sí", estado, catalogo, null);

  assert.equal(estado.pedidoConfirmado, true);
  assert.match(confirmacion, /pedido queda confirmado/i);
});

test("un lote completo recapitula el pedido y espera confirmacion explicita", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  const mensaje = [
    "Hola",
    "Por favor me vende 2 paquetes de dog chow a raza pequeña 2kl?",
    "Carrera 21 No 20b22 barrio providencia",
    "Dora Inés Zapata",
    "42105604",
    "luz@gmail.com",
    "3124138191",
    "efectivo",
  ].join("\n");
  const interpretacionIA = {
    intencion: "pedido_producto",
    accion: "agregar",
    confianza: 0.99,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion: "2kg",
      cantidad: 2,
    },
    productos: [],
    entrega: {
      tipo: "domicilio",
      direccion: "Carrera 21 No 20b22 barrio providencia",
      direccionCompleta: true,
      sector: null,
      metodoPago: "efectivo",
      sede: null,
    },
    datosCliente: {
      nombre: "Dora Inés Zapata",
      cedula: "42105604",
      correo: "luz@gmail.com",
      celular: "3124138191",
    },
    carrito: { operacion: "agregar" },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo(mensaje, estado, catalogo, interpretacionIA);

  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.pedidoConfirmado, false);
  assert.equal(estado.esperandoConfirmacionPedido, true);
  assert.match(respuesta, /2 x Dog Chow Adulto Mini y Pequeño 2kg: \$72\.000/);
  assert.match(respuesta, /Nombre: Dora Inés Zapata/);
  assert.match(respuesta, /Método de pago: efectivo/);
  assert.match(respuesta, /¿Está todo correcto para confirmar el pedido?/);
});

test("un lote incompleto pide solamente los datos de envio faltantes", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  const mensaje = [
    "Hola",
    "Por favor me vende 2 paquetes de dog chow a raza pequeña 2kl?",
    "Carrera 21 No 20b22 barrio providencia",
    "Dora Inés Zapata",
    "efectivo",
  ].join("\n");
  const interpretacionIA = {
    intencion: "pedido_producto",
    accion: "agregar",
    confianza: 0.99,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion: "2kg",
      cantidad: 2,
    },
    productos: [],
    entrega: {
      tipo: "domicilio",
      direccion: "Carrera 21 No 20b22 barrio providencia",
      direccionCompleta: true,
      sector: null,
      metodoPago: "efectivo",
      sede: null,
    },
    datosCliente: {
      nombre: "Dora Inés Zapata",
      cedula: null,
      correo: null,
      celular: null,
    },
    carrito: { operacion: "agregar" },
    faltanteSugerido: "cedula",
  };

  const respuesta = resolverConsultaCatalogo(mensaje, estado, catalogo, interpretacionIA);

  assert.match(respuesta, /- cedula/);
  assert.match(respuesta, /- correo/);
  assert.match(respuesta, /- celular/);
  assert.doesNotMatch(respuesta, /- nombre/);
  assert.doesNotMatch(respuesta, /- direccion completa/);
});

test("acepta direccion colombiana con manzana y casa como direccion completa", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  estado.carrito = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "4kg",
      precio: 68000,
      cantidad: 1,
    },
  ];
  estado.metodoPago = "efectivo";
  estado.esperandoDatosDomicilio = true;
  estado.datosDomicilio = {
    nombre: "Cliente Prueba",
    cedula: "1000000000",
    correo: "cliente@test.com",
    celular: "3001234567",
  };

  const respuesta = resolverConsultaCatalogo(
    "adulto raza pequena para la mz 1 cs 19 en dosquebradas",
    estado,
    catalogo,
    null
  );

  assert.equal(estado.entrega.tipo, "domicilio");
  assert.equal(estado.datosDomicilio.direccion, "mz 1 cs 19 en dosquebradas");
  assert.equal(estado.datosDomicilio.direccionParcial, undefined);
  assert.doesNotMatch(respuesta, /direccion completa/i);
  assert.match(respuesta, /¿Está todo correcto para confirmar el pedido?/);
});

test("permite cambiar el metodo de pago desde el resumen sin alterar el nombre", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarCatalogoPruebas();
  estado.carrito = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "2kg",
      precio: 36000,
      cantidad: 2,
    },
  ];
  estado.entrega = { tipo: "domicilio", sede: null };
  estado.metodoPago = "efectivo";
  estado.datosDomicilio = {
    nombre: "Dora Inés Zapata",
    cedula: "42105604",
    correo: "luz@gmail.com",
    celular: "3124138191",
    direccion: "Carrera 21 No 20b22 barrio providencia",
  };
  estado.esperandoConfirmacionPedido = true;

  const respuesta = resolverConsultaCatalogo("tarjeta", estado, catalogo, null);

  assert.equal(estado.datosDomicilio.nombre, "Dora Inés Zapata");
  assert.equal(estado.metodoPago, "tarjeta debito o credito");
  assert.match(respuesta, /Nombre: Dora Inés Zapata/);
  assert.match(respuesta, /Método de pago: tarjeta debito o credito/);
  assert.doesNotMatch(respuesta, /Nombre: tarjeta/);
});

function crearEstadoConPedidoAnterior() {
  const estado = crearEstadoInicial();
  estado.carrito = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "2kg",
      precio: 36000,
      cantidad: 2,
    },
  ];
  estado.entrega = { tipo: "domicilio", sede: null };
  estado.metodoPago = "efectivo";
  estado.datosDomicilio = {
    nombre: "Dora Inés Zapata",
    cedula: "42105604",
    correo: "luz@gmail.com",
    celular: "3124138191",
    direccion: "Carrera 21 No 20b22 barrio providencia",
  };
  estado.pedidoConfirmado = true;
  estado.confirmacionPedidoId = "pedido-anterior";
  return estado;
}

function interpretacionProductoNuevo({
  marca = "Chunky",
  referencia = "Adulto Razas Pequeñas",
  presentacion = "2kg",
  cantidad = 1,
  direccion = null,
} = {}) {
  return {
    intencion: "pedido_producto",
    accion: "nuevo_pedido",
    confianza: 0.99,
    producto: {
      marca,
      referencia,
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion,
      cantidad,
    },
    productos: [],
    entrega: {
      tipo: direccion ? "domicilio" : null,
      direccion,
      direccionCompleta: direccion ? true : null,
      sector: null,
      metodoPago: null,
      sede: null,
    },
    datosCliente: {},
    carrito: { operacion: "agregar" },
    faltanteSugerido: null,
  };
}

test("ofrece repetir el ultimo pedido confirmado con productos y direccion", () => {
  const estado = crearEstadoConPedidoAnterior();
  const catalogo = cargarCatalogoPruebas();

  const pregunta = resolverConsultaCatalogo("Hola, quiero hacer un pedido", estado, catalogo, null);

  assert.match(pregunta, /2 x Dog Chow Adulto Mini y Pequeño 2kg: \$72\.000/);
  assert.match(pregunta, /Carrera 21 No 20b22 barrio providencia/);
  assert.match(pregunta, /¿Deseas repetirlo/);
  assert.equal(estado.esperandoConfirmacionRepetirPedido, true);

  const respuesta = resolverConsultaCatalogo("Sí, por favor", estado, catalogo, null);

  assert.equal(estado.pedidoConfirmado, true);
  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].cantidad, 2);
  assert.notEqual(estado.confirmacionPedidoId, "pedido-anterior");
  assert.match(respuesta, /pedido queda confirmado/i);
});

test("no confunde apertura de pedido con una marca corta del catalogo", () => {
  const catalogo = [
    {
      marca: "PED",
      referencias: [
        {
          nombre: "PED ADULT RP",
          especie: "perro",
          categoria: "comida",
          subcategoria: "concentrado",
          etapa: "adulto",
          presentaciones: [{ peso: "1kg", precio: 1000, stock: true, metadata: {} }],
        },
      ],
    },
  ];

  assert.equal(buscarMarca(catalogo, "para hacer un pedido"), undefined);
  assert.equal(buscarMarca(catalogo, "para hacer un pedidp"), undefined);

  const respuesta = resolverConsultaCatalogo("para hacer un pedido", crearEstadoInicial(), catalogo, null);
  const respuestaTypo = resolverConsultaCatalogo("para hacer un pedidp", crearEstadoInicial(), catalogo, null);

  assert.match(respuesta, /producto necesitas|producto estás buscando|armemos ese pedido/i);
  assert.match(respuestaTypo, /producto necesitas|producto estás buscando|armemos ese pedido/i);
  assert.doesNotMatch(respuesta, /referencias disponibles|PED ADULT RP/);
  assert.doesNotMatch(respuestaTypo, /referencias disponibles|PED ADULT RP/);
});

test("otro pedido con compra anterior ofrece repetir aunque exista una marca PED", () => {
  const estado = crearEstadoInicial();
  estado.carrito = [
    {
      marca: "PED",
      referencia: "PED ADULT RP",
      peso: "1kg",
      precio: 1000,
      cantidad: 2,
    },
  ];
  estado.pedidoConfirmado = true;
  estado.entrega = { tipo: "domicilio", sede: null };
  estado.datosDomicilio = { direccion: "Calle 1" };
  const catalogo = [
    {
      marca: "PED",
      referencias: [
        {
          nombre: "PED ADULT RP",
          especie: "perro",
          categoria: "comida",
          subcategoria: "concentrado",
          etapa: "adulto",
          presentaciones: [{ peso: "1kg", precio: 1000, stock: true, metadata: {} }],
        },
      ],
    },
  ];
  const interpretacion = {
    intencion: "pedido_producto",
    accion: "nuevo_pedido",
    confianza: 0.74,
    producto: {},
    productos: [],
  };

  const respuesta = resolverConsultaCatalogo("hola, para hacer otro pedido", estado, catalogo, interpretacion);

  assert.match(respuesta, /2 x PED ADULT RP 1kg: \$2\.000/);
  assert.match(respuesta, /¿Deseas repetirlo/);
  assert.equal(estado.esperandoConfirmacionRepetirPedido, true);
});

test("listar una marca corta formatea precios sin romper", () => {
  const catalogo = [
    {
      marca: "PED",
      referencias: [
        {
          nombre: "PED ADULT RP",
          especie: "perro",
          categoria: "comida",
          subcategoria: "concentrado",
          etapa: "adulto",
          presentaciones: [{ peso: "1kg", precio: 1000, stock: true, metadata: {} }],
        },
      ],
    },
  ];

  const respuesta = resolverConsultaCatalogo("PED", crearEstadoInicial(), catalogo, null);

  assert.match(respuesta, /PED ADULT RP/);
  assert.match(respuesta, /1kg: \$1\.000/);
});

test("un producto distinto crea carrito nuevo y conserva datos de envio anteriores", () => {
  const estado = crearEstadoConPedidoAnterior();
  const catalogo = cargarCatalogoPruebas();
  const interpretacionIA = interpretacionProductoNuevo();

  const respuesta = resolverConsultaCatalogo(
    "Quiero un Chunky adulto razas pequeñas de 2kg",
    estado,
    catalogo,
    interpretacionIA
  );

  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].marca, "Chunky");
  assert.equal(estado.carrito[0].referencia, "Adulto Razas Pequeñas");
  assert.equal(estado.datosDomicilio.direccion, "Carrera 21 No 20b22 barrio providencia");
  assert.match(respuesta, /Nombre: Dora Inés Zapata/);
  assert.doesNotMatch(respuesta, /Dog Chow/);
});

test("perfecto confirma un pedido nuevo con datos anteriores sin repetir preguntas", () => {
  const estado = crearEstadoConPedidoAnterior();
  const catalogo = cargarCatalogoPruebas();
  const interpretacionIA = interpretacionProductoNuevo();

  const resumen = resolverConsultaCatalogo(
    "Quiero un Chunky adulto razas pequeñas de 2kg",
    estado,
    catalogo,
    interpretacionIA
  );

  assert.equal(estado.esperandoConfirmacionPedido, true);
  assert.match(resumen, /¿Está todo correcto para confirmar el pedido?/);

  const confirmacion = resolverConsultaCatalogo("perfecto", estado, catalogo, null);

  assert.equal(estado.pedidoConfirmado, true);
  assert.equal(estado.esperandoConfirmacionPedido, false);
  assert.match(confirmacion, /pedido queda confirmado/i);
  assert.doesNotMatch(confirmacion, /información del pedido anterior/i);
});

test("una confirmacion con error ortografico usa la intencion semantica y no reemplaza el nombre", () => {
  const estado = crearEstadoConPedidoAnterior();
  const catalogo = cargarCatalogoPruebas();
  estado.pedidoConfirmado = false;
  estado.esperandoConfirmacionPedido = true;
  const interpretacionIA = {
    intencion: "confirmacion",
    accion: "confirmar",
    confianza: 0.96,
    producto: {},
    productos: [],
    entrega: {},
    datosCliente: {
      nombre: null,
      cedula: null,
      correo: null,
      celular: null,
    },
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const confirmacion = resolverConsultaCatalogo("perfect", estado, catalogo, interpretacionIA);

  assert.equal(estado.pedidoConfirmado, true);
  assert.equal(estado.datosDomicilio.nombre, "Dora Inés Zapata");
  assert.match(confirmacion, /pedido queda confirmado/i);
});

test("un si a reutilizar la direccion anterior confirma sin pedir otra aprobacion", () => {
  const estado = crearEstadoConPedidoAnterior();
  const catalogo = cargarCatalogoPruebas();
  estado.carrito = [
    {
      marca: "Chunky",
      referencia: "Adulto Razas Pequeñas",
      peso: "2kg",
      precio: 21000,
      cantidad: 1,
    },
  ];
  estado.pedidoConfirmado = false;
  estado.pedidoNuevoConDatosPrevios = true;
  estado.datosPreviosConfirmados = false;
  estado.esperandoConfirmacionDatosPrevios = true;

  const confirmacion = resolverConsultaCatalogo("sí por favor", estado, catalogo, null);

  assert.equal(estado.pedidoConfirmado, true);
  assert.equal(estado.esperandoConfirmacionPedido, false);
  assert.match(confirmacion, /pedido queda confirmado/i);
  assert.doesNotMatch(confirmacion, /¿Está todo correcto para confirmar el pedido?/);
});

test("el mismo producto con direccion nueva no suma el pedido anterior", () => {
  const estado = crearEstadoConPedidoAnterior();
  const catalogo = cargarCatalogoPruebas();
  const interpretacionIA = interpretacionProductoNuevo({
    marca: "Dog Chow",
    referencia: "Adulto Mini y Pequeño",
    cantidad: 1,
    direccion: "Calle 18 # 10-40 Centro",
  });

  resolverConsultaCatalogo(
    "Quiero un Dog Chow adulto raza pequeña 2kg para Calle 18 # 10-40 Centro",
    estado,
    catalogo,
    interpretacionIA
  );

  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].cantidad, 1);
  assert.equal(estado.datosDomicilio.direccion, "Calle 18 # 10-40 Centro");
});

test("un producto distinto con direccion nueva reemplaza solo la entrega anterior", () => {
  const estado = crearEstadoConPedidoAnterior();
  const catalogo = cargarCatalogoPruebas();
  const interpretacionIA = interpretacionProductoNuevo({
    direccion: "Calle 18 # 10-40 Centro",
  });

  resolverConsultaCatalogo(
    "Quiero un Chunky adulto razas pequeñas 2kg para Calle 18 # 10-40 Centro",
    estado,
    catalogo,
    interpretacionIA
  );

  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].marca, "Chunky");
  assert.equal(estado.datosDomicilio.direccion, "Calle 18 # 10-40 Centro");
  assert.equal(estado.datosDomicilio.nombre, "Dora Inés Zapata");
  assert.equal(estado.datosDomicilio.cedula, "42105604");
});
