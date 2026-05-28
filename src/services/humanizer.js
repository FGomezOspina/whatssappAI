const OpenAI = require("openai");

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: Number(process.env.OPENAI_TIMEOUT_MS || 7000),
    })
  : null;

function extraerTokensCriticos(respuesta) {
  return [
    ...(respuesta.match(/\$\d[\d.]*/g) || []),
    ...(respuesta.match(/\b\d+(?:[.,]\d+)?\s?(?:kg|g|gr|lb)\b/gi) || []),
  ];
}

function conservaDatosCriticos(respuestaBase, respuestaHumanizada) {
  const tokensCriticos = extraerTokensCriticos(respuestaBase);
  const lineasCriticas = respuestaBase
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea.startsWith("- ") || linea.startsWith("Total:") || linea.startsWith("Precio:"));

  return [...tokensCriticos, ...lineasCriticas].every((token) => respuestaHumanizada.includes(token));
}

function conservaAccionOperativa(respuestaBase, respuestaHumanizada) {
  const baseAgregaProducto = /agreg[uéoe]|inclu[ií]|añad/i.test(respuestaBase) && /pedido/i.test(respuestaBase);
  const humanizadaPreguntaSiLoHace = /quieres que|te preparo|te lo preparo|solo dime si quieres|alguna presentaci[oó]n/i.test(
    respuestaHumanizada
  );
  const humanizadaMantieneAccion = /agreg[uéoe]|inclu[ií]|añad/i.test(respuestaHumanizada) && /pedido/i.test(respuestaHumanizada);

  if (baseAgregaProducto && humanizadaPreguntaSiLoHace && !humanizadaMantieneAccion) {
    return false;
  }

  const basePideDatoUnico = /me faltan estos datos|dime la nueva direcci[oó]n|p[aá]same la nueva direcci[oó]n/i.test(
    respuestaBase
  );
  const humanizadaReabreCatalogo = /por ahora tenemos estas opciones|dog chow\s*\n- chunky|qu[eé] marca/i.test(
    respuestaHumanizada
  );

  if (basePideDatoUnico && humanizadaReabreCatalogo) {
    return false;
  }

  return true;
}

function formatearEjemplos(ejemplos = []) {
  if (!ejemplos.length) return "Sin ejemplos dinamicos para este mensaje.";

  return ejemplos
    .map(
      (ejemplo, index) =>
        `${index + 1}. Intencion: ${ejemplo.intent}\nCliente/contexto: ${
          ejemplo.customer_message
        }\nRespuesta ideal: ${ejemplo.ideal_response}\nNota: ${ejemplo.notes || "Aplicar el estilo sin copiar literalmente."}`
    )
    .join("\n\n");
}

async function humanizarRespuesta(mensajeCliente, respuestaBase, opciones = {}) {
  if (!openai || process.env.HUMANIZAR_IA === "false") {
    return respuestaBase;
  }

  if (respuestaBase.includes("Datos de domicilio:") || respuestaBase.includes("ahorros bancolombia:")) {
    return respuestaBase;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.55,
      messages: [
        {
          role: "system",
          content: `
Eres un asesor amable de una tienda de mascotas en Colombia por WhatsApp.
Tu tarea es reescribir la respuesta base para que suene como una persona real: cálida, flexible, atenta y natural.
Evita sonar como plantilla. Puedes cambiar el orden, usar conectores conversacionales y adaptar el tono al mensaje del cliente.
Cuando el cliente cierre la conversación o dé las gracias después de confirmar un pedido, responde con cercanía, sin repetir el pedido ni volver a pedir datos. Puedes usar máximo un emoji si se siente natural.

Reglas estrictas:
- No inventes marcas, referencias, presentaciones, precios, cantidades ni beneficios.
- Conserva exactamente todas las líneas que empiecen por "- ", "Precio:" o "Total:".
- Conserva exactamente pesos y precios como aparecen.
- Mantén la respuesta corta, clara y vendedora, tipo WhatsApp.
- Si falta información, haz solo una pregunta.
- No preguntes por algo que el cliente ya dijo claramente.
- Si la respuesta base ya agregó un producto al pedido, no lo conviertas en pregunta ni pidas confirmar ese mismo producto.
- Si solo falta un dato, pide solo ese dato.
- No vuelvas a listar marcas o referencias si la respuesta base no lo hace.
- No repitas información que ya fue confirmada salvo que la respuesta base sea un resumen de pedido.

Ejemplos dinamicos de estilo y criterio:
${formatearEjemplos(opciones.ejemplosEntrenamiento)}
          `.trim(),
        },
        {
          role: "user",
          content: `Mensaje del cliente: ${mensajeCliente}\n\nRespuesta base:\n${respuestaBase}`,
        },
      ],
    });

    const respuesta = completion.choices[0].message.content.trim();
    if (!respuesta || !conservaDatosCriticos(respuestaBase, respuesta) || !conservaAccionOperativa(respuestaBase, respuesta)) {
      return respuestaBase;
    }

    return respuesta;
  } catch (error) {
    console.error("Error humanizando respuesta:", error.message);
    return respuestaBase;
  }
}

module.exports = {
  humanizarRespuesta,
};
