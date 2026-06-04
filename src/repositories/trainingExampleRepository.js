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
  return cliente?.id ? `&or=(client_id.is.null,client_id.eq.${cliente.id})` : "";
}

async function obtenerEjemplosEntrenamiento(mensaje, limite = 8, cliente = null) {
  if (!supabaseConfigurado()) return [];

  try {
    const query = `${TRAINING_EXAMPLES_TABLE}?active=eq.true${filtroCliente(
      cliente
    )}&select=intent,customer_message,ideal_response,notes,tags,priority&order=priority.desc,created_at.desc&limit=30`;
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
