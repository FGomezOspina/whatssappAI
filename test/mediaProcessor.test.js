const test = require("node:test");
const assert = require("node:assert/strict");

const { procesarMultimedia } = require("../src/services/mediaProcessor");

const loggerSilencioso = { log() {}, warn() {} };

test("pasa URL de imagen al flujo de vision", async () => {
  const fetchAnterior = global.fetch;
  global.fetch = async () =>
    new Response(Buffer.from("imagen-test"), {
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
    });

  try {
    const resultado = await procesarMultimedia({
      text: "Cuanto vale?",
      media: {
        type: "image",
        url: "https://api.kapso.ai/media/image-token",
      },
      logger: loggerSilencioso,
    });

    assert.equal(resultado.text, "Cuanto vale?");
    assert.match(resultado.imageUrl, /^data:image\/jpeg;base64,/);
    assert.equal(resultado.metadata.imageSentToOpenAI, true);
  } finally {
    global.fetch = fetchAnterior;
  }
});

test("usa transcripcion Kapso solo como respaldo cuando no hay URL de audio", async () => {
  const resultado = await procesarMultimedia({
    text: "",
    media: {
      type: "audio",
      transcript: "Necesito un Dog Chow adulto",
    },
    logger: loggerSilencioso,
  });

  assert.equal(resultado.text, "Necesito un Dog Chow adulto");
  assert.equal(resultado.imageUrl, null);
  assert.equal(resultado.metadata.audioTranscribedWithOpenAI, false);
});

test("combina texto adicional de audio con la transcripcion disponible", async () => {
  const resultado = await procesarMultimedia({
    text: "Es para domicilio",
    media: {
      type: "audio",
      transcript: "Necesito un Dog Chow adulto",
    },
    logger: loggerSilencioso,
  });

  assert.equal(resultado.text, "Es para domicilio\nNecesito un Dog Chow adulto");
});

test("rechaza imagenes sin URL publica valida", async () => {
  await assert.rejects(
    procesarMultimedia({
      media: {
        type: "image",
        url: "file:///tmp/foto.jpg",
      },
      logger: loggerSilencioso,
    }),
    /URL pública válida/i
  );
});

test("advierte y rechaza imagen cuando solo llega media_id sin URL", async () => {
  const warnings = [];

  await assert.rejects(
    procesarMultimedia({
      media: {
        type: "image",
        mediaId: "media-id-sin-url",
      },
      logger: { log() {}, warn: (mensaje) => warnings.push(mensaje) },
    }),
    /no tiene URL pública/i
  );

  assert.match(warnings[0], /Imagen recibida sin URL pública/);
  assert.match(warnings[0], /mediaId=presente/);
});
