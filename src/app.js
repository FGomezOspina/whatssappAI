const express = require('express');
const { enviarTexto, mostrarEscribiendo, extraerEventos, verificarFirmaWebhook } = require('./providers/kapsoMessagingProvider');
const { responderEventosEntrantes } = require('./services/conversationService');
const { crearBufferMensajesEntrantes } = require('./services/inboundMessageBuffer');
const { crearCoordinador } = require('./services/conversationScheduler');
const { guardarEntradaInmediata } = require('./services/inboundMessagePersistence');
const { dividirRespuestaMensajes } = require('./utils/responseMessages');
function crearApp() {
  const app = express();
  const coordinador = crearCoordinador({ procesar: responderEventosEntrantes, enviar: enviarTexto,
    typing: mostrarEscribiendo, guardarEntrada: guardarEntradaInmediata,
    dividir: dividirRespuestaMensajes, bufferFactory: crearBufferMensajesEntrantes });
  app.use(express.json({ limit: '2mb', verify: (req, _res, buffer) => { req.rawBody = buffer; } }));
  app.post('/webhooks/kapso/whatsapp', async (req, res) => {
    if (!verificarFirmaWebhook(req.rawBody || req.body, req.headers['x-webhook-signature'])) {
      res.status(401).send('Invalid signature'); return;
    }
    const eventos = extraerEventos(req.body, req.headers);
    try {
      // Recibir invalida la generación actual antes de cualquier await.
      await Promise.all(eventos.map(evento => coordinador.recibir(evento)));
      res.status(200).send('OK');
    } catch { res.status(503).send('Inbound persistence unavailable'); }
  });
  app.get('/health', (_req, res) => res.json({ ok: true, provider: 'kapso' }));
  return app;
}
module.exports = { crearApp };
