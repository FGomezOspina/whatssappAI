const crypto = require("crypto");
const { requestSupabase, supabaseConfigurado } = require("./supabaseClient");

const CONVERSATIONS_TABLE = process.env.SUPABASE_CONVERSATIONS_TABLE || "whatsapp_conversations";
const MESSAGES_TABLE = process.env.SUPABASE_MESSAGES_TABLE || "whatsapp_messages";
const ORDERS_TABLE = process.env.SUPABASE_ORDERS_TABLE || "whatsapp_orders";

function extraerClienteDesdeEstado(estado) {
  return {
    nombre: estado.datosDomicilio?.nombre || null,
    cedula: estado.datosDomicilio?.cedula || null,
    correo: estado.datosDomicilio?.correo || null,
    celular: estado.datosDomicilio?.celular || null,
    direccion: estado.datosDomicilio?.direccion || null,
  };
}

function estadoCliente(estado) {
  if (estado.pedidoConfirmado) return "pedido_confirmado";
  if (estado.esperandoDatosDomicilio) return "esperando_datos_domicilio";
  if (estado.esperandoMetodoPago) return "esperando_metodo_pago";
  if (estado.esperandoSedeRecogida) return "esperando_sede_recogida";
  if (estado.carrito?.length) return "pedido_en_proceso";
  return "conversacion_abierta";
}

function filtroCliente(cliente = null) {
  return cliente?.id ? `&client_id=eq.${cliente.id}` : "";
}

function payloadCliente(cliente = null) {
  return cliente?.id ? { client_id: cliente.id } : {};
}

function conflictoConversacion(cliente = null) {
  return cliente?.id ? "client_id,channel_user_id" : "channel_user_id";
}

function conflictoPedido(cliente = null) {
  return cliente?.id ? "client_id,channel_user_id,order_key" : "channel_user_id,order_key";
}

async function buscarConversacion(usuario, cliente = null) {
  if (!supabaseConfigurado()) return null;

  const query = `${CONVERSATIONS_TABLE}?channel_user_id=eq.${encodeURIComponent(usuario)}${filtroCliente(cliente)}&select=*`;
  const filas = await requestSupabase(query);
  return filas && filas.length ? filas[0] : null;
}

async function guardarConversacion(usuario, estado, metadatos = {}) {
  if (!supabaseConfigurado()) return null;
  const cliente = metadatos.cliente || null;

  const payload = {
    ...payloadCliente(cliente),
    channel_user_id: usuario,
    customer: extraerClienteDesdeEstado(estado),
    state: estado,
    status: estadoCliente(estado),
    last_message: metadatos.mensaje || null,
    last_response: metadatos.respuesta || null,
    last_interaction_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const filas = await requestSupabase(`${CONVERSATIONS_TABLE}?on_conflict=${conflictoConversacion(cliente)}`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });

  return filas && filas.length ? filas[0] : null;
}

async function guardarMensaje(usuario, direccion, cuerpo, conversationId = null, cliente = null) {
  if (!supabaseConfigurado()) return null;

  const payload = {
    ...payloadCliente(cliente),
    channel_user_id: usuario,
    conversation_id: conversationId,
    direction: direccion,
    body: cuerpo,
  };

  try {
    return await requestSupabase(MESSAGES_TABLE, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (!error.message.includes("conversation_id")) throw error;

    delete payload.conversation_id;
    return requestSupabase(MESSAGES_TABLE, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

async function buscarMensajesRecientes(usuario, limite = 12, cliente = null) {
  if (!supabaseConfigurado()) return [];

  const limiteSeguro = Math.min(Math.max(Number(limite) || 12, 1), 50);
  const query = `${MESSAGES_TABLE}?channel_user_id=eq.${encodeURIComponent(
    usuario
  )}${filtroCliente(cliente)}&select=direction,body,created_at&order=created_at.desc&limit=${limiteSeguro}`;
  const filas = (await requestSupabase(query)) || [];

  return filas.reverse();
}

function clavePedido(estado) {
  if (!estado.confirmacionPedidoId) {
    estado.confirmacionPedidoId = crypto.randomUUID();
  }

  return estado.confirmacionPedidoId;
}

async function guardarPedidoConfirmado(usuario, conversationId, estado, cliente = null) {
  if (
    !supabaseConfigurado() ||
    !estado.pedidoConfirmado ||
    !estado.pedidoConfirmadoPendienteGuardar ||
    !estado.carrito?.length
  ) {
    return null;
  }

  const orderKey = clavePedido(estado);
  const total = estado.carrito.reduce((suma, item) => suma + item.precio * item.cantidad, 0);
  const payload = {
    ...payloadCliente(cliente),
    conversation_id: conversationId,
    channel_user_id: usuario,
    order_key: orderKey,
    order_snapshot: {
      carrito: estado.carrito,
      datosDomicilio: estado.datosDomicilio,
      entrega: estado.entrega,
      metodoPago: estado.metodoPago,
    },
    total,
    status: "confirmado",
    confirmed_at: new Date().toISOString(),
  };

  return requestSupabase(`${ORDERS_TABLE}?on_conflict=${conflictoPedido(cliente)}`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  }).then((filas) => {
    estado.ultimoPedidoGuardadoKey = orderKey;
    estado.ultimoPedidoGuardadoAt = payload.confirmed_at;
    estado.pedidoConfirmadoPendienteGuardar = false;
    return filas;
  });
}

module.exports = {
  supabaseConfigurado,
  buscarConversacion,
  guardarConversacion,
  guardarMensaje,
  buscarMensajesRecientes,
  guardarPedidoConfirmado,
};
