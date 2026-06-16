const express = require("express");
const {
  enviarTexto,
  extraerEventos,
  verificarFirmaWebhook,
} = require("./providers/kapsoMessagingProvider");
const { responderEventosEntrantes } = require("./services/conversationService");
const { crearBufferMensajesEntrantes } = require("./services/inboundMessageBuffer");
const { dividirRespuestaMensajes } = require("./utils/responseMessages");

const idempotencyKeysProcesadas = new Set();
const colasPorCliente = new Map();

function claveTenantUsuario(evento = {}) {
  return [
    evento.phoneNumberId || evento.workspaceId || evento.integrationId || "canal-desconocido",
    evento.channelUserId || "usuario-desconocido",
  ].join(":");
}

function clienteParaLog(channelUserId = "") {
  if (process.env.NODE_ENV !== "production") return channelUserId || "desconocido";
  return channelUserId ? `***${channelUserId.slice(-4)}` : "desconocido";
}

function contenidoParaLog(evento) {
  const tipo = evento.messageType || evento.media?.type || "unknown";
  const texto = evento.text || `[${tipo} sin texto]`;

  if (process.env.NODE_ENV === "production") {
    return `[${tipo}: ${texto.length} caracteres]`;
  }

  return texto.replace(/\s+/g, " ").trim().slice(0, 500);
}

function multimediaParaLog(evento) {
  if (!evento.media) return "media=no";

  return [
    "media=si",
    `mediaTipo=${evento.media.type}`,
    `url=${evento.media.url ? "presente" : "ausente"}`,
    `mediaId=${evento.media.mediaId ? "presente" : "ausente"}`,
    `contentType=${evento.media.contentType || "desconocido"}`,
    `transcript=${evento.media.transcript ? "presente" : "ausente"}`,
  ].join(" | ");
}

function registrarMensajeEntrante(evento) {
  console.log(
    `[Kapso] Mensaje recibido | cliente=${clienteParaLog(evento.channelUserId)} | id=${
      evento.messageId || "sin-id"
    } | tipo=${evento.messageType || "unknown"} | texto=${JSON.stringify(contenidoParaLog(evento))} | ${multimediaParaLog(
      evento
    )}`
  );
}

function registrarIdempotencyKey(key) {
  if (!key) return true;
  if (idempotencyKeysProcesadas.has(key)) return false;

  idempotencyKeysProcesadas.add(key);
  if (idempotencyKeysProcesadas.size > 10000) {
    idempotencyKeysProcesadas.delete(idempotencyKeysProcesadas.values().next().value);
  }

  return true;
}

async function procesarEventos(eventos) {
  const evento = eventos[eventos.length - 1];
  const respuesta = await responderEventosEntrantes(eventos);
  const mensajesRespuesta = dividirRespuestaMensajes(respuesta);
  for (const text of mensajesRespuesta) {
    await enviarTexto({
      to: evento.recipientId,
      text,
      phoneNumberId: evento.phoneNumberId,
    });
  }
  console.log(
    `[Kapso] Respuesta enviada | cliente=${clienteParaLog(evento.channelUserId)} | mensajes=${
      eventos.length
    } | respuestas=${mensajesRespuesta.length} | ids=${eventos.map((item) => item.messageId || "sin-id").join(",")}`
  );
}

function encolarEventos(eventos) {
  const queueKey = claveTenantUsuario(eventos[0]);
  const colaAnterior = colasPorCliente.get(queueKey) || Promise.resolve();
  const procesamiento = colaAnterior
    .catch(() => {})
    .then(() => procesarEventos(eventos));

  colasPorCliente.set(queueKey, procesamiento);
  procesamiento
    .catch((error) => {
      console.error("Error procesando webhook Kapso:", error.message);
    })
    .finally(() => {
      if (colasPorCliente.get(queueKey) === procesamiento) {
        colasPorCliente.delete(queueKey);
      }
    });
}

const bufferMensajesEntrantes = crearBufferMensajesEntrantes({
  alVaciar: encolarEventos,
});

function crearApp() {
  const app = express();
  app.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buffer) => {
        req.rawBody = buffer;
      },
    })
  );

  app.post("/webhooks/kapso/whatsapp", (req, res) => {
    const firma = req.headers["x-webhook-signature"];
    if (!verificarFirmaWebhook(req.rawBody || req.body, firma)) {
      res.status(401).send("Invalid signature");
      return;
    }

    const eventos = extraerEventos(req.body, req.headers);
    res.status(200).send("OK");

    eventos.forEach((evento) => {
      registrarMensajeEntrante(evento);
      setImmediate(() => {
        if (registrarIdempotencyKey(evento.idempotencyKey)) {
          bufferMensajesEntrantes.agregar(evento);
        }
      });
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, provider: "kapso" });
  });

  return app;
}

module.exports = {
  crearApp,
};
