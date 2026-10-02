const { crearBufferMensajesEntrantes } = require('./inboundMessageBuffer');
const { contexto, crearContexto, medir, registrar, resumen, hash } = require('./pipelineTelemetry');
const claveConversacion = e => [e.phoneNumberId || e.workspaceId || e.integrationId || 'canal-desconocido', e.channelUserId || 'usuario-desconocido'].join(':');
// El buffer conserva sus timers. Aquí se agrupan los lotes que vencen mientras
// una ejecución está activa, sin reproducir mensajes con efectos ya aplicados.
function crearCoordinador({ procesar, enviar, typing = async () => {}, guardarEntrada = async () => {}, dividir = x => x ? [x] : [], ventanaMs, bufferFactory = crearBufferMensajesEntrantes, onSummary = () => {} }) {
  const estados = new Map(), recibidos = new Map();
  const buffer = bufferFactory({ ventanaMs, alVaciar: listo });
  function log(s, texto) { console.log(`[CONVERSATION][conversation:${hash(s.key)}][run:${s.run || '-'}] ${texto}`); }
  function listo(eventos) {
    const key = claveConversacion(eventos[0]), s = estados.get(key);
    if (!s) return;
    for (const evento of eventos) Object.defineProperty(evento, '_bufferVacioEn', { value: Date.now(), configurable: true });
    s.listos.push(...eventos); s.enBuffer -= eventos.length;
    iniciar(s);
  }
  function iniciar(s) {
    if (s.activo || !s.listos.length || s.enBuffer) return;
    let eventos = s.listos.splice(0);
    const version = s.version;
    s.activo = true;
    const ctx = crearContexto(s.key, Math.min(...eventos.map(e => e._recibidoEn)));
    s.run = ctx.run;
    s.promesa = contexto.run(ctx, async () => {
      let renovacion;
      const enviados = [];
      try {
        log(s, 'Processing started');
        const ultimo = eventos[eventos.length - 1];
        const espera = { etapa: 'inbound_buffer', ms: ultimo._bufferVacioEn - ultimo._recibidoEn, ok: true };
        ctx.mediciones.push(espera); registrar('inbound_buffer', espera);
        registrar('processing_queue_wait', { ms: Date.now() - ultimo._bufferVacioEn });
        const entradas = await Promise.allSettled(eventos.map(e => e._entradaGuardada));
        eventos = eventos.filter((_e, i) => entradas[i].status === 'fulfilled');
        if (!eventos.length) { registrar('inbound_persistence_failed'); return; }
        ctx.mediciones.push(...eventos.flatMap(e => e._entradaMetricas || []));
        const actual = eventos[eventos.length-1];
        let mostrando = false;
        const mostrar = async () => {
          if (mostrando || s.version !== version) return;
          mostrando = true;
          try { await medir('kapso_typing_mark_read', () => typing(actual)); }
          catch { registrar('typing_error', { continuing: true }); }
          finally { mostrando = false; }
        };
        // El typing no retrasa ni bloquea el motor. No cancelar requests.
        void mostrar();
        renovacion = setInterval(() => void mostrar(), 20000); renovacion.unref?.();
        const respuesta = await medir('agent_processing', () => procesar(eventos));
        const vigente = () => s.version === version;
        if (!vigente()) { log(s, 'Generated response discarded (stale)'); return; }
        for (const text of dividir(respuesta)) {
          if (!vigente()) { log(s, 'Remaining response discarded (stale)'); return; }
          const antes = enviados.length;
          await medir('kapso_send', () => enviar({ to: actual.recipientId, phoneNumberId: actual.phoneNumberId, text, vigente,
            alEnviarParte: parte => enviados.push(parte) }));
          // Compatibilidad con transportes que entregan el texto en una llamada.
          if (enviados.length === antes && vigente()) enviados.push(text);
        }
      } catch (error) {
        log(s, `Processing failed (${error.name || 'Error'}); lock released`);
        // No reejecutar operaciones a ciegas ni reintentar envíos ambiguos.
        // Los recibos persistidos del motor protegen los efectos ya aplicados.
        for (const e of eventos) recibidos.delete(e._receiptKey);
      } finally {
        clearInterval(renovacion);
        // Si llegó un mensaje entre dos partes, conservar solamente lo que el
        // transporte ya confirmó, nunca el resto descartado.
        if (enviados.length && ctx.alEnviar) {
          try { await medir('save_response', () => ctx.alEnviar(enviados.join('\n\n'))); }
          catch { log(s, 'Response persistence failed; lock released'); }
        }
        const datos = resumen(ctx);
        s.activo = false; s.run = null;
        try { onSummary(datos); } catch { /* observabilidad no bloquea la cola */ }
        if (s.listos.length && !s.enBuffer) { log(s, 'Scheduling processing with latest messages'); iniciar(s); }
        else if (!s.enBuffer && !s.listos.length) estados.delete(s.key);
      }
    });
  }
  function recibir(evento) {
    const key = claveConversacion(evento), id = evento.idempotencyKey || evento.messageId;
    const receiptKey = id ? `${key}:${id}` : null;
    if (receiptKey && recibidos.has(receiptKey)) return recibidos.get(receiptKey);
    const s = estados.get(key) || { key, version: 0, activo: false, enBuffer: 0, listos: [] };
    estados.set(key, s); s.version++; s.enBuffer++;
    if (s.activo) log(s, 'New inbound message received while processing; run became stale');
    const ctx = crearContexto(key);
    const guardado = contexto.run(ctx, () => {
      registrar('webhook_received');
      return medir('save_inbound_message', () => guardarEntrada(evento));
    });
    // Observar rechazo inmediatamente; el procesamiento también lo comprobará.
    guardado.catch(() => { if (receiptKey) recibidos.delete(receiptKey); });
    Object.defineProperties(evento, { _entradaMetricas:{value:ctx.mediciones,configurable:true}, _entradaGuardada: {value:guardado, configurable:true}, _recibidoEn:{value:ctx.recibido,configurable:true}, _receiptKey:{value:receiptKey,configurable:true} });
    if (receiptKey) recibidos.set(receiptKey, guardado);
    if (recibidos.size > 10000) recibidos.delete(recibidos.keys().next().value);
    buffer.agregar(evento);
    return guardado;
  }
  return { recibir, estados, cerrar: () => buffer.cerrar() };
}
module.exports = { crearCoordinador, claveConversacion };
