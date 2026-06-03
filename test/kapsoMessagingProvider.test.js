const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  enviarTexto,
  extraerEventos,
  normalizarEvento,
  verificarFirmaWebhook,
} = require("../src/providers/kapsoMessagingProvider");

test("normaliza un mensaje de texto Kapso v2", () => {
  const evento = normalizarEvento(
    {
      message: {
        id: "wamid.123",
        type: "text",
        from: "573001112233",
        text: { body: "Hola" },
        kapso: { direction: "inbound", content: "Hola" },
      },
      conversation: { id: "conv_123", phone_number_id: "phone_123" },
      phone_number_id: "phone_123",
    },
    {
      "x-webhook-event": "whatsapp.message.received",
      "x-idempotency-key": "evt_123",
    }
  );

  assert.equal(evento.channelUserId, "573001112233");
  assert.equal(evento.recipientId, "573001112233");
  assert.equal(evento.text, "Hola");
  assert.equal(evento.phoneNumberId, "phone_123");
  assert.equal(evento.idempotencyKey, "wamid.123");
});

test("extrae URL publica de una imagen Kapso", () => {
  const [evento] = extraerEventos(
    {
      message: {
        id: "wamid.image",
        type: "image",
        from: "573001112233",
        image: { caption: "Cuanto vale este producto?" },
        kapso: {
          direction: "inbound",
          media_url: "https://api.kapso.ai/media/image-token",
          media_data: { filename: "foto.jpg", content_type: "image/jpeg" },
        },
      },
      phone_number_id: "phone_123",
    },
    { "x-webhook-event": "whatsapp.message.received" }
  );

  assert.equal(evento.media.type, "image");
  assert.equal(evento.media.url, "https://api.kapso.ai/media/image-token");
  assert.equal(evento.text, "Cuanto vale este producto?");
});

test("extrae multimedia desde fileUrl y attachment sin exponer dependencia a un solo campo", () => {
  const [evento] = extraerEventos(
    {
      message: {
        id: "wamid.image.alt",
        type: "image",
        from: "573001112233",
        image: { id: "media-image-id", caption: "Tienen esta referencia" },
        attachment: {
          fileUrl: "https://api.kapso.ai/media/file-token",
          mimetype: "image/jpeg",
          filename: "referencia.jpg",
        },
        kapso: { direction: "inbound" },
      },
      phone_number_id: "phone_123",
    },
    { "x-webhook-event": "whatsapp.message.received" }
  );

  assert.equal(evento.text, "Tienen esta referencia");
  assert.equal(evento.media.type, "image");
  assert.equal(evento.media.url, "https://api.kapso.ai/media/file-token");
  assert.equal(evento.media.mediaId, "media-image-id");
  assert.equal(evento.media.contentType, "image/jpeg");
});

test("normaliza notas de voz como audio real", () => {
  const [evento] = extraerEventos(
    {
      message: {
        id: "wamid.voice",
        type: "voice",
        from: "573001112233",
        voice: {
          id: "media-voice-id",
          url: "https://api.kapso.ai/media/voice-token",
          mime_type: "audio/ogg",
        },
        kapso: { direction: "inbound" },
      },
      phone_number_id: "phone_123",
    },
    { "x-webhook-event": "whatsapp.message.received" }
  );

  assert.equal(evento.messageType, "voice");
  assert.equal(evento.media.type, "audio");
  assert.equal(evento.media.url, "https://api.kapso.ai/media/voice-token");
  assert.equal(evento.media.mediaId, "media-voice-id");
  assert.equal(evento.media.contentType, "audio/ogg");
});

test("extrae transcripcion y URL de audio Kapso", () => {
  const [evento] = extraerEventos(
    {
      message: {
        id: "wamid.audio",
        type: "audio",
        from: "573001112233",
        kapso: {
          direction: "inbound",
          transcript: { text: "Necesito un pedido" },
          media_url: "https://api.kapso.ai/media/audio-token",
          media_data: { filename: "nota.ogg", content_type: "audio/ogg" },
        },
      },
      phone_number_id: "phone_123",
    },
    { "x-webhook-event": "whatsapp.message.received" }
  );

  assert.equal(evento.media.type, "audio");
  assert.equal(evento.media.transcript, "Necesito un pedido");
  assert.equal(evento.text, "");
});

test("deduplica mensajes bufferizados por message.id", () => {
  const eventos = extraerEventos(
    {
      data: [
        {
          message: {
            id: "wamid.batch.1",
            type: "text",
            from: "573001112233",
            text: { body: "Hola" },
            kapso: { direction: "inbound" },
          },
          phone_number_id: "phone_123",
        },
        {
          message: {
            id: "wamid.batch.2",
            type: "text",
            from: "573001112233",
            text: { body: "Necesito un pedido" },
            kapso: { direction: "inbound" },
          },
          phone_number_id: "phone_123",
        },
      ],
    },
    {
      "x-webhook-event": "whatsapp.message.received",
      "x-idempotency-key": "batch-delivery-key",
    }
  );

  assert.deepEqual(
    eventos.map((evento) => evento.idempotencyKey),
    ["wamid.batch.1", "wamid.batch.2"]
  );
});

test("acepta webhooks sin firma fuera de produccion cuando no hay secreto configurado", () => {
  const secretoAnterior = process.env.KAPSO_WEBHOOK_SECRET;
  const entornoAnterior = process.env.NODE_ENV;
  delete process.env.KAPSO_WEBHOOK_SECRET;
  process.env.NODE_ENV = "test";

  assert.equal(verificarFirmaWebhook({ message: {} }, null), true);

  if (secretoAnterior === undefined) delete process.env.KAPSO_WEBHOOK_SECRET;
  else process.env.KAPSO_WEBHOOK_SECRET = secretoAnterior;

  if (entornoAnterior === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = entornoAnterior;
});

test("valida la firma HMAC enviada por Kapso", () => {
  const secretoAnterior = process.env.KAPSO_WEBHOOK_SECRET;
  const payload = { message: { id: "wamid.signed" } };
  process.env.KAPSO_WEBHOOK_SECRET = "kapso-test-secret";
  const firma = crypto
    .createHmac("sha256", process.env.KAPSO_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest("hex");

  assert.equal(verificarFirmaWebhook(payload, firma), true);
  assert.equal(verificarFirmaWebhook(payload, "firma-invalida"), false);

  if (secretoAnterior === undefined) delete process.env.KAPSO_WEBHOOK_SECRET;
  else process.env.KAPSO_WEBHOOK_SECRET = secretoAnterior;
});

test("valida la firma HMAC contra los bytes crudos del webhook", () => {
  const secretoAnterior = process.env.KAPSO_WEBHOOK_SECRET;
  const payloadCrudo = '{\n  "message": { "id": "wamid.raw" }\n}';
  process.env.KAPSO_WEBHOOK_SECRET = "kapso-test-secret";
  const firma = crypto
    .createHmac("sha256", process.env.KAPSO_WEBHOOK_SECRET)
    .update(payloadCrudo)
    .digest("hex");

  assert.equal(verificarFirmaWebhook(Buffer.from(payloadCrudo), firma), true);
  assert.equal(verificarFirmaWebhook(JSON.parse(payloadCrudo), firma), false);

  if (secretoAnterior === undefined) delete process.env.KAPSO_WEBHOOK_SECRET;
  else process.env.KAPSO_WEBHOOK_SECRET = secretoAnterior;
});

test("envia texto mediante el SDK oficial de Kapso", async () => {
  const apiKeyAnterior = process.env.KAPSO_API_KEY;
  const baseUrlAnterior = process.env.KAPSO_API_BASE_URL;
  const fetchAnterior = global.fetch;
  let solicitud;

  process.env.KAPSO_API_KEY = "kapso-test-key";
  process.env.KAPSO_API_BASE_URL = "https://api.kapso.ai/meta/whatsapp/v24.0";
  global.fetch = async (url, opciones) => {
    solicitud = { url, opciones };
    return new Response(
      JSON.stringify({
        messaging_product: "whatsapp",
        contacts: [{ input: "573001112233", wa_id: "573001112233" }],
        messages: [{ id: "wamid.sent" }],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  };

  try {
    await enviarTexto({
      to: "573001112233",
      text: "Hola desde Kapso",
      phoneNumberId: "phone_123",
    });

    assert.equal(solicitud.url, "https://api.kapso.ai/meta/whatsapp/v24.0/phone_123/messages");
    assert.equal(solicitud.opciones.headers["X-API-Key"], "kapso-test-key");
    assert.deepEqual(JSON.parse(solicitud.opciones.body), {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "573001112233",
      type: "text",
      text: { body: "Hola desde Kapso" },
    });
  } finally {
    global.fetch = fetchAnterior;

    if (apiKeyAnterior === undefined) delete process.env.KAPSO_API_KEY;
    else process.env.KAPSO_API_KEY = apiKeyAnterior;

    if (baseUrlAnterior === undefined) delete process.env.KAPSO_API_BASE_URL;
    else process.env.KAPSO_API_BASE_URL = baseUrlAnterior;
  }
});
