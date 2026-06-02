const {
  supabaseConfigurado,
  buscarConversacion,
  guardarConversacion: persistirConversacion,
  guardarMensaje,
  buscarMensajesRecientes,
  guardarPedidoConfirmado,
} = require("../repositories/supabaseConversationRepository");

const conversaciones = {};

function crearEstadoInicial() {
  return {
    marca: null,
    criterios: {},
    ultimaSeleccion: null,
    productosConsultados: [],
    productosPendientes: [],
    referenciasPendientes: null,
    carrito: [],
    pedidoConfirmado: false,
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

function obtenerConversacion(usuario) {
  if (!conversaciones[usuario]) {
    conversaciones[usuario] = crearEstadoInicial();
  }

  return conversaciones[usuario];
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
    productosPendientes: estadoGuardado.productosPendientes || [],
  };
}

async function obtenerConversacionPersistida(usuario) {
  if (conversaciones[usuario]) return conversaciones[usuario];

  if (!supabaseConfigurado()) {
    return obtenerConversacion(usuario);
  }

  try {
    const conversacion = await buscarConversacion(usuario);
    conversaciones[usuario] = conversacion?.state
      ? normalizarEstadoPersistido(conversacion.state)
      : crearEstadoInicial();
  } catch (error) {
    console.error("Error cargando conversación desde Supabase:", error.message);
    conversaciones[usuario] = crearEstadoInicial();
  }

  return conversaciones[usuario];
}

async function guardarConversacionPersistida(usuario, estado, metadatos = {}) {
  conversaciones[usuario] = estado;

  if (!supabaseConfigurado()) return;

  try {
    const conversacion = await persistirConversacion(usuario, estado, metadatos);
    const conversationId = conversacion?.id || null;

    if (metadatos.mensaje) {
      await guardarMensaje(usuario, "inbound", metadatos.mensaje, conversationId);
    }

    if (metadatos.respuesta) {
      await guardarMensaje(usuario, "outbound", metadatos.respuesta, conversationId);
    }

    try {
      const pedidoGuardado = await guardarPedidoConfirmado(usuario, conversationId, estado);
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

async function obtenerHistorialRecientePersistido(usuario, limite = 12) {
  if (!supabaseConfigurado()) return [];

  try {
    return await buscarMensajesRecientes(usuario, limite);
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
