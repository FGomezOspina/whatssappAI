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
