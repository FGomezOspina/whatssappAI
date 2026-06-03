const OpenAI = require("openai");
const { toFile } = OpenAI;

const DEFAULT_MEDIA_MAX_BYTES = 24 * 1024 * 1024;
const DEFAULT_MEDIA_TIMEOUT_MS = 10000;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: Number(process.env.OPENAI_TIMEOUT_MS || 7000),
    })
  : null;

async function descargarArchivo(url) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.MEDIA_DOWNLOAD_TIMEOUT_MS || DEFAULT_MEDIA_TIMEOUT_MS)
  );
  const limiteBytes = Number(process.env.MEDIA_MAX_BYTES || DEFAULT_MEDIA_MAX_BYTES);

  try {
    const respuesta = await fetch(validarUrlPublica(url), { signal: controller.signal });
    if (!respuesta.ok) throw new Error(`No se pudo descargar multimedia: ${respuesta.status}`);

    const contentLength = Number(respuesta.headers.get("content-length"));
    if (contentLength && contentLength > limiteBytes) {
      throw new Error("El archivo multimedia supera el límite permitido");
    }

    const partes = [];
    let totalBytes = 0;
    for await (const parte of respuesta.body) {
      totalBytes += parte.length;
      if (totalBytes > limiteBytes) {
        throw new Error("El archivo multimedia supera el límite permitido");
      }
      partes.push(Buffer.from(parte));
    }

    return {
      buffer: Buffer.concat(partes, totalBytes),
      contentType: respuesta.headers.get("content-type") || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function validarUrlPublica(url) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error("La multimedia recibida no tiene una URL pública válida");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("La multimedia recibida no tiene una URL pública válida");
  }

  return parsed.toString();
}

function referenciaSegura(media = {}) {
  return [
    `tipo=${media.type || "desconocido"}`,
    `url=${media.url ? "presente" : "ausente"}`,
    `mediaId=${media.mediaId ? "presente" : "ausente"}`,
    media.contentType ? `contentType=${media.contentType}` : null,
    media.filename ? `filename=${media.filename}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function advertir(logger, mensaje, media) {
  const salida = `[Multimedia] ${mensaje} | ${referenciaSegura(media)}`;
  if (logger?.warn) logger.warn(salida);
}

async function transcribirAudio(media, logger = console) {
  if (!openai) throw new Error("Falta OPENAI_API_KEY para transcribir audio");
  if (!media?.url) throw new Error("El audio recibido no tiene URL");

  if (logger?.log) logger.log(`[OpenAI] Enviando audio real a transcripción | ${referenciaSegura(media)}`);
  const { buffer, contentType } = await descargarArchivo(media.url);
  const archivo = await toFile(buffer, media.filename || "audio.ogg", {
    type: media.contentType || contentType || "audio/ogg",
  });
  const transcripcion = await openai.audio.transcriptions.create({
    file: archivo,
    model: process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
    language: "es",
  });

  return transcripcion.text?.trim() || "";
}

async function prepararImagen(media, logger = console) {
  const { buffer, contentType } = await descargarArchivo(media.url);
  const tipo = media.contentType || contentType || "image/jpeg";
  const dataUrl = `data:${tipo};base64,${buffer.toString("base64")}`;

  if (logger?.log) {
    logger.log(
      `[OpenAI] Imagen descargada y preparada como data URL | bytes=${buffer.length} | ${referenciaSegura({
        ...media,
        contentType: tipo,
      })}`
    );
  }

  return dataUrl;
}

async function procesarMultimedia({ text = "", media = null, logger = console }) {
  if (!media) return { text, imageUrl: null, metadata: { tipo: "text" } };

  if (media.type === "image") {
    if (!media.url) {
      advertir(logger, "Imagen recibida sin URL pública; OpenAI no recibirá la imagen real", media);
      throw new Error("La imagen recibida no tiene URL pública para enviar a OpenAI");
    }

    validarUrlPublica(media.url);
    if (logger?.log) {
      logger.log(
        `[OpenAI] Enviando imagen real a vision | captionChars=${text.length} | ${referenciaSegura(media)}`
      );
    }
    const imageUrl = await prepararImagen(media, logger);

    return {
      text: text || "El cliente envió una imagen. Analízala para entender su solicitud.",
      imageUrl,
      metadata: { tipo: "image", imageSentToOpenAI: true, audioTranscribedWithOpenAI: false },
    };
  }

  if (media.type === "audio") {
    let transcripcion;
    let audioTranscribedWithOpenAI = false;

    if (media.url) {
      transcripcion = await transcribirAudio(media, logger);
      audioTranscribedWithOpenAI = true;
    } else if (media.transcript) {
      advertir(
        logger,
        "Audio recibido sin URL descargable; se usa transcript de Kapso como respaldo, OpenAI no recibió el audio real",
        media
      );
      transcripcion = media.transcript;
    } else {
      advertir(logger, "Audio recibido sin URL ni transcript; no se puede procesar", media);
      throw new Error("El audio recibido no tiene URL ni transcripción disponible");
    }

    return {
      text: [text, transcripcion].filter(Boolean).join("\n").trim(),
      imageUrl: null,
      metadata: { tipo: "audio", imageSentToOpenAI: false, audioTranscribedWithOpenAI },
    };
  }

  return { text, imageUrl: null, metadata: { tipo: media.type || "unknown" } };
}

module.exports = {
  procesarMultimedia,
};
