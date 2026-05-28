const crypto = require("crypto");

const CONVERSATIONS_TABLE = process.env.SUPABASE_CONVERSATIONS_TABLE || "whatsapp_conversations";
const MESSAGES_TABLE = process.env.SUPABASE_MESSAGES_TABLE || "whatsapp_messages";
const ORDERS_TABLE = process.env.SUPABASE_ORDERS_TABLE || "whatsapp_orders";

function supabaseConfigurado() {
  return Boolean(process.env.SUPABASE_URL && obtenerApiKey());
}

function obtenerApiKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function headers() {
  const apiKey = obtenerApiKey();
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function supabaseUrl(path) {
  return `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`;
}

async function requestSupabase(path, opciones = {}) {
  if (!supabaseConfigurado()) return null;

  const respuesta = await fetch(supabaseUrl(path), {
    ...opciones,
    headers: {
      ...headers(),
      ...(opciones.headers || {}),
    },
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(`Supabase ${respuesta.status}: ${detalle}`);
  }

  if (respuesta.status === 204) return null;
  const texto = await respuesta.text();
  return texto ? JSON.parse(texto) : null;
}

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

async function buscarConversacion(usuario) {
  if (!supabaseConfigurado()) return null;

  const query = `${CONVERSATIONS_TABLE}?channel_user_id=eq.${encodeURIComponent(usuario)}&select=*`;
  const filas = await requestSupabase(query);
  return filas && filas.length ? filas[0] : null;
}

async function guardarConversacion(usuario, estado, metadatos = {}) {
  if (!supabaseConfigurado()) return null;

  const payload = {
    channel_user_id: usuario,
    customer: extraerClienteDesdeEstado(estado),
    state: estado,
    status: estadoCliente(estado),
    last_message: metadatos.mensaje || null,
    last_response: metadatos.respuesta || null,
    last_interaction_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const filas = await requestSupabase(`${CONVERSATIONS_TABLE}?on_conflict=channel_user_id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });

  return filas && filas.length ? filas[0] : null;
}

async function guardarMensaje(usuario, direccion, cuerpo, conversationId = null) {
  if (!supabaseConfigurado()) return null;

  const payload = {
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

function clavePedido(estado) {
  if (!estado.confirmacionPedidoId) {
    estado.confirmacionPedidoId = crypto.randomUUID();
  }

  return estado.confirmacionPedidoId;
}

async function guardarPedidoConfirmado(usuario, conversationId, estado) {
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

  return requestSupabase(`${ORDERS_TABLE}?on_conflict=channel_user_id,order_key`, {
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

async function ultimoPedidoConfirmado(usuario) {
  if (!supabaseConfigurado()) return null;

  const query = `${ORDERS_TABLE}?channel_user_id=eq.${encodeURIComponent(
    usuario
  )}&status=eq.confirmado&select=*&order=confirmed_at.desc&limit=1`;

  const filas = await requestSupabase(query);
  return filas && filas.length ? filas[0] : null;
}

async function mensajesPorConversacion(conversationId, usuario) {
  if (!supabaseConfigurado()) return [];

  const filtros = conversationId
    ? `conversation_id=eq.${conversationId}`
    : `channel_user_id=eq.${encodeURIComponent(usuario)}`;

  return requestSupabase(`${MESSAGES_TABLE}?${filtros}&select=*&order=created_at.asc`);
}

module.exports = {
  supabaseConfigurado,
  buscarConversacion,
  guardarConversacion,
  guardarMensaje,
  guardarPedidoConfirmado,
  ultimoPedidoConfirmado,
  mensajesPorConversacion,
};
