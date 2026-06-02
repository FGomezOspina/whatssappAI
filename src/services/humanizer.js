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
  const baseSolicitaConfirmacionPedido = /est[aá] todo correcto para confirmar el pedido/i.test(respuestaBase);
  const basePreguntaSiguientePaso = /quieres agregar algo m[aá]s o avanzamos con la entrega/i.test(respuestaBase);
  const basePreguntaDatosPrevios = /lo enviamos a esa misma direcci[oó]n con esos datos/i.test(respuestaBase);
  const humanizadaConfirmaPedido =
    /(?:pedido\s+)?(?:queda|qued[oó]|est[aá])\s+confirmad[oa]|confirmad[oa]\s+tu pedido|programad[oa]\s+para despacho|dejamos programad[oa]/i.test(
      respuestaHumanizada
    );
  const humanizadaSolicitaConfirmacion =
    /\?|me confirmas|conf[ií]rmame|deseas confirmar|podemos confirmar|est[aá] todo correcto/i.test(
      respuestaHumanizada
    );

  if (baseSolicitaConfirmacionPedido && (humanizadaConfirmaPedido || !humanizadaSolicitaConfirmacion)) {
    return false;
  }

  if (
    basePreguntaSiguientePaso &&
    !/quieres agregar algo m[aá]s|avanzamos con la entrega|seguimos con la entrega/i.test(respuestaHumanizada)
  ) {
    return false;
  }

  if (basePreguntaDatosPrevios && !/misma direcci[oó]n|mismos datos|esos datos/i.test(respuestaHumanizada)) {
    return false;
  }

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

  const baseAjustaCarrito = /ajust[eé]|dej[eé]|retir[eé]|qued[oó] vac[ií]o|solamente con eso/i.test(respuestaBase);
  const humanizadaAgregaProducto =
    /agreg[uéoe]|inclu[ií]|añad|dej[eé]|separ[ée]|reserv[ée]/i.test(respuestaHumanizada) &&
    /pedido|paquete|producto/i.test(respuestaHumanizada);

  if (baseAjustaCarrito && humanizadaAgregaProducto) {
    return false;
  }

  const baseNiegaPresentacion = /no tengo presentaci[oó]n/i.test(respuestaBase);
  const humanizadaOfreceExacta =
    /opci[oó]n exacta|te lo agrego|ya agreg[uéoe]|dej[eé].*(pedido|paquete)|separ[ée]|reserv[ée]|precio:/i.test(
      respuestaHumanizada
    );

  if (baseNiegaPresentacion && humanizadaOfreceExacta) {
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

function resumenEstadoParaRespuesta(estado = {}) {
  return {
    carrito: estado.carrito || [],
    productosConsultados: estado.productosConsultados || [],
    pedidoConfirmado: Boolean(estado.pedidoConfirmado),
    ultimoPedidoConfirmado: estado.ultimoPedidoConfirmado || null,
    datosDomicilio: estado.datosDomicilio || {},
    entrega: estado.entrega || {},
    metodoPago: estado.metodoPago || null,
    pendientes: {
      referencia: estado.referenciasPendientes || null,
      seleccion: estado.ultimaSeleccion || null,
      productos: estado.productosPendientes || [],
      datosDomicilio: Boolean(estado.esperandoDatosDomicilio),
      metodoPago: Boolean(estado.esperandoMetodoPago),
      tipoEntrega: Boolean(estado.esperandoTipoEntrega),
    },
  };
}

function resumenHistorial(historial = []) {
  return historial.map((mensaje) => ({
    rol: mensaje.direction === "outbound" ? "asistente" : "cliente",
    contenido: mensaje.body,
  }));
}

async function humanizarRespuesta(mensajeCliente, respuestaBase, opciones = {}) {
  if (!openai || process.env.HUMANIZAR_IA === "false") {
    return respuestaBase;
  }

  if (
    respuestaBase.includes("Datos de domicilio:") ||
    respuestaBase.includes("ahorros bancolombia:") ||
    /est[aá] todo correcto para confirmar el pedido/i.test(respuestaBase) ||
    /quieres agregar algo m[aá]s o avanzamos con la entrega/i.test(respuestaBase) ||
    /lo enviamos a esa misma direcci[oó]n con esos datos/i.test(respuestaBase)
  ) {
    return respuestaBase;
  }

  try {
    const model = process.env.OPENAI_MODEL || "gpt-5.2-chat-latest";
    const parametrosModelo = {
      model,
      messages: [
        {
          role: "system",
          content: `
Eres un asesor amable de una tienda de mascotas en Colombia por WhatsApp.
Tu tarea es tomar la respuesta operativa del backend y convertirla en una respuesta final humana.
El backend ya validó catálogo, precios, presentaciones, carrito y datos. Tú decides el tono, el orden y la claridad, pero no cambias los hechos.

Estilo:
- Suena como asesor humano de WhatsApp: cálido, concreto, atento y sin frases robóticas.
- Responde a lo que el cliente acaba de pedir, sin reabrir temas ya resueltos.
- No repitas resumen, datos o preguntas que ya aparezcan como confirmadas en el estado.
- Si el cliente pide varias cosas, atiende lo importante primero y deja una sola siguiente pregunta.
- Cuando haya una negativa de disponibilidad, dilo con naturalidad y ofrece las opciones reales sin sonar brusco.
- Si el cliente cierra la conversación o agradece después de confirmar, responde con cercanía sin volver a pedir datos.
- Puedes usar máximo un emoji si aporta cercanía.

Reglas estrictas:
- No inventes marcas, referencias, presentaciones, precios, cantidades ni beneficios.
- La direccion del cliente es un dato operativo para continuar el pedido, no una solicitud para evaluar cobertura.
- Nunca inventes que no hacemos domicilios en un barrio o sector, que no hay entregas disponibles, que existe un horario o recargo especial, ni que el cliente debe recoger el pedido. Solo menciona una restriccion si respuestaBase la afirma explicitamente.
- No seas complaciente si la respuesta base niega disponibilidad o pide validar un dato: conserva esa negativa o esa pregunta. Un asesor humano tambien dice "no lo manejo" cuando el catalogo no lo permite.
- Conserva exactamente todas las líneas que empiecen por "- ", "Precio:" o "Total:".
- Conserva exactamente pesos y precios como aparecen.
- Mantén la respuesta corta, clara y vendedora, tipo WhatsApp.
- Si falta información, haz solo una pregunta.
- No preguntes por algo que el cliente ya dijo claramente.
- Trata los datos existentes en estado.datosDomicilio como memoria confirmada. No reinterpretar una respuesta corta como reemplazo de nombre, cedula, correo, celular o direccion.
- Si el cliente responde con "efectivo", "transferencia", "tarjeta" o "llave" despues de preguntar el metodo de pago, esa palabra solo corresponde al metodo de pago y nunca al nombre del cliente.
- El mensaje del cliente puede ser un lote de mensajes consecutivos unido por saltos de linea. Responde una sola vez al conjunto: recapitula lo entendido y pide unicamente el siguiente dato realmente faltante.
- Un pedido confirmado anterior es memoria historica. Si el cliente menciona otro producto, no lo mezcles con productos anteriores; conserva solamente los datos de entrega que el backend mantenga en el estado.
- Si respuestaBase pregunta si desea repetir un pedido anterior, conserva productos y direccion en la pregunta para que el cliente pueda decidir con claridad.
- Si la respuesta base ya agregó un producto al pedido, no lo conviertas en pregunta ni pidas confirmar ese mismo producto.
- Si respuestaBase pregunta si todo esta correcto para confirmar el pedido, conserva esa pregunta. Nunca afirmes que el pedido ya quedo confirmado o programado para despacho antes de recibir la confirmacion explicita del cliente.
- Conserva las preguntas operativas del backend. No conviertas "quieres agregar algo mas o avanzamos con la entrega" ni "lo enviamos a esa misma direccion con esos datos" en otra pregunta.
- Si la respuesta base ajusta, retira o deja solo un producto del carrito, conserva esa acción y no digas que agregaste algo nuevo.
- Si la respuesta base dice que una presentación no está disponible, no la conviertas en una opción exacta ni agregues productos al pedido.
- Si solo falta un dato, pide solo ese dato.
- No vuelvas a listar marcas o referencias si la respuesta base no lo hace.
- No reabras el catalogo cuando respuestaBase este continuando una cotizacion o recopilando datos de entrega.
- No repitas información que ya fue confirmada salvo que la respuesta base sea un resumen de pedido.
- Si el estado muestra carrito o datos ya tomados, no los pidas otra vez a menos que la respuesta base lo solicite.

Los ejemplos dinamicos sirven solo como referencia de estilo conversacional.
No son una fuente de politicas operativas: no extraigas de ellos restricciones de cobertura, sectores rechazados, horarios, recargos, disponibilidad de domicilios, inventario, sedes o metodos de pago.
Si contradicen respuestaBase, el estado actual o el mensaje del cliente, ignorarlos.

Ejemplos dinamicos de estilo y criterio:
${formatearEjemplos(opciones.ejemplosEntrenamiento)}
          `.trim(),
        },
        {
          role: "user",
          content: `Mensaje del cliente: ${mensajeCliente}\n\nInterpretacion estructurada de la IA:\n${JSON.stringify(
            opciones.interpretacionIA || null
          )}\n\nHistorial reciente:\n${JSON.stringify(
            resumenHistorial(opciones.historialReciente)
          )}\n\nEstado actual resumido:\n${JSON.stringify(
            resumenEstadoParaRespuesta(opciones.estado)
          )}\n\nRespuesta operativa del backend:\n${respuestaBase}`,
        },
      ],
    };

    if (!/^gpt-5/i.test(model)) {
      parametrosModelo.temperature = 0.55;
    }

    const completion = await openai.chat.completions.create({
      ...parametrosModelo,
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
  conservaAccionOperativa,
  humanizarRespuesta,
};
