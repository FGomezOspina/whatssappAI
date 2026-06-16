const DEFAULT_BUFFER_WINDOW_MS = 5000;
const MIN_CONFIGURED_BUFFER_WINDOW_MS = 1000;

function obtenerVentanaBufferMs() {
  const configurada = Number(process.env.INBOUND_MESSAGE_BUFFER_MS || DEFAULT_BUFFER_WINDOW_MS);
  return Number.isFinite(configurada) && configurada >= MIN_CONFIGURED_BUFFER_WINDOW_MS
    ? configurada
    : DEFAULT_BUFFER_WINDOW_MS;
}

function crearBufferMensajesEntrantes({ alVaciar, ventanaMs = obtenerVentanaBufferMs() }) {
  const pendientesPorCliente = new Map();

  function claveEvento(evento = {}) {
    return [
      evento.phoneNumberId || evento.workspaceId || evento.integrationId || "canal-desconocido",
      evento.channelUserId || "usuario-desconocido",
    ].join(":");
  }

  function vaciar(key) {
    const pendiente = pendientesPorCliente.get(key);
    if (!pendiente) return;

    clearTimeout(pendiente.timeout);
    pendientesPorCliente.delete(key);
    alVaciar(pendiente.eventos);
  }

  function agregar(evento) {
    const key = claveEvento(evento);
    const pendiente = pendientesPorCliente.get(key) || { eventos: [], timeout: null };
    if (pendiente.timeout) clearTimeout(pendiente.timeout);

    pendiente.eventos.push(evento);
    pendiente.timeout = setTimeout(() => vaciar(key), ventanaMs);
    pendientesPorCliente.set(key, pendiente);
  }

  function cerrar() {
    pendientesPorCliente.forEach((pendiente) => clearTimeout(pendiente.timeout));
    pendientesPorCliente.clear();
  }

  return {
    agregar,
    cerrar,
    vaciar,
  };
}

module.exports = {
  DEFAULT_BUFFER_WINDOW_MS,
  crearBufferMensajesEntrantes,
  obtenerVentanaBufferMs,
};
