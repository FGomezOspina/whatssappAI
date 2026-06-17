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
const { clasificarInteraccion } = require("./interactionClassifier");
const {
  seleccionarCatalogoParaIA,
  seleccionarCatalogoRefinadoVision,
} = require("./catalogContextService");
const { construirMemoriaOperativa } = require("./contextBuilder");
const { modeloInterprete, modeloHumanizador } = require("./modelRouter");
const { clienteParaLog, logResumenInteraccionIA } = require("./aiUsageLogger");
const { respuestaParaHistorial } = require("../utils/responseMessages");
const {
  aplicarCoincidenciaValidada,
  construirConsultaProductoContextual,
  esCorreccionProducto,
  respuestaValidacionProducto,
  validarCoincidenciaProducto,
} = require("./productMatchValidator");
const {
  esSenalReferenciaProducto,
  historialRepresentaInteraccionProducto,
  guardarCoincidenciasProductoPendientes,
  reiniciarFocoProducto,
  resolverSeleccionProductoPendiente,
} = require("./pendingProductMatchService");
const {
  logContextoProducto,
  logContextoRecuperado,
} = require("./aiContextAuditLogger");

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

function cantidadReferenciasCatalogo(catalogo = []) {
  return catalogo.reduce(
    (total, marca) => total + (marca.referencias || []).length,
    0
  );
}

function tieneLineaVisualInterpretada(interpretacion = null) {
  const producto =
    interpretacion?.producto ||
    (interpretacion?.productos?.length === 1
      ? interpretacion.productos[0]
      : {});
  return Boolean(
    producto.linea ||
      (Array.isArray(producto.condiciones) && producto.condiciones.length)
  );
}

function debeRefinarInterpretacionVisual({
  clasificacion,
  interpretacion,
  validacion,
  catalogoInicial,
  catalogoRefinado,
}) {
  if (process.env.AI_VISION_REFINEMENT === "false") return false;
  if (!clasificacion?.requiereVision || !interpretacion) return false;

  const referenciasRefinadas = cantidadReferenciasCatalogo(catalogoRefinado);
  if (!referenciasRefinadas) return false;
  const referenciasIniciales = cantidadReferenciasCatalogo(catalogoInicial);
  return Boolean(
    validacion?.nivel !== "alta" ||
      !tieneLineaVisualInterpretada(interpretacion) ||
      referenciasRefinadas > referenciasIniciales
  );
}

function elegirLecturaVisual({
  interpretacionInicial,
  validacionInicial,
  interpretacionRefinada,
  validacionRefinada,
}) {
  if (!interpretacionRefinada) {
    return {
      interpretacion: interpretacionInicial,
      validacion: validacionInicial,
    };
  }

  const prioridadNivel = {
    alta: 4,
    media: 3,
    baja: 2,
    no_aplica: 1,
  };
  const ganaLineaCritica =
    tieneLineaVisualInterpretada(interpretacionRefinada) &&
    !tieneLineaVisualInterpretada(interpretacionInicial) &&
    validacionRefinada?.nivel === "alta";
  const ganaNivel =
    (prioridadNivel[validacionRefinada?.nivel] || 0) >
    (prioridadNivel[validacionInicial?.nivel] || 0);
  const ganaScore =
    validacionRefinada?.nivel === validacionInicial?.nivel &&
    Number(validacionRefinada?.score || 0) >
      Number(validacionInicial?.score || 0) + 0.02;

  if (ganaLineaCritica || ganaNivel || ganaScore) {
    return {
      interpretacion: interpretacionRefinada,
      validacion: validacionRefinada,
    };
  }

  return {
    interpretacion: interpretacionInicial,
    validacion: validacionInicial,
  };
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

function registrarClasificacion(evento, cliente, clasificacion, catalogoIA) {
  console.log(
    `[Router] Interaccion | cliente=${cliente?.slug || cliente?.id || "sin_cliente"} | usuario=${clienteParaLog(
      evento.channelUserId
    )} | intencion=${clasificacion.intencion} | complejidad=${clasificacion.complejidad} | vision=${
      clasificacion.requiereVision ? "si" : "no"
    } | audio=${clasificacion.requiereAudio ? "si" : "no"} | catalogoIA=${
      catalogoIA.metadata.referenciasEnviadas
    }/${catalogoIA.metadata.totalReferencias} | estrategia=${catalogoIA.metadata.estrategia} | topScore=${
      catalogoIA.metadata.topScore ?? "n/a"
    } | secondScore=${catalogoIA.metadata.secondScore ?? "n/a"}`
  );
}

function registrarValidacionProducto(evento, validacion) {
  console.log(
    `[Catalog Match] cliente=${clienteParaLog(evento.channelUserId)} | nivel=${
      validacion.nivel
    } | razon=${validacion.razon} | terminos="${(validacion.terminos || []).join(" ")}" | score=${
      validacion.score ?? 0
    } | diferencia=${validacion.diferencia ?? 0}`
  );
}

function recordarConsultaProducto(estado, validacion, clasificacion = null) {
  if (!validacion?.terminos?.length) return;

  estado.ultimaConsultaProducto = {
    terminos: validacion.terminos.slice(0, 10),
    etiqueta:
      validacion.etiqueta || validacion.terminos.join(" "),
    presentacion: validacion.presentacionSolicitada || null,
    fuente: clasificacion?.requiereVision
      ? "imagen"
      : clasificacion?.requiereAudio
        ? "audio"
        : "texto",
    nivel: validacion.nivel,
    razon: validacion.razon,
    creadoEn: new Date().toISOString(),
  };
}

async function responderValidacionNoConfiable({
  evento,
  cliente,
  estado,
  mensaje,
  validacion,
  clasificacion = null,
}) {
  registrarValidacionProducto(evento, validacion);
  recordarConsultaProducto(estado, validacion, clasificacion);
  guardarCoincidenciasProductoPendientes(estado, validacion, {
    intencionOriginal: mensaje,
    tipoIntencion: clasificacion?.intencion || "consulta_producto",
  });
  const respuesta = respuestaValidacionProducto(validacion);
  await guardarConversacionPersistida(evento.channelUserId, estado, {
    cliente,
    mensaje,
    respuesta,
  });
  console.log(
    `[OpenAI] Omitido por validacion de catalogo | cliente=${clienteParaLog(
      evento.channelUserId
    )} | nivel=${validacion.nivel}`
  );
  logResumenInteraccionIA({
    channelUserId: evento.channelUserId,
    cliente,
    interpretacionIA: null,
    humanizerUsage: { skipped: true, reason: "validacion_catalogo" },
  });
  return respuesta;
}

function tieneProductoInterpretado(interpretacion = null) {
  const productos = [
    interpretacion?.producto,
    ...((Array.isArray(interpretacion?.productos) && interpretacion.productos) || []),
  ].filter(Boolean);

  return productos.some((producto = {}) =>
    [
      producto.marca,
      producto.referencia,
      producto.linea,
      producto.textoVisible,
      producto.categoria,
      producto.subcategoria,
      producto.especie,
      producto.etapa,
      producto.tamano,
      producto.presentacion,
      ...(Array.isArray(producto.condiciones) ? producto.condiciones : []),
      ...(Array.isArray(producto.sabores) ? producto.sabores : []),
    ].some(Boolean)
  );
}

function interpretacionFueraDeProducto(interpretacion = null) {
  if (!interpretacion) return false;
  if (
    [
      "pedido_producto",
      "consulta_producto",
      "consulta_marcas",
      "recomendacion",
    ].includes(interpretacion.intencion)
  ) {
    return false;
  }

  return !tieneProductoInterpretado(interpretacion);
}

async function responderEventosEntrantes(eventos) {
  if (!eventos.length) throw new Error("No hay eventos entrantes para procesar");

  const evento = eventos[0];
  const cliente = await obtenerClienteActual(evento);
  const vertical = obtenerVerticalCliente(cliente);
  if (vertical && vertical.implemented === false) {
    throw new Error(
      `La vertical ${vertical.key} esta registrada, pero su flujo conversacional aun no esta implementado`
    );
  }
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
  const estado = await obtenerConversacionPersistida(evento.channelUserId, cliente);
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
          vertical,
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

  let clasificacion = clasificarInteraccion({
    mensaje,
    estado,
    contenidos,
    imageUrls,
  });
  const contextoProductoAnterior = estado.ultimaConsultaProducto || null;
  const corrigeProductoAnterior = esCorreccionProducto(mensaje);
  if (corrigeProductoAnterior) {
    reiniciarFocoProducto(estado);
  }
  const mensajeProductoRazonado = construirConsultaProductoContextual(
    mensaje,
    contextoProductoAnterior
  );
  const reinicioPorVision = clasificacion.requiereVision;
  if (reinicioPorVision) {
    reiniciarFocoProducto(estado);
  }
  const iniciaNuevaBusquedaProducto = Boolean(
    clasificacion.requiereBusquedaProducto &&
      (!esSenalReferenciaProducto(mensaje) || corrigeProductoAnterior) &&
      [
        "imagen",
        "audio",
        "precio",
        "busqueda_producto",
        "referencia_producto",
      ].includes(clasificacion.intencion)
  );
  if (iniciaNuevaBusquedaProducto && !corrigeProductoAnterior) {
    estado.ultimaConsultaProducto = null;
  }
  logContextoProducto({
    fase: "antes_resolver",
    cliente,
    channelUserId: evento.channelUserId,
    mensaje,
    estado,
  });
  const seleccionPendiente = resolverSeleccionProductoPendiente({
    mensaje,
    estado,
    catalogo,
    nuevaBusquedaProducto: iniciaNuevaBusquedaProducto,
  });
  logContextoProducto({
    fase: seleccionPendiente ? "resuelto_por_estado" : "busqueda_nueva",
    cliente,
    channelUserId: evento.channelUserId,
    mensaje,
    estado,
    resolucion: seleccionPendiente
      ? {
          resuelta: seleccionPendiente.resuelta,
          origen: seleccionPendiente.origen || "estado",
          seleccion: seleccionPendiente.seleccion || null,
        }
      : { resuelta: false, origen: "sin_coincidencia_estado" },
  });
  if (seleccionPendiente) {
    if (seleccionPendiente.delegarMotorPedido) {
      const respuestaMotor = resolverConsultaCatalogo(
        seleccionPendiente.mensajeMotor || mensaje,
        estado,
        catalogo,
        null
      );
      if (respuestaMotor) {
        await guardarConversacionPersistida(evento.channelUserId, estado, {
          cliente,
          mensaje,
          respuesta: respuestaMotor,
        });
        logResumenInteraccionIA({
          channelUserId: evento.channelUserId,
          cliente,
          interpretacionIA: null,
          humanizerUsage: {
            skipped: true,
            reason: "continuacion_producto_por_estado",
          },
        });
        return respuestaMotor;
      }
    } else {
      await guardarConversacionPersistida(evento.channelUserId, estado, {
        cliente,
        mensaje,
        respuesta: seleccionPendiente.respuesta,
      });
      console.log(
        `[Catalog Match] seleccion_pendiente | cliente=${clienteParaLog(
          evento.channelUserId
        )} | resuelta=${seleccionPendiente.resuelta ? "si" : "no"} | referencia=${
          seleccionPendiente.seleccion?.referencia || "ambigua"
        }`
      );
      logResumenInteraccionIA({
        channelUserId: evento.channelUserId,
        cliente,
        interpretacionIA: null,
        humanizerUsage: {
          skipped: true,
          reason: "seleccion_catalogo_pendiente",
        },
      });
      return seleccionPendiente.respuesta;
    }
  }

  if (iniciaNuevaBusquedaProducto && !reinicioPorVision) {
    reiniciarFocoProducto(estado);
    clasificacion = clasificarInteraccion({
      mensaje,
      estado,
      contenidos,
      imageUrls,
    });
  }
  let historialFallbackRecuperado = [];
  let fallbackHistorialProductoActivo = false;
  if (clasificacion.fallbackHistorialProductoCandidato) {
    historialFallbackRecuperado = await obtenerHistorialRecientePersistido(
      evento.channelUserId,
      clasificacion.limiteHistorial,
      cliente
    );
    const creadoEnProducto = Date.parse(
      estado.ultimaInteraccionProducto?.creadoEn || ""
    );
    const fallbackPorEstado = Boolean(
      Number.isFinite(creadoEnProducto) &&
        Date.now() - creadoEnProducto <=
          Number(process.env.CATALOG_PENDING_MATCH_TTL_MS || 20 * 60 * 1000)
    );
    fallbackHistorialProductoActivo = Boolean(
      fallbackPorEstado ||
        historialRepresentaInteraccionProducto(historialFallbackRecuperado)
    );
    clasificacion = {
      ...clasificacion,
      fallbackHistorialProductoActivo,
      limiteHistorial: fallbackHistorialProductoActivo
        ? clasificacion.limiteHistorial
        : 0,
    };
    logContextoProducto({
      fase: "fallback_historial",
      cliente,
      channelUserId: evento.channelUserId,
      mensaje,
      estado,
      fallbackHistorial: {
        candidato: true,
        activo: fallbackHistorialProductoActivo,
        mensajesRecuperados: historialFallbackRecuperado.length,
        mensajesEnviados: fallbackHistorialProductoActivo
          ? historialFallbackRecuperado.length
          : 0,
      },
    });
  }

  const mensajeBusquedaCatalogo = fallbackHistorialProductoActivo
    ? `${historialFallbackRecuperado
        .map((item) => item.body)
        .filter(Boolean)
        .join("\n")}\n${mensaje}`
    : mensajeProductoRazonado;
  const catalogoIA = await seleccionarCatalogoParaIA({
    catalogo,
    mensaje: mensajeBusquedaCatalogo,
    estado,
    clasificacion,
    cliente,
  });
  const validacionPrevia = fallbackHistorialProductoActivo
    ? {
        nivel: "no_aplica",
        razon: "fallback_historial_producto",
        terminos: [],
      }
    : validarCoincidenciaProducto({
        mensaje,
        catalogo,
        catalogoCandidatos: catalogoIA.catalogo,
        clasificacion,
        contextoProducto: contextoProductoAnterior,
      });

  if (["media", "baja"].includes(validacionPrevia.nivel) && !clasificacion.requiereOpenAI) {
    return responderValidacionNoConfiable({
      evento,
      cliente,
      estado,
      mensaje,
      validacion: validacionPrevia,
      clasificacion,
    });
  }

  if (validacionPrevia.nivel === "alta") {
    estado.coincidenciasProductoPendientes = null;
    registrarValidacionProducto(evento, validacionPrevia);
  }

  const omitirInterpretePorConsultaExploratoria =
    ["consulta_generica", "consulta_categoria"].includes(validacionPrevia.razon) &&
    !clasificacion.requiereVision;
  const [historialRecuperado, ejemplosEntrenamiento] = await Promise.all([
    fallbackHistorialProductoActivo
      ? Promise.resolve(historialFallbackRecuperado)
      : clasificacion.limiteHistorial > 0
      ? obtenerHistorialRecientePersistido(evento.channelUserId, clasificacion.limiteHistorial, cliente)
      : Promise.resolve([]),
    clasificacion.limiteEjemplos > 0
      ? obtenerEjemplosEntrenamiento(mensaje, clasificacion.limiteEjemplos, cliente)
      : Promise.resolve([]),
  ]);
  const historialReciente =
    clasificacion.fallbackHistorialProductoCandidato &&
    !fallbackHistorialProductoActivo
      ? []
      : historialRecuperado;
  logContextoRecuperado({
    cliente,
    channelUserId: evento.channelUserId,
    clasificacion,
    historial: historialReciente,
    estado,
  });
  const memoriaOperativa = construirMemoriaOperativa(estado, historialReciente);
  const modeloIA = modeloInterprete(clasificacion);
  const modeloHumanizar = modeloHumanizador(clasificacion);
  registrarClasificacion(evento, cliente, clasificacion, catalogoIA);

  let interpretacionIA =
    clasificacion.requiereOpenAI && !omitirInterpretePorConsultaExploratoria
    ? await interpretarMensajeCliente({
        mensaje,
        estado,
        catalogo: catalogoIA.catalogo,
        ejemplosEntrenamiento,
        historialReciente,
        imageUrls,
        cliente,
        vertical,
        clasificacion,
        memoriaOperativa,
        model: modeloIA,
        catalogoMetadata: catalogoIA.metadata,
        channelUserId: evento.channelUserId,
      })
    : null;
  if (omitirInterpretePorConsultaExploratoria) {
    console.log(
      `[OpenAI] Interprete omitido | cliente=${clienteParaLog(
        evento.channelUserId
      )} | razon=${validacionPrevia.razon}`
    );
  }

  let validacionFinal = interpretacionFueraDeProducto(interpretacionIA)
    ? {
        nivel: "no_aplica",
        razon: "intencion_no_producto_por_ia",
        terminos: [],
      }
    : validarCoincidenciaProducto({
        mensaje,
        interpretacion: interpretacionIA,
        catalogo,
        catalogoCandidatos: catalogoIA.catalogo,
        clasificacion,
        contextoProducto: contextoProductoAnterior,
      });
  if (clasificacion.requiereVision && interpretacionIA) {
    const catalogoRefinado = seleccionarCatalogoRefinadoVision({
      catalogo,
      interpretacion: interpretacionIA,
      clasificacion,
    });
    if (
      debeRefinarInterpretacionVisual({
        clasificacion,
        interpretacion: interpretacionIA,
        validacion: validacionFinal,
        catalogoInicial: catalogoIA.catalogo,
        catalogoRefinado: catalogoRefinado.catalogo,
      })
    ) {
      const clasificacionRevision = {
        ...clasificacion,
        revisionVision: true,
      };
      const interpretacionRefinada = await interpretarMensajeCliente({
        mensaje,
        estado,
        catalogo: catalogoRefinado.catalogo,
        ejemplosEntrenamiento: [],
        historialReciente,
        imageUrls,
        cliente,
        vertical,
        clasificacion: clasificacionRevision,
        memoriaOperativa,
        model: modeloIA,
        catalogoMetadata: catalogoRefinado.metadata,
        channelUserId: evento.channelUserId,
      });
      const validacionRefinada = validarCoincidenciaProducto({
        mensaje,
        interpretacion: interpretacionRefinada,
        catalogo,
        catalogoCandidatos: catalogoRefinado.catalogo,
        clasificacion: clasificacionRevision,
        contextoProducto: contextoProductoAnterior,
      });
      const nivelInicial = validacionFinal?.nivel;
      const nivelRefinado = validacionRefinada?.nivel;
      const lecturaElegida = elegirLecturaVisual({
        interpretacionInicial: interpretacionIA,
        validacionInicial: validacionFinal,
        interpretacionRefinada,
        validacionRefinada,
      });
      interpretacionIA = lecturaElegida.interpretacion;
      validacionFinal = lecturaElegida.validacion;
      console.log(
        `[OpenAI] Revision visual | cliente=${clienteParaLog(
          evento.channelUserId
        )} | candidatos=${catalogoRefinado.metadata.referenciasEnviadas || 0} | inicial=${nivelInicial} | refinada=${nivelRefinado} | elegida=${
          lecturaElegida.interpretacion === interpretacionRefinada
            ? "refinada"
            : "inicial"
        } | resultado=${validacionFinal?.nivel}`
      );
    }
  }
  if (["media", "baja"].includes(validacionFinal.nivel)) {
    return responderValidacionNoConfiable({
      evento,
      cliente,
      estado,
      mensaje,
      validacion: validacionFinal,
      clasificacion,
    });
  }
  if (validacionFinal.nivel === "alta") {
    registrarValidacionProducto(evento, validacionFinal);
    recordarConsultaProducto(estado, validacionFinal, clasificacion);
    interpretacionIA = aplicarCoincidenciaValidada(interpretacionIA, validacionFinal);
  }

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
  } else if (interpretacionIA?.intencion === "rechazo" || interpretacionIA?.intencion === "agradecimiento") {
    respuestaBase =
      "Objetivo operativo: cerrar de forma breve, amable y contextual. No buscar catalogo, no cambiar carrito y no listar productos salvo que el cliente haya pedido alternativas reales.";
  } else {
    respuestaBase = resolverConsultaCatalogo(mensaje, estado, catalogo, interpretacionIA);
  }

  const debeHumanizar = clasificacion.requiereOpenAI || !["saludo", "general"].includes(clasificacion.intencion);
  let humanizerUsage = { skipped: true, reason: "no_requerido" };
  const respuestaHumanizada = debeHumanizar
    ? await humanizarRespuesta(mensaje, respuestaBase, {
        ejemplosEntrenamiento,
        historialReciente,
        estado,
        interpretacionIA,
        cliente,
        vertical,
        clasificacion,
        memoriaOperativa,
        model: modeloHumanizar,
        channelUserId: evento.channelUserId,
        onUsage: (usage) => {
          humanizerUsage = usage;
        },
      })
    : respuestaBase;
  const respuesta = asegurarRespuestaCatalogo(mensaje, respuestaHumanizada, { catalogo, interpretacionIA });
  const respuestaPersistida = respuestaParaHistorial(respuesta);

  await guardarConversacionPersistida(evento.channelUserId, estado, {
    cliente,
    mensaje,
    respuesta: respuestaPersistida,
  });
  logResumenInteraccionIA({
    channelUserId: evento.channelUserId,
    cliente,
    interpretacionIA,
    humanizerUsage,
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
