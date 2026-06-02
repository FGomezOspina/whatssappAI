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

    return Buffer.concat(partes, totalBytes);
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

async function transcribirAudio(media) {
  if (media.transcript) return media.transcript;
  if (!openai) throw new Error("Falta OPENAI_API_KEY para transcribir audio");
  if (!media?.url) throw new Error("El audio recibido no tiene URL");

  const buffer = await descargarArchivo(media.url);
  const archivo = await toFile(buffer, media.filename || "audio.ogg", {
    type: media.contentType || "audio/ogg",
  });
  const transcripcion = await openai.audio.transcriptions.create({
    file: archivo,
    model: process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1",
    language: "es",
  });

  return transcripcion.text?.trim() || "";
}

async function procesarMultimedia({ text = "", media = null }) {
  if (!media) return { text, imageUrl: null };

  if (media.type === "image") {
    return {
      text: text || "El cliente envió una imagen. Analízala para entender su solicitud.",
      imageUrl: validarUrlPublica(media.url),
    };
  }

  if (media.type === "audio") {
    const transcripcion = await transcribirAudio(media);
    return {
      text: [text, transcripcion].filter(Boolean).join("\n").trim(),
      imageUrl: null,
    };
  }

  return { text, imageUrl: null };
}

module.exports = {
  procesarMultimedia,
};
