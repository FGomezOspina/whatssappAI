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

function extensionDesdeContentType(contentType = "") {
  const texto = contentType.toLowerCase();

  if (texto.includes("ogg")) return "ogg";
  if (texto.includes("mpeg") || texto.includes("mp3")) return "mp3";
  if (texto.includes("mp4") || texto.includes("m4a")) return "m4a";
  if (texto.includes("wav")) return "wav";
  if (texto.includes("webm")) return "webm";

  return "ogg";
}

function nombreAudioSeguro(media = {}, contentType = "audio/ogg") {
  if (media.filename && /\.[a-z0-9]{2,5}$/i.test(media.filename)) return media.filename;

  const base = media.filename || `audio_${media.mediaId || "whatsapp"}`;
  return `${base.toString().replace(/[^a-zA-Z0-9_-]+/g, "_")}.${extensionDesdeContentType(contentType)}`;
}

function normalizarTextoSimple(valor = "") {
  return valor
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function limpiarTextoAdjuntoAudio(texto = "") {
  const contenido = texto.toString().trim();
  if (!contenido) return "";

  const pareceResumenAdjunto =
    /^audio attached\b/i.test(contenido) ||
    (/\bURL:\s*https?:\/\//i.test(contenido) && /\bTranscript:\s*/i.test(contenido));

  if (!pareceResumenAdjunto) return contenido;

  return contenido.match(/\bCaption:\s*([\s\S]*?)(?:\bURL:|\bTranscript:|$)/i)?.[1]?.trim() || "";
}

function unirSegmentosUnicos(segmentos = []) {
  const vistos = new Set();

  return segmentos
    .map((segmento) => segmento?.toString().trim())
    .filter(Boolean)
    .filter((segmento) => {
      const normalizado = normalizarTextoSimple(segmento);
      if (!normalizado || vistos.has(normalizado)) return false;
      vistos.add(normalizado);
      return true;
    })
    .join("\n")
    .trim();
}

function construirPromptTranscripcion(catalogo = []) {
  const marcas = new Set();
  const referencias = new Set();
  const presentaciones = new Set();

  catalogo.forEach((marca) => {
    if (marca?.marca) marcas.add(marca.marca);
    (marca?.referencias || []).forEach((referencia) => {
      if (referencia?.nombre) referencias.add(referencia.nombre);
      (referencia?.presentaciones || []).forEach((presentacion) => {
        if (presentacion?.peso) presentaciones.add(presentacion.peso);
      });
    });
  });

  const partes = [
    "Audio de WhatsApp de una tienda de mascotas en Colombia. Transcribe en español, conservando marcas y pesos.",
    "No traduzcas ni reemplaces nombres de marcas. Corrige por contexto fonético cuando el audio suene a una marca o referencia del catálogo.",
    marcas.size ? `Marcas posibles: ${Array.from(marcas).join(", ")}.` : null,
    referencias.size ? `Referencias posibles: ${Array.from(referencias).slice(0, 40).join(", ")}.` : null,
    presentaciones.size ? `Presentaciones posibles: ${Array.from(presentaciones).join(", ")}.` : null,
    "Vocabulario frecuente: Dog Chow, Chunky, cachorro, cachorros, adulto, adultos, mini, pequeño, pequeñas, mediano, grande, todas las razas, cuido, concentrado, bulto, kilo, kilos, kg, kl.",
  ].filter(Boolean);

  return partes.join(" ");
}

async function transcribirConModelo({ buffer, filename, contentType, model, prompt }) {
  const archivo = await toFile(buffer, filename, { type: contentType });
  const transcripcion = await openai.audio.transcriptions.create({
    file: archivo,
    model,
    language: "es",
    prompt,
  });

  return transcripcion.text?.trim() || "";
}

async function transcribirAudio(media, logger = console, catalogo = []) {
  if (!openai) throw new Error("Falta OPENAI_API_KEY para transcribir audio");
  if (!media?.url) throw new Error("El audio recibido no tiene URL");

  if (logger?.log) logger.log(`[OpenAI] Enviando audio real a transcripción | ${referenciaSegura(media)}`);
  const { buffer, contentType } = await descargarArchivo(media.url);
  const tipo = media.contentType || contentType || "audio/ogg";
  const filename = nombreAudioSeguro(media, tipo);
  const prompt = construirPromptTranscripcion(catalogo);
  const modelos = [
    process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-transcribe",
    process.env.OPENAI_TRANSCRIPTION_FALLBACK_MODEL || "gpt-4o-mini-transcribe",
    "whisper-1",
  ].filter((model, index, lista) => model && lista.indexOf(model) === index);

  let ultimoError;
  for (const model of modelos) {
    try {
      const texto = await transcribirConModelo({ buffer, filename, contentType: tipo, model, prompt });
      if (logger?.log) {
        logger.log(`[OpenAI] Audio transcrito | modelo=${model} | textoChars=${texto.length} | filename=${filename}`);
      }
      return texto;
    } catch (error) {
      ultimoError = error;
      if (logger?.warn) {
        logger.warn(`[OpenAI] Falló transcripción de audio | modelo=${model} | error=${error.message}`);
      }
    }
  }

  throw ultimoError || new Error("No se pudo transcribir audio");
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

async function procesarMultimedia({ text = "", media = null, logger = console, catalogo = [] }) {
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
    const textoAdjunto = limpiarTextoAdjuntoAudio(text);

    if (media.url) {
      try {
        transcripcion = await transcribirAudio(media, logger, catalogo);
        audioTranscribedWithOpenAI = true;
      } catch (error) {
        if (!media.transcript) throw error;
        advertir(
          logger,
          `OpenAI no pudo transcribir el audio; se usa transcript de Kapso como respaldo (${error.message})`,
          media
        );
        transcripcion = media.transcript;
      }

      if (!transcripcion && media.transcript) {
        advertir(logger, "OpenAI devolvió transcripción vacía; se usa transcript de Kapso como respaldo", media);
        transcripcion = media.transcript;
        audioTranscribedWithOpenAI = false;
      }
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
      text: unirSegmentosUnicos([textoAdjunto, transcripcion]),
      imageUrl: null,
      metadata: { tipo: "audio", imageSentToOpenAI: false, audioTranscribedWithOpenAI },
    };
  }

  return { text, imageUrl: null, metadata: { tipo: media.type || "unknown" } };
}

module.exports = {
  procesarMultimedia,
};
