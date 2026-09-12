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

test("limpia resumen tecnico de audio antes de unir la transcripcion", async () => {
  const resultado = await procesarMultimedia({
    text: "Audio attached (audio_b8b5a13a5d63.ogg) [Size: 7.7 KB | Type: audio/opus] URL: https://app.kapso.ai/audio.ogg Transcript: ¿Qué costo tiene el Dog Chow cachorro pequeño de 4 kilos?",
    media: {
      type: "audio",
      transcript: "¿Qué costo tiene el Dog Chow cachorro pequeño de 4 kilos?",
    },
    logger: loggerSilencioso,
  });

  assert.equal(resultado.text, "¿Qué costo tiene el Dog Chow cachorro pequeño de 4 kilos?");
});

test("usa transcript de Kapso como respaldo si falla OpenAI con audio real", async () => {
  const resultado = await procesarMultimedia({
    text: "",
    media: {
      type: "audio",
      url: "https://api.kapso.ai/media/audio-token",
      transcript: "Quiero dos bolsas de Chunky",
    },
    logger: loggerSilencioso,
  });

  assert.equal(resultado.text, "Quiero dos bolsas de Chunky");
  assert.equal(resultado.metadata.audioTranscribedWithOpenAI, false);
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

test('reintenta descarga que agota el plazo con una señal nueva y entrega la imagen completa', async () => {
  const anterior = global.fetch;
  const config = process.env.MEDIA_DOWNLOAD_TIMEOUT_MS;
  const retries = process.env.MEDIA_DOWNLOAD_RETRIES;
  process.env.MEDIA_DOWNLOAD_TIMEOUT_MS = '5';
  process.env.MEDIA_DOWNLOAD_RETRIES = '1';
  const senales = [];
  const logs = [];
  global.fetch = async (_url, { signal }) => {
    senales.push(signal);
    if (senales.length === 1) return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')), { once: true }));
    return new Response(Buffer.from('imagen-completa'), { headers: { 'content-type': 'image/jpeg' } });
  };
  try {
    const resultado = await procesarMultimedia({ media: { type: 'image', url: 'https://example.com/secret-token' }, logger: { log() {}, warn: x => logs.push(x) } });
    assert.equal(resultado.imageUrl, 'data:image/jpeg;base64,' + Buffer.from('imagen-completa').toString('base64'));
    assert.equal(senales.length, 2);
    assert.notEqual(senales[0], senales[1]);
    assert.match(logs[0], /timeout de descarga.*reintentar=si/);
    assert.doesNotMatch(logs.join(' '), /secret-token/);
  } finally {
    global.fetch = anterior;
    if (config === undefined) delete process.env.MEDIA_DOWNLOAD_TIMEOUT_MS; else process.env.MEDIA_DOWNLOAD_TIMEOUT_MS = config;
    if (retries === undefined) delete process.env.MEDIA_DOWNLOAD_RETRIES; else process.env.MEDIA_DOWNLOAD_RETRIES = retries;
  }
});

test('limita los reintentos y cancela tambien un cuerpo de imagen que se queda esperando', async () => {
  const anterior = global.fetch;
  const config = process.env.MEDIA_DOWNLOAD_TIMEOUT_MS;
  const retries = process.env.MEDIA_DOWNLOAD_RETRIES;
  process.env.MEDIA_DOWNLOAD_TIMEOUT_MS = '5';
  process.env.MEDIA_DOWNLOAD_RETRIES = '1';
  let intentos = 0;
  global.fetch = async (_url, { signal }) => {
    intentos++;
    return { ok: true, headers: new Headers(), body: {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('parcial');
        await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
      },
    } };
  };
  try {
    await assert.rejects(procesarMultimedia({ media: { type: 'image', url: 'https://example.com/image' }, logger: loggerSilencioso }), error => error.code === 'MEDIA_DOWNLOAD_TIMEOUT' && /intentos=2/.test(error.message));
    assert.equal(intentos, 2);
  } finally {
    global.fetch = anterior;
    if (config === undefined) delete process.env.MEDIA_DOWNLOAD_TIMEOUT_MS; else process.env.MEDIA_DOWNLOAD_TIMEOUT_MS = config;
    if (retries === undefined) delete process.env.MEDIA_DOWNLOAD_RETRIES; else process.env.MEDIA_DOWNLOAD_RETRIES = retries;
  }
});

test('no reintenta errores permanentes ni archivos sobre el limite', async () => {
  const anterior = global.fetch;
  try {
    for (const respuesta of [new Response('', { status: 403 }), new Response('', { headers: { 'content-length': '999999999' } })]) {
      let intentos = 0;
      global.fetch = async () => { intentos++; return respuesta; };
      await assert.rejects(procesarMultimedia({ media: { type: 'image', url: 'https://example.com/image' }, logger: loggerSilencioso }));
      assert.equal(intentos, 1);
    }
  } finally { global.fetch = anterior; }
});
