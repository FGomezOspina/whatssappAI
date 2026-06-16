const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_BUFFER_WINDOW_MS,
  crearBufferMensajesEntrantes,
  obtenerVentanaBufferMs,
} = require("../src/services/inboundMessageBuffer");

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("agrupa mensajes consecutivos del mismo cliente en un solo lote", async () => {
  const lotes = [];
  const buffer = crearBufferMensajesEntrantes({
    ventanaMs: 10,
    alVaciar: (eventos) => lotes.push(eventos),
  });

  buffer.agregar({ channelUserId: "cliente-1", text: "Hola" });
  buffer.agregar({ channelUserId: "cliente-1", text: "Quiero Dog Chow 2kg" });
  buffer.agregar({ channelUserId: "cliente-1", text: "Carrera 21 # 20-22" });
  await esperar(25);

  assert.equal(lotes.length, 1);
  assert.deepEqual(
    lotes[0].map((evento) => evento.text),
    ["Hola", "Quiero Dog Chow 2kg", "Carrera 21 # 20-22"]
  );
  buffer.cerrar();
});

test("mantiene separados los lotes de clientes distintos", async () => {
  const lotes = [];
  const buffer = crearBufferMensajesEntrantes({
    ventanaMs: 10,
    alVaciar: (eventos) => lotes.push(eventos),
  });

  buffer.agregar({ channelUserId: "cliente-1", text: "Hola" });
  buffer.agregar({ channelUserId: "cliente-2", text: "Buenas" });
  await esperar(25);

  assert.equal(lotes.length, 2);
  assert.deepEqual(
    lotes.map((eventos) => eventos[0].channelUserId).sort(),
    ["cliente-1", "cliente-2"]
  );
  buffer.cerrar();
});

test("mantiene separado el mismo usuario cuando escribe a numeros distintos", async () => {
  const lotes = [];
  const buffer = crearBufferMensajesEntrantes({
    ventanaMs: 10,
    alVaciar: (eventos) => lotes.push(eventos),
  });

  buffer.agregar({ phoneNumberId: "numero-1", channelUserId: "cliente-1", text: "Hola tienda 1" });
  buffer.agregar({ phoneNumberId: "numero-2", channelUserId: "cliente-1", text: "Hola tienda 2" });
  await esperar(25);

  assert.equal(lotes.length, 2);
  assert.deepEqual(
    lotes.map((eventos) => eventos[0].phoneNumberId).sort(),
    ["numero-1", "numero-2"]
  );
  buffer.cerrar();
});

test("reinicia la espera cada vez que llega otro mensaje del mismo cliente", async () => {
  const lotes = [];
  const buffer = crearBufferMensajesEntrantes({
    ventanaMs: 20,
    alVaciar: (eventos) => lotes.push(eventos),
  });

  buffer.agregar({ channelUserId: "cliente-1", text: "Necesito hacer otro pedido" });
  await esperar(12);
  buffer.agregar({ channelUserId: "cliente-1", text: "Dog Chow cachorro pequeño 1kg" });
  await esperar(12);

  assert.equal(lotes.length, 0);

  buffer.agregar({ channelUserId: "cliente-1", text: "para el mismo domicilio" });
  await esperar(30);

  assert.equal(lotes.length, 1);
  assert.deepEqual(
    lotes[0].map((evento) => evento.text),
    [
      "Necesito hacer otro pedido",
      "Dog Chow cachorro pequeño 1kg",
      "para el mismo domicilio",
    ]
  );
  buffer.cerrar();
});

test("usa ventana segura si la variable de entorno desactiva accidentalmente el buffer", () => {
  const anterior = process.env.INBOUND_MESSAGE_BUFFER_MS;
  process.env.INBOUND_MESSAGE_BUFFER_MS = "0";

  try {
    assert.equal(obtenerVentanaBufferMs(), DEFAULT_BUFFER_WINDOW_MS);
  } finally {
    if (anterior === undefined) delete process.env.INBOUND_MESSAGE_BUFFER_MS;
    else process.env.INBOUND_MESSAGE_BUFFER_MS = anterior;
  }
});
