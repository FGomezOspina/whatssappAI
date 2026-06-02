const test = require("node:test");
const assert = require("node:assert/strict");

const { procesarMultimedia } = require("../src/services/mediaProcessor");

test("pasa URL de imagen al flujo de vision", async () => {
  const resultado = await procesarMultimedia({
    text: "Cuanto vale?",
    media: {
      type: "image",
      url: "https://api.kapso.ai/media/image-token",
    },
  });

  assert.equal(resultado.text, "Cuanto vale?");
  assert.equal(resultado.imageUrl, "https://api.kapso.ai/media/image-token");
});

test("reutiliza transcripcion Kapso cuando el audio ya viene transcrito", async () => {
  const resultado = await procesarMultimedia({
    text: "",
    media: {
      type: "audio",
      url: "https://api.kapso.ai/media/audio-token",
      transcript: "Necesito un Dog Chow adulto",
    },
  });

  assert.equal(resultado.text, "Necesito un Dog Chow adulto");
  assert.equal(resultado.imageUrl, null);
});

test("rechaza imagenes sin URL publica valida", async () => {
  await assert.rejects(
    procesarMultimedia({
      media: {
        type: "image",
        url: "file:///tmp/foto.jpg",
      },
    }),
    /URL pública válida/i
  );
});
