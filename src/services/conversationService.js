const { obtenerClienteActual } = require("./clients.service");
const { obtenerVerticalCliente } = require("../verticals");
const { cargarCatalogoCliente } = require("../repositories/productRepository");
const {
  obtenerConversacionPersistida,
  obtenerHistorialRecientePersistido,
  guardarConversacionPersistida,
} = require("../conversation/conversationStore");
const { obtenerEjemplosEntrenamiento } = require("../repositories/trainingExampleRepository");
const { interpretarMensajeCliente } = require("./aiInterpreter");
const { humanizarRespuesta } = require("./humanizer");
const { procesarMultimedia } = require("./mediaProcessor");

function clienteParaLog(channelUserId = "") {
  if (process.env.NODE_ENV !== "production") return channelUserId || "desconocido";
  return channelUserId ? `***${channelUserId.slice(-4)}` : "desconocido";
}

function registrarEntradaOpenAI(evento, mensaje, imageUrls, contenidos) {
  const audiosOpenAI = contenidos.filter((contenido) => contenido.metadata?.audioTranscribedWithOpenAI).length;
  const imagenesOpenAI = imageUrls.length;
  const multimediaFallback = contenidos.filter(
    (contenido) => contenido.metadata?.tipo === "audio" && !contenido.metadata?.audioTranscribedWithOpenAI
  ).length;

  console.log(
    `[OpenAI] Entrada preparada | cliente=${clienteParaLog(evento.channelUserId)} | textoChars=${
      mensaje.length
    } | imagenesVision=${imagenesOpenAI} | audiosTranscritos=${audiosOpenAI} | multimediaFallback=${multimediaFallback}`
  );
}

function registrarInterpretacionOpenAI(evento, interpretacionIA) {
  if (!interpretacionIA) {
    console.log(`[OpenAI] Interpretacion IA | cliente=${clienteParaLog(evento.channelUserId)} | resultado=null`);
    return;
  }

  const producto = interpretacionIA.producto || {};
  console.log(
    `[OpenAI] Interpretacion IA | cliente=${clienteParaLog(evento.channelUserId)} | intencion=${
      interpretacionIA.intencion || "null"
    } | accion=${interpretacionIA.accion || "null"} | marca=${producto.marca || "null"} | referencia=${
      producto.referencia || "null"
    } | etapa=${producto.etapa || "null"} | tamano=${producto.tamano || "null"} | presentacion=${
      producto.presentacion || "null"
    } | confianza=${interpretacionIA.confianza || 0}`
  );
}

async function responderEventosEntrantes(eventos) {
  if (!eventos.length) throw new Error("No hay eventos entrantes para procesar");

  const evento = eventos[0];
  const cliente = await obtenerClienteActual(evento);
  const vertical = obtenerVerticalCliente(cliente);
  if (!vertical || !vertical.orderLogic || !vertical.productLogic) {
    throw new Error(
      `La vertical ${vertical?.key || cliente.vertical || "desconocida"} no tiene lógica conversacional activa`
    );
  }
  const {
    resolverConsultaCatalogo,
    buscarMarca,
    extraerCriterios,
    tieneCriterios,
    solicitaMarcas,
    solicitaReferencias,
    solicitaRecomendacion,
    solicitaOpinionMarca,
    extraerPresupuesto,
    solicitaCierre,
    esSaludo,
    esAgradecimiento,
  } = vertical.orderLogic;
  const { asegurarRespuestaCatalogo } = vertical.productLogic;
  const [estado, historialReciente] = await Promise.all([
    obtenerConversacionPersistida(evento.channelUserId, cliente),
    obtenerHistorialRecientePersistido(evento.channelUserId, 12, cliente),
  ]);
  let catalogo;
  let contenidos;

  try {
    catalogo = await cargarCatalogoCliente(cliente);
  } catch (error) {
    console.error("Error cargando catálogo desde Supabase:", error.message);
    const respuesta = "No pude cargar el catálogo en este momento. Inténtalo de nuevo en unos minutos.";
    await guardarConversacionPersistida(evento.channelUserId, estado, {
      cliente,
      mensaje: eventos.map((item) => item.text || `[${item.media?.type || "multimedia"}]`).join("\n"),
      respuesta,
    });
    return respuesta;
  }

  try {
    contenidos = await Promise.all(
      eventos.map((item) =>
        procesarMultimedia({
          text: item.text,
          media: item.media,
          logger: console,
          catalogo,
        })
      )
    );
  } catch (error) {
    console.error("Error procesando multimedia:", error.message);
    const respuesta = "No pude procesar ese archivo. Envíamelo de nuevo o cuéntame por texto qué necesitas.";
    await guardarConversacionPersistida(evento.channelUserId, estado, {
      cliente,
      mensaje: eventos
        .map((item) => item.text || `[${item.media?.type || "multimedia"} no procesada]`)
        .join("\n"),
      respuesta,
    });
    return respuesta;
  }

  const mensaje = contenidos
    .map((contenido) => contenido.text.trim())
    .filter(Boolean)
    .join("\n");
  const imageUrls = contenidos.map((contenido) => contenido.imageUrl).filter(Boolean);
  registrarEntradaOpenAI(evento, mensaje, imageUrls, contenidos);

  if (!mensaje && !imageUrls.length) {
    const respuesta = "Cuéntame qué necesitas para tu mascota 🐶";
    await guardarConversacionPersistida(evento.channelUserId, estado, {
      cliente,
      mensaje: evento.text || "",
      respuesta,
    });
    return respuesta;
  }

  const ejemplosEntrenamiento = await obtenerEjemplosEntrenamiento(mensaje, 8, cliente);
  const interpretacionIA = await interpretarMensajeCliente({
    mensaje,
    estado,
    catalogo,
    ejemplosEntrenamiento,
    historialReciente,
    imageUrls,
    cliente,
    vertical,
  });
  registrarInterpretacionOpenAI(evento, interpretacionIA);

  const tieneIntencionCatalogo =
    buscarMarca(catalogo, mensaje) ||
    tieneCriterios(extraerCriterios(mensaje)) ||
    solicitaMarcas(mensaje) ||
    solicitaReferencias(mensaje) ||
    solicitaRecomendacion(mensaje) ||
    solicitaOpinionMarca(mensaje) ||
    extraerPresupuesto(mensaje) ||
    solicitaCierre(mensaje) ||
    ["pedido_producto", "consulta_producto", "consulta_marcas", "recomendacion", "datos_envio", "metodo_pago"].includes(
      interpretacionIA?.intencion
    );

  let respuestaBase;
  if (esSaludo(mensaje) && !tieneIntencionCatalogo && !(estado.pedidoConfirmado && estado.carrito.length)) {
    respuestaBase = "¡Hola! Bienvenido 🐶 ¿Qué necesitas para tu mascota hoy?";
  } else if (
    esAgradecimiento(mensaje) &&
    !tieneIntencionCatalogo &&
    !estado.carrito.length &&
    !estado.esperandoDatosDomicilio
  ) {
    respuestaBase = "Con mucho gusto 🐶";
  } else {
    respuestaBase = resolverConsultaCatalogo(mensaje, estado, catalogo, interpretacionIA);
  }

  const respuestaHumanizada = await humanizarRespuesta(mensaje, respuestaBase, {
    ejemplosEntrenamiento,
    historialReciente,
    estado,
    interpretacionIA,
    cliente,
    vertical,
  });
  const respuesta = asegurarRespuestaCatalogo(mensaje, respuestaHumanizada, { catalogo, interpretacionIA });

  await guardarConversacionPersistida(evento.channelUserId, estado, {
    cliente,
    mensaje,
    respuesta,
  });

  return respuesta;
}

async function responderEventoEntrante(evento) {
  return responderEventosEntrantes([evento]);
}

module.exports = {
  responderEventoEntrante,
  responderEventosEntrantes,
};
