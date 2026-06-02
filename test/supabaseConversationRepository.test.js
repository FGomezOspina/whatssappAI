const test = require("node:test");
const assert = require("node:assert/strict");

const { buscarMensajesRecientes } = require("../src/repositories/supabaseConversationRepository");

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
