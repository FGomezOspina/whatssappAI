const assert = require("node:assert/strict");
const test = require("node:test");

const { crearEstadoInicial } = require("../src/conversation/conversationStore");
const {
  esSenalReferenciaProducto,
  establecerProductosConsultados,
  guardarCoincidenciasProductoPendientes,
  historialRepresentaInteraccionProducto,
  reiniciarFocoProducto,
  resolverSeleccionProductoPendiente,
} = require("../src/services/pendingProductMatchService");
const {
  respuestaValidacionProducto,
} = require("../src/services/productMatchValidator");

const catalogo = [
  {
    marca: "ADVANCE",
    referencias: [
      {
        nombre: "ADVANCE CAT URINARY",
        especie: "gato",
        presentaciones: [{ peso: "3kg", precio: 196000, stock: true }],
      },
      {
        nombre: "ADVANCE URINAY",
        especie: "perro",
        presentaciones: [{ peso: "1.5kg", precio: 108000, stock: null }],
      },
    ],
  },
];

function validacionAmbigua() {
  return {
    nivel: "media",
    razon: "ambigua",
    etiqueta: "advance urinary",
    alternativas: [
      {
        marca: "ADVANCE",
        referencia: "ADVANCE CAT URINARY",
        presentaciones: [{ peso: "3kg", precio: 196000, stock: true }],
      },
      {
        marca: "ADVANCE",
        referencia: "ADVANCE URINAY",
        presentaciones: [{ peso: "1.5kg", precio: 108000, stock: null }],
      },
    ],
  };
}

test("guarda temporalmente las coincidencias mostradas con sus presentaciones", () => {
  const estado = crearEstadoInicial();
  guardarCoincidenciasProductoPendientes(estado, validacionAmbigua(), {
    intencionOriginal: "qué precio tiene advance urinary",
    tipoIntencion: "precio",
  });

  assert.equal(estado.coincidenciasProductoPendientes.opciones.length, 2);
  assert.equal(
    estado.coincidenciasProductoPendientes.opciones[0].referencia,
    "ADVANCE CAT URINARY"
  );
  assert.equal(
    estado.coincidenciasProductoPendientes.opciones[0].presentaciones[0].precio,
    196000
  );
  assert.ok(estado.coincidenciasProductoPendientes.expiraEn);
  assert.equal(estado.referenciasPendientes.referencias.length, 2);
  assert.equal(estado.ultimaSeleccion.pendiente, true);
  assert.equal(estado.productosConsultados.length, 2);
  assert.equal(
    estado.ultimaInteraccionProducto.intencionOriginal,
    "qué precio tiene advance urinary"
  );
  assert.equal(estado.ultimaInteraccionProducto.tipoIntencion, "precio");
  assert.ok(estado.ultimaInteraccionProducto.creadoEn);
  assert.equal(estado.ultimaInteraccionProducto.turnoCreacion, 1);
});

test("la respuesta ambigua muestra precios de todas las coincidencias", () => {
  const respuesta = respuestaValidacionProducto(validacionAmbigua());

  assert.match(respuesta, /ADVANCE CAT URINARY.*3kg: \$196\.000/i);
  assert.match(respuesta, /ADVANCE URINAY.*1\.5kg: \$108\.000/i);
  assert.match(respuesta, /¿Cuál te sirve\?/i);
  assert.doesNotMatch(
    respuesta,
    /Revisando la foto|¿Es esa\?|coincidencia exacta|responder con el número/i
  );
});

test("selecciona por nombre completo sin volver a buscar ni pedir aclaración", () => {
  const estado = crearEstadoInicial();
  guardarCoincidenciasProductoPendientes(estado, validacionAmbigua());

  const resultado = resolverSeleccionProductoPendiente({
    mensaje: "advance cat urinary",
    estado,
    catalogo,
  });

  assert.equal(resultado.resuelta, true);
  assert.equal(resultado.seleccion.referencia, "ADVANCE CAT URINARY");
  assert.match(resultado.respuesta, /3kg: \$196\.000/);
  assert.match(resultado.respuesta, /disponible/i);
  assert.match(resultado.respuesta, /agregar alguna presentación/i);
  assert.equal(estado.coincidenciasProductoPendientes, null);
  assert.equal(estado.ultimaSeleccion.referencia, "ADVANCE CAT URINARY");
  assert.equal(estado.productosConsultados[0].peso, "3kg");
});

test("selecciona por fragmento distintivo y por número de opción", () => {
  const estadoFragmento = crearEstadoInicial();
  guardarCoincidenciasProductoPendientes(estadoFragmento, validacionAmbigua());
  const fragmento = resolverSeleccionProductoPendiente({
    mensaje: "la de cat urinary",
    estado: estadoFragmento,
    catalogo,
  });
  assert.equal(fragmento.seleccion.referencia, "ADVANCE CAT URINARY");

  const estadoNumero = crearEstadoInicial();
  guardarCoincidenciasProductoPendientes(estadoNumero, validacionAmbigua());
  const numero = resolverSeleccionProductoPendiente({
    mensaje: "opción 2",
    estado: estadoNumero,
    catalogo,
  });
  assert.equal(numero.seleccion.referencia, "ADVANCE URINAY");
});

test("resuelve ordinales, afirmaciones y referencias implícitas sin búsqueda nueva", () => {
  const casos = [
    ["el primero", "ADVANCE CAT URINARY"],
    ["el segundo", "ADVANCE URINAY"],
    ["advance cat urinary", "ADVANCE CAT URINARY"],
  ];

  casos.forEach(([mensaje, referencia]) => {
    const estado = crearEstadoInicial();
    guardarCoincidenciasProductoPendientes(estado, validacionAmbigua());
    const resultado = resolverSeleccionProductoPendiente({
      mensaje,
      estado,
      catalogo,
    });
    assert.equal(resultado.resuelta, true);
    assert.equal(resultado.seleccion.referencia, referencia);
  });

  const estadoAfirmacion = crearEstadoInicial();
  guardarCoincidenciasProductoPendientes(estadoAfirmacion, {
    ...validacionAmbigua(),
    alternativas: validacionAmbigua().alternativas.slice(0, 1),
  });
  const afirmacion = resolverSeleccionProductoPendiente({
    mensaje: "sí",
    estado: estadoAfirmacion,
    catalogo,
  });
  assert.equal(afirmacion.seleccion.referencia, "ADVANCE CAT URINARY");
  assert.match(afirmacion.respuesta, /3kg: \$196\.000/);
});

test("el peso selecciona la referencia correcta y no se interpreta como número de opción", () => {
  const estado = crearEstadoInicial();
  guardarCoincidenciasProductoPendientes(estado, validacionAmbigua());

  const resultado = resolverSeleccionProductoPendiente({
    mensaje: "cuánto vale el de 3kg",
    estado,
    catalogo,
  });

  assert.equal(resultado.resuelta, true);
  assert.equal(resultado.seleccion.referencia, "ADVANCE CAT URINARY");
  assert.equal(resultado.seleccion.presentacion, "3kg");
  assert.match(resultado.respuesta, /3kg: \$196\.000/);
  assert.doesNotMatch(resultado.respuesta, /1\.5kg/);
});

test("reconstruye la selección desde referencias, última selección o productos consultados", () => {
  const desdeReferencias = crearEstadoInicial();
  guardarCoincidenciasProductoPendientes(desdeReferencias, validacionAmbigua());
  desdeReferencias.coincidenciasProductoPendientes = null;
  desdeReferencias.ultimaSeleccion = null;
  desdeReferencias.productosConsultados = [];
  const resultadoReferencias = resolverSeleccionProductoPendiente({
    mensaje: "el segundo",
    estado: desdeReferencias,
    catalogo,
  });
  assert.equal(resultadoReferencias.seleccion.referencia, "ADVANCE URINAY");

  const desdeUltima = crearEstadoInicial();
  desdeUltima.ultimaSeleccion = {
    marca: "ADVANCE",
    referencia: "ADVANCE CAT URINARY",
    presentacion: null,
    cantidad: 1,
  };
  const resultadoUltima = resolverSeleccionProductoPendiente({
    mensaje: "cuánto vale ese",
    estado: desdeUltima,
    catalogo,
  });
  assert.equal(resultadoUltima.seleccion.referencia, "ADVANCE CAT URINARY");

  const desdeConsultados = crearEstadoInicial();
  desdeConsultados.productosConsultados = [
    {
      marca: "ADVANCE",
      referencia: "ADVANCE CAT URINARY",
      peso: "3kg",
      precio: 196000,
      stock: true,
    },
  ];
  const resultadoConsultados = resolverSeleccionProductoPendiente({
    mensaje: "quiero ese",
    estado: desdeConsultados,
    catalogo,
  });
  assert.equal(
    resultadoConsultados.seleccion.referencia,
    "ADVANCE CAT URINARY"
  );
});

test("una afirmación ambigua conserva las opciones y no elige silenciosamente", () => {
  const estado = crearEstadoInicial();
  guardarCoincidenciasProductoPendientes(estado, validacionAmbigua());

  const resultado = resolverSeleccionProductoPendiente({
    mensaje: "sí",
    estado,
    catalogo,
  });

  assert.equal(resultado.resuelta, false);
  assert.match(resultado.respuesta, /Quiero asegurarme de darte el precio correcto/i);
  assert.ok(estado.coincidenciasProductoPendientes);
});

test("un sí posterior a una selección concreta se delega al motor de pedido", () => {
  const { resolverConsultaCatalogo } = require("../src/verticals/petshop/orderLogic");
  const estado = crearEstadoInicial();
  estado.ultimaSeleccion = {
    marca: "ADVANCE",
    referencia: "ADVANCE CAT URINARY",
    presentacion: null,
    cantidad: 1,
  };

  const resultado = resolverSeleccionProductoPendiente({
    mensaje: "sí",
    estado,
    catalogo,
  });

  assert.equal(resultado.delegarMotorPedido, true);
  assert.equal(resultado.origen, "ultimaSeleccion");
  assert.equal(estado.ultimaSeleccion.referencia, "ADVANCE CAT URINARY");

  const respuesta = resolverConsultaCatalogo("sí", estado, catalogo, null);
  assert.match(respuesta, /agregado al pedido/i);
  assert.equal(estado.carrito.length, 1);
});

test("una búsqueda claramente nueva limpia solo el contexto temporal mostrado", () => {
  const estado = crearEstadoInicial();
  guardarCoincidenciasProductoPendientes(estado, validacionAmbigua());
  estado.carrito = [{ referencia: "PRODUCTO YA AGREGADO" }];

  const resultado = resolverSeleccionProductoPendiente({
    mensaje: "bravecto",
    estado,
    catalogo,
    nuevaBusquedaProducto: true,
  });

  assert.equal(resultado, null);
  assert.equal(estado.coincidenciasProductoPendientes, null);
  assert.equal(estado.referenciasPendientes, null);
  assert.equal(estado.ultimaSeleccion, null);
  assert.deepEqual(estado.productosConsultados, []);
  assert.equal(estado.carrito.length, 1);
});

test("una referencia explícita con otra presentación no queda pegada a la selección anterior", () => {
  const estado = crearEstadoInicial();
  estado.ultimaSeleccion = {
    marca: "ADVANCE",
    referencia: "ADVANCE CAT URINARY",
    presentacion: null,
    cantidad: 1,
  };
  estado.productosConsultados = [
    {
      marca: "ADVANCE",
      referencia: "ADVANCE CAT URINARY",
      peso: "3kg",
      precio: 196000,
    },
  ];

  const resultado = resolverSeleccionProductoPendiente({
    mensaje: "advance urinary 1.5kg",
    estado,
    catalogo,
    nuevaBusquedaProducto: true,
  });

  assert.equal(resultado, null);
  assert.equal(estado.ultimaSeleccion, null);
  assert.deepEqual(estado.productosConsultados, []);
});

test("detecta señales y un turno previo de producto para el fallback mínimo", () => {
  assert.equal(esSenalReferenciaProducto("ese"), true);
  assert.equal(esSenalReferenciaProducto("el primero"), true);
  assert.equal(esSenalReferenciaProducto("cuánto vale el de 3kg"), true);
  assert.equal(esSenalReferenciaProducto("si asi esta bien"), false);
  assert.equal(esSenalReferenciaProducto("está bien"), false);
  assert.equal(esSenalReferenciaProducto("bravecto"), false);
  assert.equal(
    historialRepresentaInteraccionProducto([
      {
        direction: "outbound",
        body: "Presentaciones y precios:\n- 3kg: $196.000",
      },
    ]),
    true
  );
  assert.equal(
    historialRepresentaInteraccionProducto([
      { direction: "outbound", body: "Hola, ¿cómo puedo ayudarte?" },
    ]),
    false
  );
});

test("una respuesta que sigue siendo ambigua conserva solo las opciones previas", () => {
  const estado = crearEstadoInicial();
  guardarCoincidenciasProductoPendientes(estado, validacionAmbigua());

  const resultado = resolverSeleccionProductoPendiente({
    mensaje: "advance urinary",
    estado,
    catalogo,
  });

  assert.equal(resultado.resuelta, false);
  assert.match(resultado.respuesta, /Tengo estas referencias/i);
  assert.match(resultado.respuesta, /ADVANCE CAT URINARY/);
  assert.ok(estado.coincidenciasProductoPendientes);
});

test("responder solo con la marca no selecciona silenciosamente la primera opción", () => {
  const estado = crearEstadoInicial();
  guardarCoincidenciasProductoPendientes(estado, validacionAmbigua());

  const resultado = resolverSeleccionProductoPendiente({
    mensaje: "advance",
    estado,
    catalogo,
  });

  assert.equal(resultado.resuelta, false);
  assert.match(resultado.respuesta, /Tengo estas referencias/i);
});

test("la presentación elegida se puede agregar en el turno siguiente", () => {
  const { resolverConsultaCatalogo } = require("../src/verticals/petshop/orderLogic");
  const estado = crearEstadoInicial();
  guardarCoincidenciasProductoPendientes(estado, validacionAmbigua());
  resolverSeleccionProductoPendiente({
    mensaje: "advance cat urinary",
    estado,
    catalogo,
  });

  const respuesta = resolverConsultaCatalogo(
    "agrega la de 3kg",
    estado,
    catalogo,
    null
  );

  assert.match(respuesta, /ADVANCE CAT URINARY 3kg/i);
  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].referencia, "ADVANCE CAT URINARY");
});

test("ignora y limpia un contexto temporal vencido", () => {
  const estado = crearEstadoInicial();
  guardarCoincidenciasProductoPendientes(estado, validacionAmbigua());
  estado.coincidenciasProductoPendientes.expiraEn = new Date(
    Date.now() - 1000
  ).toISOString();

  const resultado = resolverSeleccionProductoPendiente({
    mensaje: "advance cat urinary",
    estado,
    catalogo,
  });

  assert.equal(resultado, null);
  assert.equal(estado.coincidenciasProductoPendientes, null);
});

test("una presentación consolidada se delega al motor para agregarla al pedido", () => {
  const estado = crearEstadoInicial();
  estado.productosConsultados = [
    {
      marca: "ADVANCE",
      referencia: "ADVANCE CAT URINARY",
      familiaReferencia: "ADVANCE CAT URINARY",
      referenciasEquivalentes: [
        "ADVANCE CAT URINARY",
        "ADVANCE URINAY",
      ],
      peso: "3kg",
      precio: 196000,
    },
    {
      marca: "ADVANCE",
      referencia: "ADVANCE URINAY",
      familiaReferencia: "ADVANCE CAT URINARY",
      referenciasEquivalentes: [
        "ADVANCE CAT URINARY",
        "ADVANCE URINAY",
      ],
      peso: "1.5kg",
      precio: 108000,
    },
  ];
  estado.ultimaInteraccionProducto = {
    creadoEn: new Date().toISOString(),
  };

  const resultado = resolverSeleccionProductoPendiente({
    mensaje: "el de 1.5kg",
    estado,
    catalogo,
  });

  assert.equal(resultado.resuelta, true);
  assert.equal(resultado.delegarMotorPedido, true);
  assert.equal(resultado.mensajeMotor, "agrega 1.5kg");
  assert.equal(resultado.seleccion.referencia, "ADVANCE URINAY");
  assert.equal(resultado.seleccion.presentacion, "1.5kg");
});

test("una pregunta de precio sobre una presentación consultada no se agrega al pedido", () => {
  const estado = crearEstadoInicial();
  estado.productosConsultados = [
    {
      marca: "ADVANCE",
      referencia: "ADVANCE URINAY",
      peso: "1.5kg",
      precio: 108000,
    },
  ];
  estado.ultimaInteraccionProducto = {
    creadoEn: new Date().toISOString(),
  };

  const resultado = resolverSeleccionProductoPendiente({
    mensaje: "cuánto vale el de 1.5kg",
    estado,
    catalogo,
  });

  assert.equal(resultado.resuelta, true);
  assert.equal(resultado.delegarMotorPedido, undefined);
  assert.equal(resultado.seleccion.referencia, "ADVANCE URINAY");
  assert.match(resultado.respuesta, /1\.5kg: \$108\.000/);
});

test("selecciona una presentación distinta mostrada en la misma referencia", () => {
  const estado = crearEstadoInicial();
  const catalogoMultiple = [
    {
      marca: "AGILITY",
      referencias: [
        {
          nombre: "AGILITY GATO AD",
          especie: "gato",
          presentaciones: [
            { peso: "1.5kg", precio: 41000, stock: null },
            { peso: "3kg", precio: 78000, stock: null },
            { peso: "500gr", precio: 14300, stock: null },
          ],
        },
      ],
    },
  ];
  estado.productosConsultados = [
    {
      marca: "AGILITY",
      referencia: "AGILITY GATO AD",
      peso: "1.5kg",
      precio: 41000,
      presentaciones: [
        { peso: "1.5kg", precio: 41000 },
        { peso: "3kg", precio: 78000 },
        { peso: "500gr", precio: 14300 },
      ],
    },
  ];
  estado.ultimaInteraccionProducto = {
    creadoEn: new Date().toISOString(),
  };

  const resultado = resolverSeleccionProductoPendiente({
    mensaje: "el de 3kg",
    estado,
    catalogo: catalogoMultiple,
  });

  assert.equal(resultado.resuelta, true);
  assert.equal(resultado.delegarMotorPedido, true);
  assert.equal(resultado.mensajeMotor, "agrega 3kg");
  assert.equal(resultado.seleccion.referencia, "AGILITY GATO AD");
  assert.equal(resultado.seleccion.presentacion, "3kg");
});

test("conserva cotizaciones distintas aunque cambie el producto activo", () => {
  const estado = crearEstadoInicial();
  establecerProductosConsultados(estado, [
    {
      marca: "ADVANCE",
      referencia: "ADVANCE CAT URINARY",
      peso: "3kg",
      precio: 196000,
      stock: true,
    },
  ]);
  establecerProductosConsultados(estado, [
    {
      marca: "ADVANCE",
      referencia: "ADVANCE URINAY",
      peso: "1.5kg",
      precio: 108000,
    },
  ]);

  assert.equal(estado.productosConsultados.length, 1);
  assert.equal(estado.productosConsultados[0].referencia, "ADVANCE URINAY");
  assert.equal(estado.historialProductosConsultados.length, 2);
  assert.equal(
    estado.historialProductosConsultados[0].referencia,
    "ADVANCE CAT URINARY"
  );
  assert.equal(
    estado.historialProductosConsultados[1].referencia,
    "ADVANCE URINAY"
  );
});

test("una búsqueda nueva limpia el foco pero conserva el historial cotizado", () => {
  const estado = crearEstadoInicial();
  estado.marca = "ADVANCE";
  estado.criterios = { condiciones: ["urinario"] };
  estado.ultimaSeleccion = {
    marca: "ADVANCE",
    referencia: "ADVANCE CAT URINARY",
  };
  estado.ultimaInteraccionProducto = {
    intencionOriginal: "foto anterior",
    tipoIntencion: "consulta_producto",
  };
  establecerProductosConsultados(estado, [
    {
      marca: "ADVANCE",
      referencia: "ADVANCE CAT URINARY",
      peso: "3kg",
      precio: 196000,
    },
  ]);

  reiniciarFocoProducto(estado);

  assert.equal(estado.marca, null);
  assert.deepEqual(estado.criterios, {});
  assert.equal(estado.ultimaSeleccion, null);
  assert.equal(estado.ultimaInteraccionProducto, null);
  assert.deepEqual(estado.productosConsultados, []);
  assert.equal(estado.historialProductosConsultados.length, 1);
});

test("regálame el primero selecciona la primera cotización histórica", () => {
  const { resolverConsultaCatalogo } = require("../src/verticals/petshop/orderLogic");
  const estado = crearEstadoInicial();
  establecerProductosConsultados(estado, [
    {
      marca: "ADVANCE",
      referencia: "ADVANCE CAT URINARY",
      peso: "3kg",
      precio: 196000,
      stock: true,
    },
  ]);
  establecerProductosConsultados(estado, [
    {
      marca: "ADVANCE",
      referencia: "ADVANCE URINAY",
      peso: "1.5kg",
      precio: 108000,
    },
  ]);

  const seleccion = resolverSeleccionProductoPendiente({
    mensaje: "regálame el primero por fa",
    estado,
    catalogo,
  });

  assert.equal(seleccion.delegarMotorPedido, true);
  assert.equal(seleccion.origen, "historialProductosConsultados");
  assert.equal(seleccion.seleccion.referencia, "ADVANCE CAT URINARY");
  assert.equal(seleccion.seleccion.presentacion, "3kg");

  const respuesta = resolverConsultaCatalogo(
    seleccion.mensajeMotor,
    estado,
    catalogo,
    null
  );
  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].referencia, "ADVANCE CAT URINARY");
  assert.match(respuesta, /agrego al pedido/i);
});

test("los ordinales históricos soportan hasta la décima cotización", () => {
  assert.equal(
    require("../src/services/pendingProductMatchService")._internals.indiceOrdinal(
      "déjame el décimo",
      10
    ),
    9
  );
});
