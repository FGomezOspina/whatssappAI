const { medir, hash } = require('../services/pipelineTelemetry');
function obtenerApiKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function supabaseConfigurado() {
  return Boolean(process.env.SUPABASE_URL && obtenerApiKey());
}

function headersSupabase() {
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

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function esErrorTransitorioSupabase(error) {
  const mensaje = (error?.message || "").toLowerCase();

  return (
    /fetch failed|network|timeout|timed out|econn|enotfound|eai_again|und_err|socket|aborted/.test(mensaje) ||
    /^supabase 5\d\d/.test(mensaje)
  );
}

async function fetchSupabaseConTimeout(url, opciones = {}) {
  const timeoutMs = Number(process.env.SUPABASE_REQUEST_TIMEOUT_MS || 10000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...opciones,
      signal: opciones.signal || controller.signal,
    });
  } catch (error) {
    const host = new URL(url).host;
    const causa = error.cause?.code || error.cause?.message || error.name || "sin-detalle";
    throw new Error(`Supabase network error host=${host}: ${error.message} (${causa})`);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestSupabase(path, opciones = {}) {
  if (!supabaseConfigurado()) return null;

  const url = supabaseUrl(path);
  const reintentos = Math.max(0, Number(process.env.SUPABASE_REQUEST_RETRIES || 2));
  const esperaBase = Math.max(0, Number(process.env.SUPABASE_RETRY_BASE_MS || 150));
  let ultimoError = null;

  for (let intento = 0; intento <= reintentos; intento += 1) {
    try {
      const respuesta = await medir('supabase_attempt', () => fetchSupabaseConTimeout(url, {
        ...opciones,
        headers: {
          ...headersSupabase(),
          ...(opciones.headers || {}),
        },
      }), { attempt: intento + 1, operation: `${opciones.method || "GET"} ${path.split("?")[0]}` });

      if (!respuesta.ok) {
        const detalle = await respuesta.text();
        throw new Error(`Supabase ${respuesta.status}: ${detalle}`);
      }

      if (respuesta.status === 204) return null;
      const texto = await respuesta.text();
      return texto ? JSON.parse(texto) : null;
    } catch (error) {
      ultimoError = error;
      if (!esErrorTransitorioSupabase(error) || intento >= reintentos) break;

      await esperar(esperaBase * (intento + 1));
    }
  }

  throw ultimoError;
}

module.exports = {
  esErrorTransitorioSupabase,
  obtenerApiKey,
  requestSupabase: (path, opciones = {}) => {
    const datos = {
    operation: `${opciones.method || "GET"} ${path.split("?")[0]}`, queryHash: hash(`${opciones.method || "GET"}:${path}:${opciones.body || ""}`),
    select: new URLSearchParams(path.split("?")[1] || "").get("select"),
    };
    return medir('supabase_request', async () => {
      const resultado = await requestSupabase(path, opciones);
      datos.filas = Array.isArray(resultado) ? resultado.length : resultado == null ? 0 : 1;
      return resultado;
    }, datos);
  },
  supabaseConfigurado,
  supabaseUrl,
};
