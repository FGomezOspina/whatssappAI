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

async function requestSupabase(path, opciones = {}) {
  if (!supabaseConfigurado()) return null;

  const respuesta = await fetch(supabaseUrl(path), {
    ...opciones,
    headers: {
      ...headersSupabase(),
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

module.exports = {
  obtenerApiKey,
  requestSupabase,
  supabaseConfigurado,
  supabaseUrl,
};
