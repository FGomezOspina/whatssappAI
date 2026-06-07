const assert = require("node:assert/strict");
const test = require("node:test");

const {
  construirSolicitudHumanizador,
  construirSolicitudInterprete,
} = require("../src/services/aiContextOptimizer");
const {
  clasificarInteraccion,
} = require("../src/services/interactionClassifier");

test("documenta las ventanas actuales por perfil", () => {
  const producto = clasificarInteraccion({
    mensaje: "precio de advance urinary",
    estado: {},
  });
  const pedido = clasificarInteraccion({
    mensaje: "el primero",
    estado: {
      referenciasPendientes: {
        marca: "ADVANCE",
        referencias: ["ADVANCE CAT URINARY", "ADVANCE URINAY"],
      },
    },
  });
  const multimedia = clasificarInteraccion({
    mensaje: "que precio tiene",
    estado: {},
    imageUrls: ["data:image/png;base64,abc"],
  });

  assert.equal(producto.perfilContexto, "producto");
  assert.equal(producto.limiteHistorial, 0);
  assert.equal(pedido.perfilContexto, "pedido");
  assert.equal(pedido.limiteHistorial, 3);
  assert.equal(multimedia.perfilContexto, "multimedia");
  assert.equal(multimedia.limiteHistorial, 0);
  assert.equal(multimedia.limiteEjemplos, 0);
});

test("producto activa dos mensajes de fallback solo ante una referencia implícita", () => {
  const implicita = clasificarInteraccion({
    mensaje: "cuánto vale ese",
    estado: {},
  });
  const explicita = clasificarInteraccion({
    mensaje: "precio de advance urinary",
    estado: {},
  });

  assert.equal(implicita.perfilContexto, "producto");
  assert.equal(implicita.limiteHistorial, 2);
  assert.equal(implicita.fallbackHistorialProductoCandidato, true);
  assert.equal(explicita.limiteHistorial, 0);
  assert.equal(explicita.fallbackHistorialProductoCandidato, false);
});

test("tiene en singular inicia busqueda de producto aunque haya contexto activo", () => {
  const clasificacion = clasificarInteraccion({
    mensaje: "TIENE AGILITY GOLD PERRO ADULTO?",
    estado: {
      productosConsultados: [
        {
          marca: "ADVANCE",
          referencia: "ADVANCE CAT URINARY",
          peso: "1.5kg",
        },
      ],
    },
  });

  assert.equal(clasificacion.intencion, "busqueda_producto");
  assert.equal(clasificacion.requiereBusquedaProducto, true);
});

test("si asi esta bien con carrito activo continua pedido y no busca producto", () => {
  const clasificacion = clasificarInteraccion({
    mensaje: "si asi esta bien",
    estado: {
      carrito: [
        {
          marca: "AGILITY",
          referencia: "AGILITY GATO AD",
          peso: "1.5kg",
          cantidad: 1,
        },
      ],
      esperandoConfirmacionDomicilio: true,
    },
  });

  assert.equal(clasificacion.perfilContexto, "pedido");
  assert.equal(clasificacion.requiereBusquedaProducto, false);
  assert.equal(clasificacion.fallbackHistorialProductoCandidato, false);
});

test("el interprete incluye mensajes del cliente y del asistente", () => {
  const clasificacion = {
    perfilContexto: "pedido",
    intencion: "continuacion",
    limiteHistorial: 3,
    limiteEjemplos: 0,
  };
  const solicitud = construirSolicitudInterprete({
    mensaje: "el primero",
    estado: { carrito: [] },
    catalogo: [],
    historialReciente: [
      { direction: "outbound", body: "mensaje asistente anterior" },
      { direction: "inbound", body: "mensaje cliente reciente" },
      { direction: "outbound", body: "ultima pregunta del asistente" },
    ],
    clasificacion,
    model: "gpt-test",
  });

  assert.deepEqual(solicitud.contexto.historial, [
    { rol: "asistente", texto: "mensaje asistente anterior" },
    { rol: "cliente", texto: "mensaje cliente reciente" },
    { rol: "asistente", texto: "ultima pregunta del asistente" },
  ]);
});

test("el turno de fallback de producto se conserva al reducir el presupuesto", () => {
  const anterior = process.env.AI_CONTEXT_BUDGET_INTERPRETER_PRODUCTO;
  process.env.AI_CONTEXT_BUDGET_INTERPRETER_PRODUCTO = "500";

  try {
    const solicitud = construirSolicitudInterprete({
      mensaje: "cuánto vale ese",
      estado: {},
      catalogo: [
        {
          marca: "MARCA",
          referencias: Array.from({ length: 8 }, (_, index) => ({
            nombre: `PRODUCTO ${index + 1}`,
            descripcion: "Descripción extensa para forzar reducción de contexto.",
            presentaciones: [{ peso: "3kg", precio: 10000 + index }],
          })),
        },
      ],
      historialReciente: [
        { direction: "inbound", body: "precio del producto 2" },
        {
          direction: "outbound",
          body: "PRODUCTO 2. Presentación 3kg: $10.001",
        },
      ],
      clasificacion: {
        perfilContexto: "producto",
        intencion: "referencia_producto",
        limiteHistorial: 2,
        limiteEjemplos: 0,
        fallbackHistorialProductoActivo: true,
      },
      model: "gpt-test",
    });

    assert.equal(solicitud.contexto.historial.length, 2);
    assert.doesNotMatch(
      solicitud.diagnostico.reducciones.join(","),
      /historial/
    );
  } finally {
    if (anterior === undefined) {
      delete process.env.AI_CONTEXT_BUDGET_INTERPRETER_PRODUCTO;
    } else {
      process.env.AI_CONTEXT_BUDGET_INTERPRETER_PRODUCTO = anterior;
    }
  }
});

test("el humanizador actual no recibe historial textual", () => {
  const solicitud = construirSolicitudHumanizador({
    mensaje: "si",
    respuestaBase: "Listo.",
    interpretacion: { intencion: "confirmacion", accion: "confirmar" },
    clasificacion: { perfilContexto: "pedido", intencion: "continuacion" },
    estado: { esperandoConfirmacionPedido: true },
    model: "gpt-test",
  });

  assert.equal("historial" in solicitud.contexto, false);
  assert.equal(solicitud.diagnostico.historialChars, 2);
});
