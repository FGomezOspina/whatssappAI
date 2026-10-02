const { obtenerClienteActual } = require('./clients.service');
const { guardarMensaje, supabaseConfigurado } = require('../repositories/supabaseConversationRepository');
async function guardarEntradaInmediata(evento) {
  if (!supabaseConfigurado()) return;
  const cliente = await obtenerClienteActual(evento);
  const id = evento.idempotencyKey || evento.messageId;
  if (!id) throw Error('Inbound event requires stable id');
  return guardarMensaje(evento.channelUserId, 'inbound', evento.text || `[${evento.messageType || 'archivo'}]`, null, cliente, {
    eventKey: `${evento.phoneNumberId || evento.workspaceId || evento.integrationId || 'canal'}:${id}`,
    tipo: evento.messageType || 'text', recibidoEn: new Date().toISOString(), receiptOnly: true,
  });
}
module.exports = { guardarEntradaInmediata };
