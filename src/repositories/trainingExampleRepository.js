const { requestSupabase, supabaseConfigurado } = require("./supabaseClient");

const TRAINING_EXAMPLES_TABLE = process.env.SUPABASE_TRAINING_EXAMPLES_TABLE || "training_examples";

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

function filtroCliente(cliente = null) {
  return /^[0-9a-f-]{36}$/i.test(cliente?.id || '') ? `&or=(client_id.is.null,client_id.eq.${cliente.id})` : "&client_id=is.null";
}

async function obtenerEjemplosEntrenamiento(mensaje, limite = 8, cliente = null) {
  if (!supabaseConfigurado()) return [];

  try {
    const query = `${TRAINING_EXAMPLES_TABLE}?active=eq.true${filtroCliente(
      cliente
    )}&select=intent,customer_message,ideal_response,notes,tags,priority&order=priority.desc,created_at.desc&limit=30`;
    const respuestas = await Promise.allSettled([
      requestSupabase(query),
      ...(process.env.LEARNING_RETRIEVAL_ENABLED !== 'false' && /^[0-9a-f-]{36}$/i.test(cliente?.id || '')
        ? [requestSupabase(`${TRAINING_EXAMPLES_TABLE}?active=eq.true&client_id=eq.${cliente.id}&tags=cs.${encodeURIComponent('{learning:v1,learning:approved}')}&select=intent,customer_message,ideal_response,notes,tags,priority&order=updated_at.desc&limit=100`)] : []),
    ]);
    const ejemplos = [...new Map(respuestas.filter(r => r.status === 'fulfilled').flatMap(r => r.value || [])
      .filter(e => !e.tags?.includes('learning:v1') || (process.env.LEARNING_RETRIEVAL_ENABLED !== 'false' && e.tags.includes('learning:approved')))
      .map(e => [JSON.stringify([e.intent, e.customer_message, e.ideal_response]), e])).values()];

    return ejemplos
      .map((ejemplo) => ({ ...ejemplo, puntaje: puntuarEjemplo(mensaje, ejemplo) }))
      .filter((ejemplo) => ejemplo.puntaje > 0 || (!ejemplo.tags?.includes('learning:v1') && ejemplo.priority > 50))
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
