const test = require("node:test");
const assert = require("node:assert/strict");

const { crearBufferMensajesEntrantes } = require("../src/services/inboundMessageBuffer");

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
