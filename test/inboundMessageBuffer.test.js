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

test('espera 5 segundos desde el ultimo mensaje aunque otro llegue a los 3', t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const lotes=[];
  const buffer=crearBufferMensajesEntrantes({ventanaMs:DEFAULT_BUFFER_WINDOW_MS,alVaciar:eventos=>lotes.push(eventos)});
  t.after(()=>buffer.cerrar());
  buffer.agregar({channelUserId:'cliente-1',text:'Primero'});
  t.mock.timers.tick(3000);
  assert.equal(lotes.length,0);
  buffer.agregar({channelUserId:'cliente-1',text:'Segundo'});
  t.mock.timers.tick(4999);
  assert.equal(lotes.length,0);
  t.mock.timers.tick(1);
  assert.equal(lotes.length,1);
  assert.deepEqual(lotes[0].map(e=>e.text),['Primero','Segundo']);
});

for (const tipo of ['image', 'audio', 'voice']) test(`lote ${tipo} conserva diez mensajes y espera 10s desde el último`, t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const lotes = [];
  const buffer = crearBufferMensajesEntrantes({ ventanaMs: 5000, alVaciar: es => lotes.push(es) });
  t.after(() => buffer.cerrar());
  buffer.agregar({ channelUserId: 'A', text: 'Hola' });
  t.mock.timers.tick(4000);
  buffer.agregar({ channelUserId: 'A', media: { type: tipo }, messageId: 'media' });
  for (let i = 0; i < 8; i++) {
    t.mock.timers.tick(6000);
    assert.equal(lotes.length, 0);
    buffer.agregar({ channelUserId: 'A', text: `detalle ${i}` });
  }
  buffer.agregar({ channelUserId: 'B', text: 'solo texto' });
  t.mock.timers.tick(5000);
  assert.equal(lotes.length, 1); assert.equal(lotes[0][0].channelUserId, 'B');
  t.mock.timers.tick(4999); assert.equal(lotes.length, 1);
  t.mock.timers.tick(1); assert.equal(lotes[1].length, 10);
  buffer.agregar({ channelUserId: 'A', text: 'nuevo turno solo texto' });
  t.mock.timers.tick(5000); assert.equal(lotes.length, 3);
});
