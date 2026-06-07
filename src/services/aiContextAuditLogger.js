function habilitado() {
  return process.env.AI_CONTEXT_PAYLOAD_LOGS === "true";
}

function contextoProductoHabilitado() {
  return (
    process.env.PRODUCT_CONTEXT_LOGS === "true" ||
    process.env.AI_CONTEXT_PAYLOAD_LOGS === "true"
  );
}

function clienteParaLog(cliente = null) {
  return cliente?.slug || cliente?.id || "sin_cliente";
}

function resumirImagen(imageUrl = {}) {
  const url = imageUrl.url || "";
  return {
    detail: imageUrl.detail || "auto",
    tipo: url.startsWith("data:") ? "data_url" : "url",
    chars: url.length,
    contenidoOmitido: true,
  };
}

function sanitizarContenido(contenido) {
  if (!Array.isArray(contenido)) return contenido;

  return contenido.map((item) => {
    if (item?.type !== "image_url") return item;
    return {
      type: "image_url",
      image_url: resumirImagen(item.image_url),
    };
  });
}

function sanitizarMessages(messages = []) {
  return messages.map((message) => ({
    role: message.role,
    content: sanitizarContenido(message.content),
  }));
}

function logContextoRecuperado({
  logger = console,
  cliente = null,
  channelUserId = null,
  clasificacion = {},
  historial = [],
  estado = {},
}) {
  if (!habilitado()) return;

  const inbound = historial.filter((item) => item.direction === "inbound").length;
  const outbound = historial.filter((item) => item.direction === "outbound").length;
  logger.log(
    `[AI Context Retrieval] ${JSON.stringify({
      cliente: clienteParaLog(cliente),
      usuario: channelUserId || "desconocido",
      perfil: clasificacion.perfilContexto || null,
      intencion: clasificacion.intencion || null,
      limiteSolicitado: clasificacion.limiteHistorial || 0,
      mensajesRecuperados: historial.length,
      inbound,
      outbound,
      estadoActivo: {
        marca: estado.marca || null,
        ultimaSeleccion: Boolean(estado.ultimaSeleccion),
        referenciasPendientes: Boolean(estado.referenciasPendientes),
        coincidenciasProductoPendientes: Boolean(
          estado.coincidenciasProductoPendientes
        ),
        productosConsultados: estado.productosConsultados?.length || 0,
        historialProductosConsultados:
          estado.historialProductosConsultados?.length || 0,
        carrito: estado.carrito?.length || 0,
        esperandoDatosDomicilio: Boolean(estado.esperandoDatosDomicilio),
        esperandoMetodoPago: Boolean(estado.esperandoMetodoPago),
        esperandoConfirmacionPedido: Boolean(
          estado.esperandoConfirmacionPedido
        ),
      },
      historial,
    })}`
  );
}

function logPayloadOpenAI({
  logger = console,
  etapa,
  model,
  cliente = null,
  channelUserId = null,
  perfil = null,
  messages = [],
}) {
  if (!habilitado()) return;

  logger.log(
    `[AI Context Payload] ${JSON.stringify({
      etapa,
      modelo: model,
      cliente: clienteParaLog(cliente),
      usuario: channelUserId || "desconocido",
      perfil,
      messages: sanitizarMessages(messages),
    })}`
  );
}

function logContextoProducto({
  logger = console,
  fase,
  cliente = null,
  channelUserId = null,
  mensaje = "",
  estado = {},
  resolucion = null,
  fallbackHistorial = null,
}) {
  if (!contextoProductoHabilitado()) return;

  logger.log(
    `[Product Context] ${JSON.stringify({
      fase,
      cliente: clienteParaLog(cliente),
      usuario: channelUserId || "desconocido",
      mensaje,
      estado: {
        referenciasPendientes: estado.referenciasPendientes || null,
        ultimaSeleccion: estado.ultimaSeleccion || null,
        productosConsultados: estado.productosConsultados || [],
        historialProductosConsultados:
          estado.historialProductosConsultados || [],
        ultimaInteraccionProducto: estado.ultimaInteraccionProducto || null,
      },
      resolucion,
      fallbackHistorial,
    })}`
  );
}

module.exports = {
  logContextoRecuperado,
  logContextoProducto,
  logPayloadOpenAI,
  _internals: {
    sanitizarMessages,
  },
};
