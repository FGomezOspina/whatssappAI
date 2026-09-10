const {
  supabaseConfigurado,
  buscarConversacion,
  guardarConversacion: persistirConversacion,
  guardarMensaje,
  buscarMensajesRecientes,
  guardarPedidoConfirmado,
} = require("../repositories/supabaseConversationRepository");

const conversaciones = {};

function claveConversacion(usuario, cliente = null) {
  return `${cliente?.id || cliente?.slug || "default"}:${usuario}`;
}

function crearEstadoInicial() {
  return {
    mensajesProcesados: [],
    ultimaPreguntaAsistente: null,
    memoriaConversacional: null,
    marca: null,
    criterios: {},
    ultimaSeleccion: null,
    productosConsultados: [],
    historialProductosConsultados: [],
    productosPendientes: [],
    referenciasPendientes: null,
    coincidenciasProductoPendientes: null,
    ultimaInteraccionProducto: null,
    ultimaConsultaProducto: null,
    ultimoTurnoContextoProducto: 0,
    carrito: [],
    pedidoConfirmado: false,
    ultimoPedidoConfirmado: null,
    datosDomicilio: {},
    entrega: {
      tipo: null,
      sede: null,
    },
    metodoPago: null,
    confirmacionPedidoId: null,
    ultimoPedidoGuardadoKey: null,
    ultimoPedidoGuardadoAt: null,
    pedidoConfirmadoPendienteGuardar: false,
    pedidoNuevoConDatosPrevios: false,
    datosPreviosConfirmados: false,
    esperandoTipoEntrega: false,
    esperandoSedeRecogida: false,
    esperandoMetodoPago: false,
    instruccionesPagoEnviadas: false,
    esperandoDatosDomicilio: false,
    esperandoPresupuesto: false,
    pendienteRecomendacion: false,
    esperandoMarca: false,
    esperandoConfirmacionDomicilio: false,
    esperandoConfirmacionPedido: false,
    esperandoConfirmacionRepetirPedido: false,
    esperandoConfirmacionDatosPrevios: false,
    esperandoCambioDireccion: false,
    esperandoConfirmacionDatosFacturacion: false,
    esperandoActualizacionDatosCliente: false,
    alternativaPendiente: null,
  };
}

function obtenerConversacion(usuario, cliente = null) {
  const clave = claveConversacion(usuario, cliente);
  if (!conversaciones[clave]) {
    conversaciones[clave] = crearEstadoInicial();
  }

  return conversaciones[clave];
}

function normalizarEstadoPersistido(estadoGuardado = {}) {
  const estadoInicial = crearEstadoInicial();

  return {
    ...estadoInicial,
    ...estadoGuardado,
    entrega: {
      ...estadoInicial.entrega,
      ...(estadoGuardado.entrega || {}),
    },
    datosDomicilio: estadoGuardado.datosDomicilio || {},
    carrito: estadoGuardado.carrito || [],
    productosConsultados: estadoGuardado.productosConsultados || [],
    historialProductosConsultados:
      estadoGuardado.historialProductosConsultados || [],
    productosPendientes: estadoGuardado.productosPendientes || [],
  };
}

async function obtenerConversacionPersistida(usuario, cliente = null) {
  const clave = claveConversacion(usuario, cliente);

  if (!supabaseConfigurado()) {
    return obtenerConversacion(usuario, cliente);
  }

  try {
    const conversacion = await buscarConversacion(usuario, cliente);
    conversaciones[clave] = conversacion?.state
      ? normalizarEstadoPersistido(conversacion.state)
      : crearEstadoInicial();
    if (!conversaciones[clave].ultimaPreguntaAsistente && conversacion?.last_response) {
      conversaciones[clave].ultimaPreguntaAsistente = conversacion.last_response;
    }
  } catch (error) {
    console.error("Error cargando conversación desde Supabase:", error.message);
    throw error;
  }

  return conversaciones[clave];
}

async function guardarConversacionPersistida(usuario, estado, metadatos = {}) {
  conversaciones[claveConversacion(usuario, metadatos.cliente)] = estado;
  if (metadatos.respuesta) estado.ultimaPreguntaAsistente = metadatos.respuesta;
  const soloEntrada = metadatos.fase === "entrada";
  if (soloEntrada) {
    Object.defineProperty(estado, "_turnoEntrante", { configurable: true, writable: true,
      value: { ...metadatos, turnId: metadatos.idsEventos?.join("|") || `${Date.now()}-${Math.random()}` } });
  }

  const mensajesProcesados = [...new Set([
    ...(estado.mensajesProcesados || []), ...(metadatos.idsEventos || []),
  ])].slice(-256);
  if (!supabaseConfigurado()) {
    if (!soloEntrada && !metadatos.soloEstado) estado.mensajesProcesados = mensajesProcesados;
    return;
  }

  try {
    const conversacion = await persistirConversacion(usuario, estado, metadatos);
    const conversationId = conversacion?.id || null;

    const entrada = estado._turnoEntrante;
    if (entrada) {
      for (let i = 0; i < entrada.eventos.length; i++) {
        const evento = entrada.eventos[i];
        await guardarMensaje(usuario, "inbound", evento.text || `[${evento.messageType || evento.media?.type || "archivo"}]`,
          conversationId, metadatos.cliente, {
            eventKey: `${evento.phoneNumberId || evento.workspaceId || evento.integrationId || "canal"}:${evento.idempotencyKey || evento.messageId || `${entrada.turnId}:${i}`}`,
            alcanceInterpretacion: "turno",
            turnId: entrada.turnId, indice: i, tipo: evento.messageType || evento.media?.type || "text",
            mediaId: evento.media?.mediaId || null,
            // No signed URLs or base64 in conversational memory.
            transcripcion: entrada.contenidos?.[i]?.text || null,
            interpretacion: estado._interpretacionTurno || null,
          });
      }
    } else if (metadatos.mensaje) {
      await guardarMensaje(usuario, "inbound", metadatos.mensaje, conversationId, metadatos.cliente);
    }

    if (metadatos.respuesta) {
      await guardarMensaje(usuario, "outbound", metadatos.respuesta, conversationId, metadatos.cliente,
        entrada ? { eventKey: entrada.turnId, turnId: entrada.turnId } : {});
    }

    if (soloEntrada || metadatos.soloEstado) return;
    try {
      const pedidoGuardado = await guardarPedidoConfirmado(usuario, conversationId, estado, metadatos.cliente);
      if (pedidoGuardado || metadatos.idsEventos?.length) {
        await persistirConversacion(usuario, { ...estado, mensajesProcesados }, metadatos);
      }
      estado.mensajesProcesados = mensajesProcesados;
    } catch (error) {
      console.error("Error guardando pedido confirmado en Supabase:", error.message);
      throw error;
    }
  } catch (error) {
    console.error("Error guardando conversación en Supabase:", error.message);
    throw error;
  }
}

async function obtenerHistorialRecientePersistido(usuario, limite = 60, cliente = null, opciones = {}) {
  if (!supabaseConfigurado()) return [];

  try {
    return await buscarMensajesRecientes(usuario, limite, cliente, opciones);
  } catch (error) {
    console.error("Error cargando historial desde Supabase:", error.message);
    throw error;
  }
}

module.exports = {
  crearEstadoInicial,
  obtenerConversacionPersistida,
  obtenerHistorialRecientePersistido,
  guardarConversacionPersistida,
};
