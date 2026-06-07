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
  return `${cliente?.slug || cliente?.id || "default"}:${usuario}`;
}

function crearEstadoInicial() {
  return {
    marca: null,
    criterios: {},
    ultimaSeleccion: null,
    productosConsultados: [],
    historialProductosConsultados: [],
    productosPendientes: [],
    referenciasPendientes: null,
    coincidenciasProductoPendientes: null,
    ultimaInteraccionProducto: null,
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
  if (conversaciones[clave]) return conversaciones[clave];

  if (!supabaseConfigurado()) {
    return obtenerConversacion(usuario, cliente);
  }

  try {
    const conversacion = await buscarConversacion(usuario, cliente);
    conversaciones[clave] = conversacion?.state
      ? normalizarEstadoPersistido(conversacion.state)
      : crearEstadoInicial();
  } catch (error) {
    console.error("Error cargando conversación desde Supabase:", error.message);
    conversaciones[clave] = crearEstadoInicial();
  }

  return conversaciones[clave];
}

async function guardarConversacionPersistida(usuario, estado, metadatos = {}) {
  conversaciones[claveConversacion(usuario, metadatos.cliente)] = estado;

  if (!supabaseConfigurado()) return;

  try {
    const conversacion = await persistirConversacion(usuario, estado, metadatos);
    const conversationId = conversacion?.id || null;

    if (metadatos.mensaje) {
      await guardarMensaje(usuario, "inbound", metadatos.mensaje, conversationId, metadatos.cliente);
    }

    if (metadatos.respuesta) {
      await guardarMensaje(usuario, "outbound", metadatos.respuesta, conversationId, metadatos.cliente);
    }

    try {
      const pedidoGuardado = await guardarPedidoConfirmado(usuario, conversationId, estado, metadatos.cliente);
      if (pedidoGuardado) {
        await persistirConversacion(usuario, estado, metadatos);
      }
    } catch (error) {
      console.error("Error guardando pedido confirmado en Supabase:", error.message);
    }
  } catch (error) {
    console.error("Error guardando conversación en Supabase:", error.message);
  }
}

async function obtenerHistorialRecientePersistido(usuario, limite = 12, cliente = null) {
  if (!supabaseConfigurado()) return [];

  try {
    return await buscarMensajesRecientes(usuario, limite, cliente);
  } catch (error) {
    console.error("Error cargando historial desde Supabase:", error.message);
    return [];
  }
}

module.exports = {
  crearEstadoInicial,
  obtenerConversacionPersistida,
  obtenerHistorialRecientePersistido,
  guardarConversacionPersistida,
};
