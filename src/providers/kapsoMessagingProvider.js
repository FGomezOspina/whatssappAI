const crypto = require("crypto");
const { WhatsAppClient } = require("@kapso/whatsapp-cloud-api");

const DEFAULT_BASE_URL = "https://api.kapso.ai/meta/whatsapp";
const DEFAULT_GRAPH_VERSION = "v24.0";

function normalizarBaseUrl(baseUrl = DEFAULT_BASE_URL) {
  const normalizada = baseUrl.replace(/\/+$/, "").replace(/\/v\d+\.\d+$/, "");
  return normalizada.endsWith("/meta/whatsapp")
    ? normalizada
    : `${normalizada}/meta/whatsapp`;
}

function obtenerConfiguracion() {
  return {
    apiKey: process.env.KAPSO_API_KEY,
    baseUrl: normalizarBaseUrl(process.env.KAPSO_API_BASE_URL || DEFAULT_BASE_URL),
    graphVersion: process.env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION,
    phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID,
    webhookSecret: process.env.KAPSO_WEBHOOK_SECRET,
  };
}

function compararFirmas(firmaRecibida, firmaEsperada) {
  if (!firmaRecibida || firmaRecibida.length !== firmaEsperada.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(firmaRecibida, "utf8"),
    Buffer.from(firmaEsperada, "utf8")
  );
}

function verificarFirmaWebhook(payloadCrudo, firma) {
  const { webhookSecret } = obtenerConfiguracion();
  if (!webhookSecret) return process.env.NODE_ENV !== "production";

  const contenido = Buffer.isBuffer(payloadCrudo) || typeof payloadCrudo === "string"
    ? payloadCrudo
    : JSON.stringify(payloadCrudo);
  const esperada = crypto
    .createHmac("sha256", webhookSecret)
    .update(contenido)
    .digest("hex");

  return compararFirmas(firma, esperada);
}

function obtenerIdentificadorCliente(payload) {
  const message = payload.message || {};
  const conversation = payload.conversation || {};

  return (
    message.from ||
    message.from_user_id ||
    conversation.phone_number ||
    conversation.business_scoped_user_id ||
    conversation.username ||
    conversation.id ||
    null
  );
}

function obtenerDestinatario(payload) {
  const message = payload.message || {};
  const conversation = payload.conversation || {};

  return (
    message.from ||
    conversation.phone_number ||
    message.from_user_id ||
    conversation.business_scoped_user_id ||
    null
  );
}

function obtenerTextoMensaje(message = {}) {
  if (message.type === "text") return message.text?.body || message.kapso?.content || "";
  if (message.type === "image") {
    return message.image?.caption || message.kapso?.message_type_data?.caption || message.kapso?.content || "";
  }
  if (["audio", "voice"].includes(message.type)) {
    const transcript = message.kapso?.transcript?.text || "";
    const texto =
      message.audio?.caption ||
      message.voice?.caption ||
      message.kapso?.message_type_data?.caption ||
      message.kapso?.content ||
      "";

    return texto === transcript ? "" : texto;
  }
  if (message.type === "interactive") {
    return (
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      message.kapso?.content ||
      ""
    );
  }

  return message.kapso?.content || "";
}

function primerValor(...valores) {
  return valores.find((valor) => typeof valor === "string" && valor.trim()) || null;
}

function extraerPrimerAdjunto(message = {}) {
  if (Array.isArray(message.attachments) && message.attachments.length) return message.attachments[0];
  if (Array.isArray(message.attachment) && message.attachment.length) return message.attachment[0];
  return message.attachment || message.file || {};
}

function datosTipoMedia(message = {}) {
  if (message.type === "voice") return message.voice || message.audio || {};
  return message[message.type] || {};
}

function normalizarTipoMedia(tipo) {
  return tipo === "voice" ? "audio" : tipo;
}

function normalizarMedia(message = {}) {
  if (!["image", "audio", "voice"].includes(message.type)) return null;

  const adjunto = extraerPrimerAdjunto(message);
  const mediaTipo = datosTipoMedia(message);
  const kapso = message.kapso || {};
  const mediaData = kapso.media_data || kapso.mediaData || {};
  const mediaUrl = primerValor(
    kapso.media_url,
    kapso.mediaUrl,
    kapso.file_url,
    kapso.fileUrl,
    kapso.url,
    mediaData.url,
    mediaData.media_url,
    mediaData.mediaUrl,
    mediaData.file_url,
    mediaData.fileUrl,
    message.media_url,
    message.mediaUrl,
    message.file_url,
    message.fileUrl,
    message.url,
    mediaTipo.url,
    mediaTipo.link,
    mediaTipo.media_url,
    mediaTipo.mediaUrl,
    mediaTipo.file_url,
    mediaTipo.fileUrl,
    adjunto.url,
    adjunto.link,
    adjunto.media_url,
    adjunto.mediaUrl,
    adjunto.file_url,
    adjunto.fileUrl
  );
  const mediaId = primerValor(
    kapso.media_id,
    kapso.mediaId,
    mediaData.id,
    mediaData.media_id,
    mediaData.mediaId,
    message.media_id,
    message.mediaId,
    mediaTipo.id,
    mediaTipo.media_id,
    mediaTipo.mediaId,
    adjunto.id,
    adjunto.media_id,
    adjunto.mediaId
  );
  const contentType = primerValor(
    mediaData.content_type,
    mediaData.contentType,
    mediaData.mime_type,
    mediaData.mimetype,
    message.mime_type,
    message.mimetype,
    message.content_type,
    message.contentType,
    mediaTipo.mime_type,
    mediaTipo.mimetype,
    mediaTipo.content_type,
    mediaTipo.contentType,
    adjunto.mime_type,
    adjunto.mimetype,
    adjunto.content_type,
    adjunto.contentType
  );
  const filename = primerValor(
    mediaData.filename,
    mediaData.file_name,
    mediaData.name,
    message.filename,
    message.file_name,
    message.name,
    mediaTipo.filename,
    mediaTipo.file_name,
    mediaTipo.name,
    adjunto.filename,
    adjunto.file_name,
    adjunto.name
  );

  return {
    type: normalizarTipoMedia(message.type),
    url: mediaUrl,
    mediaId,
    filename: filename || `${normalizarTipoMedia(message.type)}-${message.id || mediaId || "archivo"}`,
    contentType,
    transcript: kapso.transcript?.text || null,
    hasFileReference: Boolean(mediaUrl || mediaId),
  };
}

function normalizarEvento(payload, headers = {}) {
  const message = payload.message || {};
  const event = headers["x-webhook-event"] || payload.event;

  if (event !== "whatsapp.message.received" || message.kapso?.direction === "outbound") return null;

  const channelUserId = obtenerIdentificadorCliente(payload);
  const recipientId = obtenerDestinatario(payload);
  if (!channelUserId || !recipientId) return null;

  return {
    channelUserId,
    idempotencyKey: message.id || headers["x-idempotency-key"] || null,
    messageId: message.id || null,
    messageType: message.type || "unknown",
    phoneNumberId: payload.phone_number_id || payload.conversation?.phone_number_id || null,
    recipientId,
    text: obtenerTextoMensaje(message).trim(),
    media: normalizarMedia(message),
    raw: payload,
  };
}

function extraerEventos(payload, headers = {}) {
  const payloads = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [payload];
  return payloads.map((item) => normalizarEvento(item, headers)).filter(Boolean);
}

async function enviarTexto({ to, text, phoneNumberId }) {
  const { apiKey, baseUrl, graphVersion, phoneNumberId: phoneNumberIdConfigurado } = obtenerConfiguracion();
  const numeroOrigen = phoneNumberId || phoneNumberIdConfigurado;

  if (!apiKey || !numeroOrigen) {
    throw new Error("Faltan KAPSO_API_KEY o KAPSO_PHONE_NUMBER_ID");
  }

  const client = new WhatsAppClient({
    baseUrl,
    graphVersion,
    kapsoApiKey: apiKey,
  });

  return client.messages.sendText({
    phoneNumberId: numeroOrigen,
    to,
    body: text,
  });
}

module.exports = {
  enviarTexto,
  extraerEventos,
  normalizarEvento,
  verificarFirmaWebhook,
};
