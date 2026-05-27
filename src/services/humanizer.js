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

async function humanizarRespuesta(mensajeCliente, respuestaBase) {
  if (!openai || process.env.HUMANIZAR_IA === "false") {
    return respuestaBase;
  }

  if (respuestaBase.includes("Datos de domicilio:")) {
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

Reglas estrictas:
- No inventes marcas, referencias, presentaciones, precios, cantidades ni beneficios.
- Conserva exactamente todas las líneas que empiecen por "- ", "Precio:" o "Total:".
- Conserva exactamente pesos y precios como aparecen.
- Mantén la respuesta corta, clara y vendedora, tipo WhatsApp.
- Si falta información, haz solo una pregunta.
          `.trim(),
        },
        {
          role: "user",
          content: `Mensaje del cliente: ${mensajeCliente}\n\nRespuesta base:\n${respuestaBase}`,
        },
      ],
    });

    const respuesta = completion.choices[0].message.content.trim();
    if (!respuesta || !conservaDatosCriticos(respuestaBase, respuesta)) {
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
