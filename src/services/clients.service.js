const { requestSupabase, supabaseConfigurado } = require("../repositories/supabaseClient");

const CLIENTS_TABLE = process.env.SUPABASE_CLIENTS_TABLE || "aivance_clients";
const CHANNELS_TABLE = process.env.SUPABASE_CLIENT_CHANNELS_TABLE || "client_channels";
const PROMPTS_TABLE = process.env.SUPABASE_CLIENT_PROMPTS_TABLE || "client_prompts";
const DELIVERY_RULES_TABLE = process.env.SUPABASE_CLIENT_DELIVERY_RULES_TABLE || "client_delivery_rules";
const DEFAULT_PLATFORM_NAME = "AIVANCE";
const DEFAULT_CLIENT_CACHE_MS = 60 * 1000;

const cacheClientes = new Map();

function obtenerCache(key) {
  const entrada = cacheClientes.get(key);
  if (!entrada) return null;

  if (entrada.expiresAt <= Date.now()) {
    cacheClientes.delete(key);
    return null;
  }

  return entrada.value;
}

function guardarCache(key, value) {
  cacheClientes.set(key, {
    value,
    expiresAt: Date.now() + Number(process.env.CLIENT_CACHE_MS || DEFAULT_CLIENT_CACHE_MS),
  });
}

function normalizarCliente(fila, resolution = "supabase") {
  const vertical = fila.business_type || fila.vertical || null;
  return {
    id: fila.id,
    slug: fila.slug,
    name: fila.name,
    vertical,
    business_type: vertical,
    businessType: vertical,
    tipo_negocio: vertical,
    platform: fila.owner_platform || DEFAULT_PLATFORM_NAME,
    settings: fila.settings || {},
    config: {
      settings: fila.settings || {},
      prompts: {},
      deliveryRules: [],
      channel: null,
    },
    prompts: {},
    deliveryRules: [],
    resolution,
  };
}

function promptsPorClave(filas = []) {
  return filas.reduce((prompts, fila) => {
    if (!prompts[fila.prompt_key]) prompts[fila.prompt_key] = fila.content;
    return prompts;
  }, {});
}

async function cargarPromptsCliente(clientId) {
  const query = `${PROMPTS_TABLE}?client_id=eq.${clientId}&active=eq.true&select=prompt_key,content,metadata,priority&order=priority.desc,updated_at.desc`;
  return promptsPorClave((await requestSupabase(query)) || []);
}

async function cargarReglasEntregaCliente(clientId) {
  const query = `${DELIVERY_RULES_TABLE}?client_id=eq.${clientId}&active=eq.true&select=rule_type,name,value,metadata,priority&order=priority.desc,updated_at.desc`;
  return (await requestSupabase(query)) || [];
}

async function cargarExtrasCliente(cliente) {
  if (!cliente?.id) return cliente;

  const [prompts, deliveryRules] = await Promise.all([
    cargarPromptsCliente(cliente.id).catch((error) => {
      console.error("Error cargando prompts del cliente:", error.message);
      return {};
    }),
    cargarReglasEntregaCliente(cliente.id).catch((error) => {
      console.error("Error cargando reglas de entrega del cliente:", error.message);
      return [];
    }),
  ]);

  return {
    ...cliente,
    prompts,
    deliveryRules,
    config: {
      ...(cliente.config || {}),
      settings: cliente.settings || {},
      prompts,
      deliveryRules,
    },
  };
}

async function buscarClientePorId(id, resolution = "client_id") {
  if (!id) return null;

  const query = `${CLIENTS_TABLE}?id=eq.${id}&status=eq.active&select=id,slug,name,vertical,business_type,owner_platform,settings&limit=1`;
  const filas = (await requestSupabase(query)) || [];
  return filas[0] ? cargarExtrasCliente(normalizarCliente(filas[0], resolution)) : null;
}

async function buscarClientePorSlug(slug, resolution = "slug") {
  if (!slug) return null;

  const query = `${CLIENTS_TABLE}?slug=eq.${encodeURIComponent(
    slug
  )}&status=eq.active&select=id,slug,name,vertical,business_type,owner_platform,settings&limit=1`;
  const filas = (await requestSupabase(query)) || [];
  return filas[0] ? cargarExtrasCliente(normalizarCliente(filas[0], resolution)) : null;
}

function canalDesdeEvento(evento = {}) {
  return {
    provider: "kapso",
    channel: "whatsapp",
    phoneNumberId: evento.phoneNumberId || null,
    workspaceId: evento.workspaceId || null,
    integrationId: evento.integrationId || null,
  };
}

function filtrosCanal(canal) {
  return [
    ["phone_number_id", canal.phoneNumberId, "phone_number_id"],
    ["workspace_id", canal.workspaceId, "workspace_id"],
    ["integration_id", canal.integrationId, "integration_id"],
  ].filter(([, valor]) => Boolean(valor));
}

async function buscarFilaCanal(canal, campo, valor) {
  const query = `${CHANNELS_TABLE}?provider=eq.${canal.provider}&channel=eq.${canal.channel}&${campo}=eq.${encodeURIComponent(
    valor
  )}&active=eq.true&select=client_id,settings,display_name&limit=1`;
  const filas = (await requestSupabase(query)) || [];
  return filas[0] || null;
}

async function buscarClientePorCanal(evento = {}) {
  const canal = canalDesdeEvento(evento);
  const filtros = filtrosCanal(canal);
  if (!filtros.length) return null;

  const cacheKey = `channel:${canal.provider}:${canal.channel}:${filtros
    .map(([campo, valor]) => `${campo}:${valor}`)
    .join("|")}`;
  const cache = obtenerCache(cacheKey);
  if (cache) return cache;

  for (const [campo, valor, resolution] of filtros) {
    const filaCanal = await buscarFilaCanal(canal, campo, valor);
    const cliente = filaCanal?.client_id ? await buscarClientePorId(filaCanal.client_id, resolution) : null;
    if (cliente) {
      const conCanal = {
        ...cliente,
        channel: {
          provider: canal.provider,
          channel: canal.channel,
          resolution,
          phoneNumberId: canal.phoneNumberId,
          workspaceId: canal.workspaceId,
          integrationId: canal.integrationId,
          displayName: filaCanal.display_name || null,
          settings: filaCanal.settings || {},
        },
        config: {
          ...(cliente.config || {}),
          channel: {
            provider: canal.provider,
            channel: canal.channel,
            resolution,
            phoneNumberId: canal.phoneNumberId,
            workspaceId: canal.workspaceId,
            integrationId: canal.integrationId,
            displayName: filaCanal.display_name || null,
            settings: filaCanal.settings || {},
          },
        },
      };

      guardarCache(cacheKey, conCanal);
      return conCanal;
    }
  }

  return null;
}

function sandboxActivoParaEvento(evento = {}) {
  if (process.env.NODE_ENV === "production") return false;

  const phoneNumberId = evento.phoneNumberId || null;
  const sandboxPhoneNumberId = process.env.KAPSO_SANDBOX_PHONE_NUMBER_ID || process.env.KAPSO_PHONE_NUMBER_ID;
  return Boolean(phoneNumberId && sandboxPhoneNumberId && phoneNumberId === sandboxPhoneNumberId);
}

async function buscarClienteSandbox(evento = {}) {
  if (!sandboxActivoParaEvento(evento)) return null;

  const slug = process.env.KAPSO_SANDBOX_CLIENT_SLUG;
  if (!slug) return null;

  const cacheKey = `sandbox:${evento.phoneNumberId}:${slug}`;
  const cache = obtenerCache(cacheKey);
  if (cache) return cache;

  const cliente = await buscarClientePorSlug(slug, "sandbox");
  if (cliente) guardarCache(cacheKey, cliente);
  return cliente;
}

async function obtenerClienteActual(evento = {}) {
  if (!supabaseConfigurado()) {
    throw new Error("Supabase es obligatorio para resolver clientes");
  }

  const clientePorCanal = await buscarClientePorCanal(evento);
  if (clientePorCanal) return clientePorCanal;

  const clienteSandbox = await buscarClienteSandbox(evento);
  if (clienteSandbox) return clienteSandbox;

  throw new Error(
    `No hay cliente activo asociado al canal de WhatsApp phone_number_id=${evento.phoneNumberId || "desconocido"}`
  );
}

function limpiarCacheClientes() {
  cacheClientes.clear();
}

module.exports = {
  DEFAULT_PLATFORM_NAME,
  limpiarCacheClientes,
  obtenerClienteActual,
};
