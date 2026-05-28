const TRAINING_EXAMPLES_TABLE = process.env.SUPABASE_TRAINING_EXAMPLES_TABLE || "training_examples";

function obtenerApiKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function supabaseConfigurado() {
  return Boolean(process.env.SUPABASE_URL && obtenerApiKey());
}

function supabaseUrl(path) {
  return `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`;
}

async function requestSupabase(path, opciones = {}) {
  if (!supabaseConfigurado()) return null;

  const apiKey = obtenerApiKey();
  const respuesta = await fetch(supabaseUrl(path), {
    ...opciones,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(opciones.headers || {}),
    },
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(`Supabase ${respuesta.status}: ${detalle}`);
  }

  const texto = await respuesta.text();
  return texto ? JSON.parse(texto) : null;
}

function normalizar(texto = "") {
  return texto
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function puntuarEjemplo(mensaje, ejemplo) {
  const texto = normalizar(mensaje);
  const base = normalizar(`${ejemplo.customer_message || ""} ${(ejemplo.tags || []).join(" ")}`);
  const palabras = texto.split(" ").filter((palabra) => palabra.length > 3);

  return palabras.reduce((total, palabra) => total + (base.includes(palabra) ? 1 : 0), 0);
}

async function obtenerEjemplosEntrenamiento(mensaje, limite = 4) {
  if (!supabaseConfigurado()) return [];

  try {
    const query = `${TRAINING_EXAMPLES_TABLE}?active=eq.true&select=intent,customer_message,ideal_response,notes,tags,priority&order=priority.desc,created_at.desc&limit=30`;
    const ejemplos = (await requestSupabase(query)) || [];

    return ejemplos
      .map((ejemplo) => ({ ...ejemplo, puntaje: puntuarEjemplo(mensaje, ejemplo) }))
      .filter((ejemplo) => ejemplo.puntaje > 0 || ejemplo.priority > 50)
      .sort((a, b) => b.puntaje - a.puntaje || b.priority - a.priority)
      .slice(0, limite)
      .map(({ puntaje, ...ejemplo }) => ejemplo);
  } catch (error) {
    if (!error.message.includes("training_examples")) {
      console.error("Error cargando ejemplos de entrenamiento:", error.message);
    }
    return [];
  }
}

module.exports = {
  obtenerEjemplosEntrenamiento,
};
