const assert = require("node:assert/strict");
const test = require("node:test");

const {
  logContextoProducto,
  logContextoRecuperado,
  logPayloadOpenAI,
} = require("../src/services/aiContextAuditLogger");

function capturarLogs(ejecutar) {
  const lineas = [];
  ejecutar({
    log: (linea) => lineas.push(linea),
  });
  return lineas;
}

test("los logs de payload permanecen apagados por defecto", () => {
  const anterior = process.env.AI_CONTEXT_PAYLOAD_LOGS;
  delete process.env.AI_CONTEXT_PAYLOAD_LOGS;

  try {
    const lineas = capturarLogs((logger) =>
      logPayloadOpenAI({
        logger,
        etapa: "interprete",
        model: "modelo",
        messages: [{ role: "user", content: "hola" }],
      })
    );
    assert.deepEqual(lineas, []);
  } finally {
    if (anterior === undefined) delete process.env.AI_CONTEXT_PAYLOAD_LOGS;
    else process.env.AI_CONTEXT_PAYLOAD_LOGS = anterior;
  }
});

test("registra historial inbound y outbound cuando se habilita", () => {
  const anterior = process.env.AI_CONTEXT_PAYLOAD_LOGS;
  process.env.AI_CONTEXT_PAYLOAD_LOGS = "true";

  try {
    const lineas = capturarLogs((logger) =>
      logContextoRecuperado({
        logger,
        cliente: { slug: "distrifinca" },
        channelUserId: "usuario",
        clasificacion: {
          perfilContexto: "pedido",
          intencion: "continuacion",
          limiteHistorial: 3,
        },
        historial: [
          { direction: "inbound", body: "quiero el primero" },
          { direction: "outbound", body: "¿el de 3kg?" },
        ],
        estado: { ultimaSeleccion: { referencia: "Producto" } },
      })
    );

    assert.equal(lineas.length, 1);
    assert.match(lineas[0], /"inbound":1/);
    assert.match(lineas[0], /"outbound":1/);
    assert.match(lineas[0], /quiero el primero/);
    assert.match(lineas[0], /¿el de 3kg\?/);
  } finally {
    if (anterior === undefined) delete process.env.AI_CONTEXT_PAYLOAD_LOGS;
    else process.env.AI_CONTEXT_PAYLOAD_LOGS = anterior;
  }
});

test("registra el payload textual pero omite el contenido base64 de imagen", () => {
  const anterior = process.env.AI_CONTEXT_PAYLOAD_LOGS;
  process.env.AI_CONTEXT_PAYLOAD_LOGS = "true";
  const imagen = `data:image/png;base64,${"a".repeat(100)}`;

  try {
    const lineas = capturarLogs((logger) =>
      logPayloadOpenAI({
        logger,
        etapa: "interprete",
        model: "gpt-test",
        perfil: "multimedia",
        messages: [
          { role: "system", content: "reglas exactas" },
          {
            role: "user",
            content: [
              { type: "text", text: '{"mensaje":"precio"}' },
              {
                type: "image_url",
                image_url: { url: imagen, detail: "high" },
              },
            ],
          },
        ],
      })
    );

    assert.match(lineas[0], /reglas exactas/);
    assert.match(lineas[0], /\\"mensaje\\":\\"precio\\"/);
    assert.match(lineas[0], /"contenidoOmitido":true/);
    assert.doesNotMatch(lineas[0], /a{50}/);
  } finally {
    if (anterior === undefined) delete process.env.AI_CONTEXT_PAYLOAD_LOGS;
    else process.env.AI_CONTEXT_PAYLOAD_LOGS = anterior;
  }
});

test("registra la decisión del contexto de producto con variable independiente", () => {
  const anterior = process.env.PRODUCT_CONTEXT_LOGS;
  const lineas = [];
  process.env.PRODUCT_CONTEXT_LOGS = "true";

  try {
    logContextoProducto({
      logger: { log: (linea) => lineas.push(linea) },
      fase: "resuelto_por_estado",
      mensaje: "el primero",
      estado: {
        referenciasPendientes: {
          referencias: ["Producto A", "Producto B"],
        },
      },
      resolucion: { resuelta: true, origen: "referenciasPendientes" },
    });

    assert.equal(lineas.length, 1);
    assert.match(lineas[0], /\[Product Context\]/);
    assert.match(lineas[0], /resuelto_por_estado/);
    assert.match(lineas[0], /referenciasPendientes/);
  } finally {
    if (anterior === undefined) delete process.env.PRODUCT_CONTEXT_LOGS;
    else process.env.PRODUCT_CONTEXT_LOGS = anterior;
  }
});
