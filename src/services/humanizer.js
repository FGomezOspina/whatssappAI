const { medir } = require('./pipelineTelemetry');
const { precioPorCantidad } = require('../utils/catalogCommercialRules');
const OpenAI = require("openai");
const { modeloHumanizador } = require("./modelRouter");
const { logUsoIA } = require("./aiUsageLogger");
const {
  construirSolicitudHumanizador,
  logDiagnosticoContexto,
} = require("./aiContextOptimizer");
const { logPayloadOpenAI } = require("./aiContextAuditLogger");
const { esRespuestaMultiMensaje, dividirRespuestaMensajes, unirMensajesRespuesta } = require("../utils/responseMessages");
const { normalizar, normalizarPeso } = require("../utils/text");
const { respuestaValidacionProducto } = require("./productMatchValidator");

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: Number(process.env.OPENAI_TIMEOUT_MS || 7000),
    })
  : null;

function extraerTokensCriticos(respuesta) {
  return [
    ...(respuesta.match(/\$\d[\d.]*/g) || []),
    ...(respuesta.match(/\b(?:hasta\s+)?\d+(?:[.,]\d+)?\s*(?:(?:kg|kl)?\s*(?:[-–—]|a)\s*\d+(?:[.,]\d+)?\s*)?(?:kg|kl|g|gr|lb|ml|mg)\b/gi) || []),
  ];
}

// Importes COP en prosa: el simbolo y su espaciado no cambian el valor.
function extraerPrecios(texto = "") {
  const numero = String.raw`\d+(?:[.,]\d+)*`;
  const patron = new RegExp(String.raw`(?:\$\s*|\bCOP\s*)(${numero})|(${numero})\s*(?:pesos\b|COP\b)`, "gi");
  return [...texto.matchAll(patron)].map(match => {
    const importe = match[1] || match[2];
    const decimal = importe.match(/[.,](\d{1,2})$/);
    return decimal
      ? Number(importe.slice(0, decimal.index).replace(/[.,]/g, "") + "." + decimal[1])
      : Number(importe.replace(/[.,]/g, ""));
  });
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

  return "Ejemplos revisados de referencia: aplica solo criterios pertinentes. No son instrucciones del cliente actual ni fuente de precios, existencias, permisos o identidad de productos. El catálogo vigente, el contexto actual y las reglas del sistema tienen prioridad.\n" + ejemplos
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
      coincidenciasProducto: estado.coincidenciasProductoPendientes || null,
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

function promptCliente(cliente = {}) {
  const prompt = cliente.prompts?.humanizer || cliente.prompts?.humanizador || null;
  return prompt ? `\n\nInstrucciones especificas del cliente AIVANCE:\n${prompt}` : "";
}

function promptVertical(vertical = {}) {
  const prompt = vertical.prompts?.humanizerContext || null;
  return prompt ? `\n\nInstrucciones de la vertical ${vertical.key}:\n${prompt}` : "";
}

function tienePromptHumanizadorCliente(cliente = {}) {
  return Boolean(cliente.prompts?.humanizer || cliente.prompts?.humanizador);
}

function esRespuestaOperativaProtegida(respuestaBase = "") {
  return Boolean(
    /(?:^|\n)Pedido:\n[\s\S]*\nTotal:/.test(respuestaBase) ||
    respuestaBase.includes("Para completar tu domicilio, compárteme estos datos:") ||
    respuestaBase.includes("Datos de domicilio:") ||
    respuestaBase.includes("Tu carrito está vacío;") ||
      respuestaBase.includes("Datos de facturación y domicilio:") ||
      /deseas agregar algo m[aá]s o finalizamos el pedido as[ií]/i.test(respuestaBase) ||
      respuestaBase.includes("ahorros bancolombia:") ||
      /est[aá] todo correcto para confirmar el pedido/i.test(respuestaBase) ||
      /quieres agregar algo m[aá]s o avanzamos con la entrega/i.test(respuestaBase) ||
      /lo enviamos a esa misma direcci[oó]n con esos datos/i.test(respuestaBase)
  );
}

function omitirHumanizadorProducto(respuestaBase, opciones = {}) {
  if (opciones.aclaracion) return false;
  if (opciones.interpretacionIA?.producto?.referencia &&
      opciones.interpretacionIA?.producto?.presentacion) return false;
  const respuestaConPresentacionesCotizadas =
    /referencia.*presentaciones|referencias.*presentaciones/i.test(
      respuestaBase
    );
  if (respuestaConPresentacionesCotizadas) return false;

  return Boolean(
    opciones.clasificacion?.perfilContexto === "producto" &&
      !tienePromptHumanizadorCliente(opciones.cliente) &&
      process.env.HUMANIZER_PRODUCT_SEARCH !== "true" &&
      respuestaBase.length <= Number(process.env.HUMANIZER_PRODUCT_MAX_BASE_CHARS || 1600)
  );
}

function debeHumanizarRespuesta(respuestaBase, opciones = {}) {
  if (!openai || process.env.HUMANIZAR_IA === "false") return false;
  if (esRespuestaOperativaProtegida(respuestaBase)) return false;

  if (omitirHumanizadorProducto(respuestaBase, opciones)) return false;

  return true;
}

async function humanizarRespuesta(mensajeCliente, respuestaBase, opciones = {}) {
  if (opciones.resumenCompacto) {
    opciones.onUsage?.({ skipped: true, reason: 'resumen_compacto' });
    return respuestaBase;
  }
  // Una aclaracion de un item no oculta los productos ya guardados.
  if (opciones.estado?.carrito?.length &&
      opciones.estado.ultimaSolicitudProductos?.some(item => item.estado === "pendiente") &&
      typeof respuestaBase === "string" && !respuestaBase.includes("Pedido:")) {
    const resumen = opciones.vertical?.orderLogic?.resumenCarrito;
    if (resumen) respuestaBase += `\n\n${resumen(opciones.estado)}`;
  }
  if (opciones.productoAutonomo) {
    // Keep banking facts outside generation. The motor may have prefixed the
    // product to the banking segment; move that prefix into the commercial reply.
    if (esRespuestaMultiMensaje(respuestaBase)) {
      const partes = dividirRespuestaMensajes(respuestaBase);
      const indiceBanco = partes.findIndex(parte => parte.includes("Datos para transferencia:"));
      if (indiceBanco >= 0) {
        const inicioBanco = partes[indiceBanco].indexOf("Datos para transferencia:");
        const cuentas = partes[indiceBanco].slice(inicioBanco);
        const comercial = [partes[indiceBanco].slice(0, inicioBanco),
          ...partes.filter((_, i) => i !== indiceBanco)].filter(Boolean).join("\n\n");
        return unirMensajesRespuesta([cuentas,
          await humanizarRespuesta(mensajeCliente, comercial, opciones)]);
      }
    }
    if (esRespuestaOperativaProtegida(respuestaBase) &&
        /Datos de facturación|Datos de domicilio|Datos para transferencia|Para completar tu domicilio/.test(respuestaBase)) {
      const inicioPedido = respuestaBase.indexOf("Pedido:");
      if (inicioPedido > 0 && !respuestaBase.slice(0, inicioPedido).includes("Datos para transferencia")) {
        const introduccion = await redactarRespuestaProducto(mensajeCliente, respuestaBase.slice(0, inicioPedido), opciones);
        return `${introduccion}\n\n${respuestaBase.slice(inicioPedido)}`;
      }
      return respuestaBase;
    }
    const inicioResumen = respuestaBase.indexOf("Pedido:");
    if (inicioResumen === 0) return respuestaBase;
    if (inicioResumen > 0) {
      let introduccion = await redactarRespuestaProducto(mensajeCliente,
        respuestaBase.slice(0, inicioResumen), opciones);
      if (opciones.interpretacionIA?.preguntaPendiente) {
        // El cierre protegido ya contiene la pregunta pendiente. La introduccion
        // generada solo informa acciones; no publica otra copia de la pregunta.
        introduccion = introduccion.replace(/(?:[^.!?\n]|\.(?=\d))*¿[^?]*\?/g, "").trim();
      }
      return [introduccion, respuestaBase.slice(inicioResumen)].filter(Boolean).join("\n\n");
    }
    return redactarRespuestaProducto(mensajeCliente, respuestaBase, opciones);
  }
  if (esRespuestaMultiMensaje(respuestaBase)) {
    opciones.onUsage?.({ skipped: true, reason: "respuesta_multi_mensaje" });
    return respuestaBase;
  }

  if (!debeHumanizarRespuesta(respuestaBase, opciones)) {
    opciones.onUsage?.({ skipped: true, reason: "respuesta_operativa_suficiente" });
    return respuestaBase;
  }

  try {
    const model = opciones.model || modeloHumanizador(opciones.clasificacion);
    const solicitud = construirSolicitudHumanizador({
      mensaje: mensajeCliente,
      respuestaBase,
      interpretacion: opciones.interpretacionIA,
      clasificacion: opciones.clasificacion,
      estado: opciones.estado,
      cliente: opciones.cliente,
      vertical: opciones.vertical,
      model,
    });
    logDiagnosticoContexto(solicitud.diagnostico);
    if (solicitud.excedePresupuesto) {
      opciones.onUsage?.({ skipped: true, reason: "presupuesto_contexto" });
      return respuestaBase;
    }
    const parametrosModelo = {
      model,
      messages: [
        {
          role: "system",
          content: solicitud.promptBase || `
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
- Si la respuesta base menciona medicamento, confirmacion responsable, veterinario, uso, dosis o tratamiento, conserva esa cautela. No recomiendes diagnosticos, dosis ni tratamientos.
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
${promptVertical(opciones.vertical)}
${promptCliente(opciones.cliente)}
          `.trim(),
        },
        {
          role: "user",
          content: JSON.stringify(solicitud.contexto),
        },
      ],
    };

    if (!/^gpt-5/i.test(model)) {
      parametrosModelo.temperature = 0.55;
    }
    logPayloadOpenAI({
      etapa: "humanizador",
      model,
      cliente: opciones.cliente,
      channelUserId: opciones.channelUserId,
      perfil: solicitud.perfil,
      messages: parametrosModelo.messages,
    });

    const inicio = Date.now();
    const completion = await medir('openai_request', () => openai.chat.completions.create({
      ...parametrosModelo,
    }), { kind: "humanizer" });
    const duracionMs = Date.now() - inicio;

    logUsoIA({
      etapa: "humanizador",
      channelUserId: opciones.channelUserId,
      cliente: opciones.cliente,
      intencion: opciones.clasificacion?.intencion,
      modelo: model,
      duracionMs,
      usage: completion.usage,
    });
    opciones.onUsage?.({
      skipped: false,
      usage: completion.usage || null,
      model,
      estimatedTokens: solicitud.diagnostico.tokensEstimados,
    });

    const respuesta = completion.choices[0].message.content.trim();
    if (!respuesta || /\b(?:OCR|inteligencia artificial|como (?:una? )?(?:IA|modelo))\b|(?:analiz|interpret|disting|identific|proces)[^.!?\n]{0,60}(?:imagen|foto|empaque)|alcanc[eé] a (?:identificar|distinguir)/i.test(respuesta) || !conservaDatosCriticos(respuestaBase, respuesta) || !conservaAccionOperativa(respuestaBase, respuesta)) {
      return respuestaBase;
    }

    return respuesta;
  } catch (error) {
    console.error("Error humanizando respuesta:", error.message);
    opciones.onUsage?.({ skipped: true, reason: "error", error: error.message });
    return respuestaBase;
  }
}

async function redactarRespuestaProducto(mensaje, respuestaOperativa, opciones) {
  const hechos = opciones.productoAutonomo;
  // No hay una identidad que confirmar si la busqueda no encontro candidatos
  // compatibles. Una pregunta generada no debe convertir ausencia en certeza.
  if (hechos.nivel === "baja" && !hechos.aclaracion && !hechos.alternativas?.length) {
    opciones.onUsage?.({ skipped: true, reason: "sin_coincidencia_catalogo" });
    return respuestaValidacionProducto(hechos);
  }
  if (!openai) throw new Error("OpenAI no disponible para redactar la respuesta de producto");
  const incierto = ["media", "baja"].includes(hechos.nivel);
  const coincidencia = hechos.coincidencia;
  const cantidadSolicitada = Number(opciones.interpretacionIA?.producto?.cantidad || 1);
  const precioVigente = (p, identidad, cantidad) => {
    const item = opciones.interpretacionIA?.accion !== "consultar" && opciones.estado?.carrito?.find(item =>
      normalizar(item.marca) === normalizar(identidad.marca) &&
      normalizar(item.referencia) === normalizar(p.referencia || identidad.referenciaCatalogo || identidad.referencia) &&
      normalizarPeso(item.peso) === normalizarPeso(p.peso));
    const { metadata, ...presentacion } = p;
    return { ...presentacion, precio: item ? item.precio : precioPorCantidad(p, cantidad) };
  };
  const presentaciones = (coincidencia?.presentaciones || []).filter(p =>
    !hechos.presentacionSolicitada || normalizarPeso(p.peso) === normalizarPeso(hechos.presentacionSolicitada))
    .map(p => precioVigente(p, coincidencia, cantidadSolicitada));
  const cotizacionCantidad = !incierto && opciones.interpretacionIA?.accion === "consultar" &&
    presentaciones.length === 1 && Number.isInteger(cantidadSolicitada) && cantidadSolicitada > 1
    ? { unidades: cantidadSolicitada, precioUnitario: Number(presentaciones[0].precio),
        total: cantidadSolicitada * Number(presentaciones[0].precio) } : null;
  const resultados = hechos.resultados?.map(item => {
    if (!item.coincidencia) return item;
    const peso = item.solicitud?.presentacion;
    return { ...item, pendiente: peso ? null : "presentacion",
      coincidencia: { ...item.coincidencia, presentaciones: peso
        ? item.coincidencia.presentaciones.filter(p => normalizarPeso(p.peso) === normalizarPeso(peso))
            .map(p => precioVigente(p, item.coincidencia, item.solicitud?.cantidad || 1))
        : item.coincidencia.presentaciones.map(p => ({ peso: p.peso })) } };
  });
  const contexto = {
    mensaje,
    especieConocida: hechos.especieConocida || opciones.interpretacionIA?.producto?.especie || null,
    cotizacionCantidad,
    resultado: incierto ? { nivel: hechos.nivel, aclaracion: hechos.aclaracion,
      presentacionSolicitada: hechos.presentacionSolicitada, terminos: hechos.terminos,
      candidatos: (hechos.alternativas || []).map(p => ({ marca: p.marca, referencia: p.referencia,
        presentaciones: p.presentaciones?.map(p => ({ peso: p.peso })) })) }
      : { ...hechos, ...(resultados ? { resultados } : {}), coincidencia: coincidencia && { ...coincidencia, presentaciones } },
    hechosOperativos: incierto ? null : respuestaOperativa,
    accion: opciones.interpretacionIA?.accion || null,
    preguntaPendiente: opciones.interpretacionIA?.preguntaPendiente || null,
    carrito: incierto ? undefined : opciones.estado?.carrito?.map(({ precioBase, preciosPorCantidad, ...item }) => item),
    ultimaPregunta: opciones.estado?.ultimaPreguntaAsistente || null,
    instruccionesCliente: opciones.cliente?.prompts?.humanizer || opciones.cliente?.prompts?.humanizador || null,
  };
  const prompt = `Redacta autonomamente una respuesta de WhatsApp en español colombiano para atender el mensaje completo.
Usa exclusivamente los hechos validados. Los precios unitarios y totales actuales sustituyen los de la ultima pregunta o mensajes anteriores; no reutilices importes historicos al cambiar cantidades. Los hechos operativos describen el resultado del motor, no son una plantilla ni texto que debas copiar.
Si resultado.equivalenciaPresentacion existe, la presentacion solicitada esta disponible bajo ese nombre comercial. Responde con el peso y precio del catalogo; no niegues disponibilidad ni la presentes como una alternativa diferente.
Un detalle recordado del empaque puede servir como pista sin estar registrado. No afirmes colores o caracteristicas del empaque que los hechos no confirmen. Si la referencia esta validada, comunica sus datos y pregunta solo la presentacion pendiente; si varias referencias encajan, aclara antes de elegir.
La ultimaPregunta es historica, no una aclaracion vigente. Si los resultados actuales tienen identidad y presentacion resueltas, no vuelvas a pedir peso, especie o referencia. Solo pregunta por atributos que figuren pendientes en los resultados actuales; el siguiente paso de domicilio se conserva por separado.
Si especieConocida tiene valor, no preguntes si es para perro o gato. Conserva esa especie y pide únicamente la variante pendiente. No conviertas una referencia candidata en una referencia confirmada.
Si hay coincidencia confirmada, comunica con naturalidad la referencia, presentacion y precio solicitado en una frase breve; evita encabezados, fichas repetidas, listas para un solo producto y lenguaje sobre coincidencias, opciones cercanas, catalogo, identificacion o procesos internos. No repitas marca y referencia. No uses una apertura fija: elige tu redaccion segun la conversacion.
Si falta peso_mascota, la marca ya esta identificada: pregunta de forma natural por el peso de la mascota y, si requiereEspecie, tambien si es perro o gato. No pidas el nombre del empaque. Si el motivo es limite_peso_ambiguo o peso_fuera_de_rangos, explica ese dato sin recomendar otra dosis ni elegir un rango no validado.
Si la identidad es incierta o no hay coincidencia, haz una pregunta breve que aporte el dato que falta para identificarla. Usa los atributos que distinguen candidatos; no vuelvas a pedir peso o marca ya expresados. Incluye las opciones concretas de la aclaracion (etapas o nombres de referencias compatibles); no preguntes simplemente por la referencia exacta. Conserva el peso solicitado y no sugieras categorias ni formatos distintos. Nunca pidas al cliente el precio del catalogo: la aclaracion debe resolver la identidad del producto, no pedirle datos comerciales de la tienda. No cotices candidatos inciertos, no los declares disponibles y no ofrezcas comprar otra referencia como si fuera la solicitada.
Si el cliente cuenta una experiencia junto con su consulta, puedes reconocerla brevemente antes de responder; no conviertas productos del relato en solicitudes actuales. Ajusta el detalle a su necesidad, sin repetir sus palabras ni usar una apertura fija.
Conserva las acciones realmente realizadas por el motor. Una consulta de precio no agrega al carrito. No confirmes un pedido si solo se agrego un producto. Respeta el siguiente paso operativo sin repetir preguntas resueltas. Mantén todas las solicitudes cuando hay varios productos. Distingue coincidencia de accion realizada: solo di que un articulo quedo agregado si figura en carrito. Los resultados pendientes requieren una pregunta concreta usando el atributo que falta y los datos ya solicitados; no pidas otra vez referencia y presentacion cuando una de ellas ya se conoce. No omitas los productos identificados por atender una aclaracion.
Un resultado con nivel alta y pendiente presentacion ya tiene identidad confirmada: nombra su referencia validada y pregunta solo el peso. No preguntes cual de los productos busca si solicito ambos. Los precios no incluidos no estan autorizados para cotizar.
Si preguntaPendiente contiene una pregunta, el sistema la muestra despues del resumen: no la repitas ni inventes otras preguntas; explica brevemente que productos quedaron agregados y cual esta pendiente.
Solo si el cliente pregunta por domicilio, responde tambien: el precio del producto no es un total con envio. Si los hechos no incluyen una tarifa validada, indica que falta verificar ese costo, sin inventar tarifas, cobertura ni plazos. No inventes cuentas ni datos de pago.
Si cotizacionCantidad existe, indica el precio por unidad y el total de las unidades solicitadas. Esto es una cotizacion, no una adicion al carrito. No deduzcas unidades ni dosis de pautas de administracion.
No cambies cantidades, presentaciones ni precios. Puedes expresarlos en prosa libre sin conservar el formato de la respuesta operativa. Maximo una pregunta util y un emoji. Devuelve solo el mensaje final, sin comentarios tecnicos.`;
  const modelo = opciones.model || modeloHumanizador(opciones.clasificacion);
  let motivoRechazo = null;
  let respuestaAnterior = null;
  const rechazar = motivo => {
    motivoRechazo = motivo;
    console.warn(`[Respuesta Producto] Redaccion rechazada | motivo=${motivo}`);
  };
  for (let intento = 0; intento < 2; intento++) {
    const inicio = Date.now();
    const completion = await medir('openai_request', () => openai.chat.completions.create({ model: modelo,
      messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(contexto) },
        ...(intento ? [
          ...(respuestaAnterior ? [{ role: "assistant", content: respuestaAnterior }] : []),
          { role: "system", content: `Corrige la respuesta anterior. Motivo del rechazo: ${motivoRechazo}. Conserva solo los hechos autorizados. Si la coincidencia esta confirmada, incluye referencia, presentacion y precio unitario validado, ademas de la pregunta operativa pendiente. Corregir una omision no autoriza eliminar los otros datos. Si el resultado es incierto, pide el atributo pendiente mediante una pregunta directa con signos de interrogacion y sin cotizar.` }
        ] : [])],
      ...(!/^gpt-5/i.test(modelo) ? { temperature: 0.55 } : {}),
    }), { kind: "product_response" });
    logUsoIA({ etapa: "respuesta_producto", channelUserId: opciones.channelUserId,
      cliente: opciones.cliente, intencion: opciones.clasificacion?.intencion,
      modelo, duracionMs: Date.now() - inicio, usage: completion.usage });
    opciones.onUsage?.({ skipped: false, usage: completion.usage, model: modelo });
    const respuesta = completion.choices?.[0]?.message?.content?.trim();
    respuestaAnterior = respuesta;
    if (!respuesta) { rechazar("respuesta_vacia"); continue; }
    if (contexto.especieConocida && hechos.aclaracion?.campo !== 'especie' &&
        /[¿?][^?¿]*(?:perro[^?¿]*\bo\b[^?¿]*gato|gato[^?¿]*\bo\b[^?¿]*perro)[^?¿]*[?]/i.test(respuesta)) {
      rechazar('especie_ya_conocida'); continue;
    }
    const precios = extraerPrecios(respuesta);
    const permitidos = new Set(extraerPrecios(respuestaOperativa || ""));
    if (cotizacionCantidad) permitidos.add(cotizacionCantidad.total);
    // El contexto incluye el carrito completo. Sus precios y total tambien
    // son hechos validados aunque el resumen se adjunte fuera del redactor.
    if (!incierto && opciones.estado?.carrito?.length) {
      let total = 0;
      for (const item of opciones.estado.carrito) {
        const precio = Number(item.precio), cantidad = Number(item.cantidad || 1);
        if (!Number.isFinite(precio) || !Number.isFinite(cantidad)) continue;
        permitidos.add(precio); permitidos.add(precio * cantidad); total += precio * cantidad;
      }
      permitidos.add(total);
    }
    const precioAutorizado = precio => permitidos.has(precio);
    if (incierto && precios.length) { rechazar("precio_sin_coincidencia_confirmada"); continue; }
    if (incierto && !respuesta.includes("?")) { rechazar("falta_pregunta_de_aclaracion"); continue; }
    if (incierto && ["referencia", "sabores"].includes(hechos.aclaracion?.campo) && hechos.aclaracion.valores?.length > 1 &&
        hechos.aclaracion.valores.some(valor => !normalizar(respuesta).includes(normalizar(valor.replace(/_/g, " "))))) {
      rechazar("faltan_opciones_de_aclaracion"); continue;
    }
    if (!incierto && respuestaOperativa?.includes("?") && !respuesta.includes("?") &&
        !opciones.interpretacionIA?.preguntaPendiente) { rechazar("falta_siguiente_paso"); continue; }
    if (!incierto && precios.some(p => !precioAutorizado(p))) { rechazar("precio_no_autorizado"); continue; }
    if (cotizacionCantidad && !precios.includes(cotizacionCantidad.total)) {
      rechazar("falta_total_cantidad_solicitada"); continue;
    }
    const cotizacionesMultiples = (resultados || []).filter(item =>
      item.nivel === "alta" && item.coincidencia && item.solicitud?.presentacion)
      .flatMap(item => (item.coincidencia.presentaciones || []).filter(p =>
        normalizarPeso(p.peso) === normalizarPeso(item.solicitud.presentacion))
        .map(p => ({ ...p, referencia: p.referencia || item.coincidencia.referenciaCatalogo || item.coincidencia.referencia })));
    if (cotizacionesMultiples.some(p =>
      !normalizar(respuesta).includes(normalizar(p.referencia)) ||
      (p.precio != null && !precios.includes(Number(p.precio))) ||
      !extraerTokensCriticos(respuesta).some(peso => normalizarPeso(peso) === normalizarPeso(p.peso)))) {
      rechazar("falta_cotizacion_de_producto_identificado"); continue;
    }
    if (!incierto && coincidencia && presentaciones.length === 1) {
      const p = presentaciones[0];
      if (!normalizar(respuesta).includes(normalizar(p.referencia || coincidencia.referenciaCatalogo || coincidencia.referencia))) { rechazar("falta_referencia_validada"); continue; }
      if (!precios.some(valor => valor === Number(p.precio))) { rechazar("falta_precio_validado"); continue; }
      const pesos = extraerTokensCriticos(respuesta).filter(token => !token.startsWith("$"));
      if (/\d\s*(?:kg|gr|g|lb)\b/i.test(p.peso) && !pesos.some(peso => normalizarPeso(peso) === normalizarPeso(p.peso))) { rechazar("falta_presentacion_validada"); continue; }
    }
    if (!opciones.estado?.pedidoConfirmado && /(?:pedido\s+)?(?:queda|quedo|esta)\s+confirmado|confirmado tu pedido|programado para despacho/.test(normalizar(respuesta))) { rechazar("accion_no_autorizada"); continue; }
    if ((incierto || opciones.interpretacionIA?.accion === "consultar") &&
        /(?:agregue|agrego|anadi|inclui|reserve|separe).*(?:pedido|carrito)|(?:pedido|carrito).*(?:agregado|reservado)/.test(normalizar(respuesta))) { rechazar("accion_no_autorizada"); continue; }
    return respuesta;
  }
  // Una aclaracion fallida no deja al cliente sin respuesta. Construirla
  if (motivoRechazo === 'especie_ya_conocida' && incierto) return respuestaValidacionProducto(hechos);
  // desde atributos validados, nunca desde candidatos cotizados ni del carrito.
  if (incierto && hechos.aclaracion?.valores?.length &&
      ["referencia", "especie", "categoria", "etapa", "tamano", "sabores"].includes(hechos.aclaracion.campo)) {
    return respuestaValidacionProducto({ aclaracion: hechos.aclaracion });
  }
  // Un fallo de redaccion no pierde los resultados independientes de una lista.
  // La respuesta del motor contiene solamente importes y acciones validados.
  if (hechos.resultados?.length && respuestaOperativa) return respuestaOperativa;
  // Un ajuste ya ejecutado mantiene su respuesta operativa validada aunque
  // la redacción falle. Nunca publicar los precios rechazados de la IA.
  if (!incierto && respuestaOperativa && opciones.estado?.carrito?.length &&
      (opciones.interpretacionIA?.carrito?.operacion === "modificar_cantidad" ||
       opciones.interpretacionIA?.accion === "modificar_cantidad")) return respuestaOperativa;
  // Una cotizacion invalida sigue sin autorizar publicar importes incorrectos.
  throw new Error(`No se obtuvo una respuesta de producto fiel a los hechos validados: ${motivoRechazo}`);
}

module.exports = {
  conservaAccionOperativa,
  debeHumanizarRespuesta,
  humanizarRespuesta,
  _internals: {
    omitirHumanizadorProducto,
  },
};
