const assert = require("node:assert/strict");
const test = require("node:test");

const {
  aplicarCoincidenciaValidada,
  respuestaValidacionProducto,
  validarCoincidenciaProducto,
} = require("../src/services/productMatchValidator");

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
