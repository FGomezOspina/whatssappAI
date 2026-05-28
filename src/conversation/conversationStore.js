const {
  supabaseConfigurado,
  buscarConversacion,
  guardarConversacion: persistirConversacion,
  guardarMensaje,
  guardarPedidoConfirmado,
} = require("../repositories/supabaseConversationRepository");

const conversaciones = {};

function crearEstadoInicial() {
  return {
    marca: null,
    criterios: {},
    ultimaSeleccion: null,
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
  return {
    ...crearEstadoInicial(),
    ...estadoGuardado,
    entrega: {
      ...crearEstadoInicial().entrega,
      ...(estadoGuardado.entrega || {}),
    },
    datosDomicilio: estadoGuardado.datosDomicilio || {},
    carrito: estadoGuardado.carrito || [],
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

module.exports = {
  crearEstadoInicial,
  obtenerConversacion,
  obtenerConversacionPersistida,
  guardarConversacionPersistida,
};
