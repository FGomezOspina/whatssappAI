const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buscarMensajesRecientes,
  guardarConversacion,
  guardarPedidoConfirmado,
} = require("../src/repositories/supabaseConversationRepository");

test("carga historial reciente de Supabase por numero de WhatsApp", async () => {
  const urlAnterior = process.env.SUPABASE_URL;
  const secretAnterior = process.env.SUPABASE_SECRET_KEY;
  const fetchAnterior = global.fetch;
  let solicitud;

  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";
  global.fetch = async (url, opciones) => {
    solicitud = { url, opciones };
    return new Response(
      JSON.stringify([
        { direction: "outbound", body: "¿Qué necesitas?", created_at: "2026-05-30T12:01:00Z" },
        { direction: "inbound", body: "Hola", created_at: "2026-05-30T12:00:00Z" },
      ]),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  };

  try {
    const mensajes = await buscarMensajesRecientes("+573001112233", 8);

    assert.match(solicitud.url, /channel_user_id=eq\.%2B573001112233/);
    assert.match(solicitud.url, /order=created_at\.desc/);
    assert.match(solicitud.url, /limit=8/);
    assert.equal(solicitud.opciones.headers.Authorization, "Bearer supabase-test-secret");
    assert.deepEqual(
      mensajes.map((mensaje) => mensaje.body),
      ["Hola", "¿Qué necesitas?"]
    );
  } finally {
    global.fetch = fetchAnterior;

    if (urlAnterior === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = urlAnterior;

    if (secretAnterior === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = secretAnterior;
  }
});

test("persiste el estado confirmado e inserta el snapshot del pedido", async () => {
  const urlAnterior = process.env.SUPABASE_URL;
  const secretAnterior = process.env.SUPABASE_SECRET_KEY;
  const fetchAnterior = global.fetch;
  const solicitudes = [];
  const estado = {
    pedidoConfirmado: true,
    pedidoConfirmadoPendienteGuardar: true,
    confirmacionPedidoId: "pedido-confirmado-test",
    carrito: [
      {
        marca: "Dog Chow",
        referencia: "Adulto Mini y Pequeño",
        peso: "2kg",
        precio: 36000,
        cantidad: 2,
      },
    ],
    datosDomicilio: {
      nombre: "Dora Inés Zapata",
      cedula: "1004755939",
      celular: "3124138191",
      correo: "fabio@gmail.com",
      direccion: "Carrera 21 No 20b22 barrio providencia",
    },
    entrega: { tipo: "domicilio", sede: null },
    metodoPago: "efectivo",
  };

  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";
  global.fetch = async (url, opciones) => {
    solicitudes.push({ url, opciones });
    return new Response(JSON.stringify([{ id: "row-test" }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await guardarConversacion("+573001112233", estado, {
      mensaje: "sí",
      respuesta: "Listo, tu pedido queda confirmado con esos datos.",
    });
    await guardarPedidoConfirmado("+573001112233", "conversation-test", estado);

    const conversacion = solicitudes.find((solicitud) =>
      solicitud.url.includes("/rest/v1/whatsapp_conversations")
    );
    const pedido = solicitudes.find((solicitud) => solicitud.url.includes("/rest/v1/whatsapp_orders"));
    const payloadConversacion = JSON.parse(conversacion.opciones.body);
    const payloadPedido = JSON.parse(pedido.opciones.body);

    assert.equal(payloadConversacion.status, "pedido_confirmado");
    assert.equal(payloadPedido.status, "confirmado");
    assert.equal(payloadPedido.total, 72000);
    assert.equal(payloadPedido.order_key, "pedido-confirmado-test");
    assert.equal(estado.pedidoConfirmadoPendienteGuardar, false);
  } finally {
    global.fetch = fetchAnterior;

    if (urlAnterior === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = urlAnterior;

    if (secretAnterior === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = secretAnterior;
  }
});

test("persiste conversaciones y pedidos asociados al cliente multiempresa", async () => {
  const urlAnterior = process.env.SUPABASE_URL;
  const secretAnterior = process.env.SUPABASE_SECRET_KEY;
  const fetchAnterior = global.fetch;
  const solicitudes = [];
  const estado = {
    pedidoConfirmado: true,
    pedidoConfirmadoPendienteGuardar: true,
    confirmacionPedidoId: "pedido-cliente-test",
    carrito: [
      {
        marca: "Chunky",
        referencia: "Adulto Todas las Razas",
        peso: "2kg",
        precio: 32000,
        cantidad: 1,
      },
    ],
    datosDomicilio: {},
    entrega: { tipo: "domicilio", sede: null },
    metodoPago: "efectivo",
  };
  const cliente = { id: "client-test", slug: "distrifinca" };

  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";
  global.fetch = async (url, opciones) => {
    solicitudes.push({ url, opciones });
    return new Response(JSON.stringify([{ id: "row-test" }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await guardarConversacion("+573001112233", estado, {
      cliente,
      mensaje: "sí",
      respuesta: "Listo.",
    });
    await guardarPedidoConfirmado("+573001112233", "conversation-test", estado, cliente);

    const conversacion = solicitudes.find((solicitud) =>
      solicitud.url.includes("/rest/v1/whatsapp_conversations")
    );
    const pedido = solicitudes.find((solicitud) => solicitud.url.includes("/rest/v1/whatsapp_orders"));
    const payloadConversacion = JSON.parse(conversacion.opciones.body);
    const payloadPedido = JSON.parse(pedido.opciones.body);

    assert.match(conversacion.url, /on_conflict=client_id,channel_user_id/);
    assert.match(pedido.url, /on_conflict=client_id,channel_user_id,order_key/);
    assert.equal(payloadConversacion.client_id, "client-test");
    assert.equal(payloadPedido.client_id, "client-test");
  } finally {
    global.fetch = fetchAnterior;

    if (urlAnterior === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = urlAnterior;

    if (secretAnterior === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = secretAnterior;
  }
});
