function ultimosItems(items = [], limite = 5) {
  return items.slice(Math.max(0, items.length - limite));
}

function resumirPedido(pedido = null) {
  if (!pedido) return null;

  return {
    carrito: pedido.carrito || [],
    entrega: pedido.entrega || {},
    metodoPago: pedido.metodoPago || null,
    datosDomicilio: pedido.datosDomicilio || {},
    confirmadoEn: pedido.confirmadoEn || pedido.confirmed_at || null,
  };
}

function construirMemoriaOperativa(estado = {}, historialReciente = []) {
  return {
    nivel1ConversacionActiva: {
      ultimaPreguntaAsistente: estado.ultimaPreguntaAsistente || null,
      marca: estado.marca || null,
      criterios: estado.criterios || {},
      ultimaSeleccion: estado.ultimaSeleccion || null,
      referenciasPendientes: estado.referenciasPendientes || null,
      coincidenciasProductoPendientes:
        estado.coincidenciasProductoPendientes || null,
      productosPendientes: estado.productosPendientes || [],
      productosConsultados: estado.productosConsultados || [],
      ultimaConsultaProducto: estado.ultimaConsultaProducto || null,
      historialProductosConsultados: ultimosItems(
        estado.historialProductosConsultados || [],
        10
      ),
      carrito: estado.carrito || [],
      entrega: estado.entrega || {},
      metodoPago: estado.metodoPago || null,
    },
    nivel2PerfilCliente: {
      datosDomicilio: estado.datosDomicilio || {},
      ultimoPedidoConfirmado: resumirPedido(estado.ultimoPedidoConfirmado),
      pedidoConfirmado: Boolean(estado.pedidoConfirmado),
      productosHabituales: ultimosItems(estado.productosHabituales || [], 5),
      preferencias: estado.preferencias || {},
    },
    nivel3HistorialDisponible: {
      conservadoEnSupabase: true,
      resumenPersistente: estado.memoriaConversacional?.resumen || null,
      resumidoHasta: estado.memoriaConversacional?.hasta || null,
      mensajesRecientesEnviadosAlModelo: historialReciente.length,
    },
  };
}

module.exports = {
  construirMemoriaOperativa,
};
