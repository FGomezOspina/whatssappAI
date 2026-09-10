const { resolverEvidenciaInterpretacion } = require("./productEvidenceService");
const { obtenerClienteActual } = require("./clients.service");
const { obtenerVerticalCliente } = require("../verticals");
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
const { normalizarPeso } = require("../utils/text");
const {
  aplicarCoincidenciaValidada,
  construirConsultaProductoContextual,
  esCorreccionProducto,
  respuestaValidacionProducto,
  validarCoincidenciaProducto,
} = require("./productMatchValidator");
const {
  esSenalReferenciaProducto,
  guardarCoincidenciasProductoPendientes,
  reiniciarFocoProducto,
  resolverSeleccionProductoPendiente,
} = require("./pendingProductMatchService");
const {
  logContextoProducto,
  logContextoRecuperado,
} = require("./aiContextAuditLogger");

function consultaProductoVisual(producto) {
  return [producto.marca, producto.observado?.nombre, producto.referencia, producto.linea,
    producto.especie, producto.etapa, producto.tamano, ...(producto.sabores || []),
    ...(producto.condiciones || []), producto.presentacion].filter(Boolean).join(" ");
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
    aclaracion: validacion.aclaracion || null,
    creadoEn: new Date().toISOString(),
  };
}

async function responderValidacionNoConfiable({
  evento,
  idsEventos = [],
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
  const respuestaBase = respuestaValidacionProducto(validacion);
  let humanizerUsage = { skipped: true, reason: "validacion_catalogo" };
  const respuesta = validacion.aclaracion
    ? await humanizarRespuesta(mensaje, respuestaBase, {
        estado, cliente, vertical: obtenerVerticalCliente(cliente),
        clasificacion, aclaracion: validacion.aclaracion,
        model: modeloHumanizador(clasificacion || {}),
        onUsage: (usage) => { humanizerUsage = usage; },
      })
    : respuestaBase;
  await guardarConversacionPersistida(evento.channelUserId, estado, {
    idsEventos,
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
    humanizerUsage,
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
  const procesados = new Set(estado.mensajesProcesados || []);
  const idsEventos = [];
  eventos = eventos.filter(item => {
    const identificador = item.messageId || item.idempotencyKey;
    if (!identificador) return true;
    const key = `${item.phoneNumberId || item.workspaceId || item.integrationId || "canal"}:${identificador}`;
    if (procesados.has(key)) return false;
    procesados.add(key);
    idsEventos.push(key);
    return true;
  });
  if (!eventos.length) {
    if (estado.pedidoConfirmadoPendienteGuardar) {
      await guardarConversacionPersistida(evento.channelUserId, estado, { cliente });
    }
    return null;
  }

  await guardarConversacionPersistida(evento.channelUserId, estado, {
    fase: "entrada", cliente, idsEventos, eventos,
    mensaje: eventos.map(item => item.text || `[${item.messageType || item.media?.type || "archivo"}]`).join("\n"),
  });

  let catalogo = [];
  let contenidos;

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
      idsEventos,
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
  if (estado._turnoEntrante) {
    estado._turnoEntrante.contenidos = contenidos;
    await guardarConversacionPersistida(evento.channelUserId, estado, { cliente, soloEstado: true });
  }
  registrarEntradaOpenAI(evento, mensaje, imageUrls, contenidos);

  if (!mensaje && !imageUrls.length) {
    const respuesta = "Cuéntame qué necesitas para tu mascota 🐶";
    await guardarConversacionPersistida(evento.channelUserId, estado, {
      idsEventos,
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
  // La necesidad de herramientas se decide sin exponer productos al modelo.
  let historialSemantico = await obtenerHistorialRecientePersistido(
    evento.channelUserId, 60, cliente, { excluirTurno: estado._turnoEntrante?.turnId }
  );
  // Keep ordinary conversations whole. Long conversations use a persistent,
  // chronological summary; every archived page remains in Supabase.
  let caracteres = 0;
  let inicioReciente = historialSemantico.length;
  while (inicioReciente > 0) {
    const fila = historialSemantico[inicioReciente - 1];
    caracteres += JSON.stringify(fila).length;
    if (caracteres > 24000 && inicioReciente <= historialSemantico.length - 2) break;
    inicioReciente--;
  }
  if (inicioReciente) historialSemantico = historialSemantico.slice(inicioReciente);
  const corte = historialSemantico[0];
  if (corte?.id && corte?.created_at) {
    let cursor = estado.memoriaConversacional?.hasta;
    while (true) {
      const pagina = await obtenerHistorialRecientePersistido(evento.channelUserId, 20, cliente, {
        orden: "asc", antes: corte, despues: cursor, excluirTurno: estado._turnoEntrante?.turnId,
      });
      if (!pagina.length) break;
      const resumen = await interpretarMensajeCliente({
        mensaje: "Actualizar memoria historica", estado, catalogo: [], historialReciente: pagina,
        cliente, vertical, clasificacion: { resumirHistorial: true },
        model: modeloInterprete({ perfilContexto: "pedido" }), channelUserId: evento.channelUserId,
      });
      if (!resumen?.resumenMemoria) throw new Error("No se pudo actualizar la memoria conversacional");
      const ultima = pagina[pagina.length - 1];
      cursor = { id: ultima.id, created_at: ultima.created_at };
      estado.memoriaConversacional = { resumen: resumen.resumenMemoria, hasta: cursor };
      await guardarConversacionPersistida(evento.channelUserId, estado, { cliente, soloEstado: true });
    }
  }
  let decisionSemantica = await interpretarMensajeCliente({
    mensaje, estado, catalogo: [], historialReciente: historialSemantico,
    imageUrls, cliente, vertical,
    clasificacion: { ...clasificacion, intencion: null, perfilContexto: "pedido",
      limiteHistorial: historialSemantico.length, requiereVision: imageUrls.length > 0, decisionHerramientas: true },
    model: process.env.OPENAI_ROUTER_MODEL || "gpt-5.4", channelUserId: evento.channelUserId,
  });
  if (!decisionSemantica) {
    // Un fallo del proveedor no es ambiguedad del cliente. No humanizarlo
    // como si faltaran atributos y no ejecutar acciones sin interpretacion.
    const respuesta = "No pude procesar tu mensaje en este momento por un problema temporal. Por favor, inténtalo nuevamente.";
    await guardarConversacionPersistida(evento.channelUserId, estado, {
      idsEventos, cliente, mensaje, respuesta,
    });
    return respuesta;
  }
  decisionSemantica = resolverEvidenciaInterpretacion(decisionSemantica);
  Object.defineProperty(estado, "_interpretacionTurno", { configurable: true, writable: true,
    value: { intencion: decisionSemantica.intencion, accion: decisionSemantica.accion,
      producto: decisionSemantica.producto, productos: decisionSemantica.productos } });
  const consultaSemantica = decisionSemantica?.consultaCatalogo;
  const necesitaCatalogo = consultaSemantica?.necesaria === true &&
    typeof consultaSemantica.consulta === "string" && consultaSemantica.consulta.trim().length > 0;
  console.log(`[Semantic Router] catalogo=${necesitaCatalogo ? "si" : "no"} | continuarFlujo=${decisionSemantica?.continuarFlujo === true ? "si" : "no"} | interpretacion=${decisionSemantica ? "recibida" : "no_disponible"}`);
  if (!necesitaCatalogo) {
    if (decisionSemantica) {
      decisionSemantica.consultaCatalogo = { necesaria: false, consulta: null };
      decisionSemantica.producto = null;
      decisionSemantica.productos = [];
    }
    const respuestaConversacional = decisionSemantica?.respuestaConversacional ||
      "¿Puedes contarme un poco más sobre lo que necesitas?";
    // El motor existente conserva la autoridad sobre las transiciones y pedidos.
    const respuestaBase = decisionSemantica?.continuarFlujo === true
      ? resolverConsultaCatalogo(mensaje, estado, [], decisionSemantica)
      : respuestaConversacional;
    const respuesta = await humanizarRespuesta(mensaje, respuestaBase || respuestaConversacional, {
      historialReciente: historialSemantico, estado, interpretacionIA: decisionSemantica,
      cliente, vertical, clasificacion: { ...clasificacion, requiereOpenAI: true },
      model: modeloHumanizador(clasificacion), channelUserId: evento.channelUserId,
    });
    await guardarConversacionPersistida(evento.channelUserId, estado, {
      idsEventos, cliente, mensaje, respuesta: respuestaParaHistorial(respuesta),
    });
    return respuesta;
  }
  clasificacion = { ...clasificacion, requiereOpenAI: true,
    requiereBusquedaProducto: true, fallbackHistorialProductoCandidato: false,
    intencion: "busqueda_producto", perfilContexto: "pedido", limiteHistorial: historialSemantico.length };
  const catalogoIA = await seleccionarCatalogoParaIA({
    catalogo: [], mensaje: imageUrls.length && decisionSemantica.producto?.observado
      ? consultaProductoVisual(decisionSemantica.producto) || consultaSemantica.consulta.trim()
      : consultaSemantica.consulta.trim(), mensajeOriginal: mensaje, estado: {},
    consultas: (decisionSemantica.productos || []).map(producto =>
      [imageUrls.length ? producto.observado?.nombre : producto.textoVisible, producto.marca, producto.referencia, producto.linea, producto.categoria, producto.subcategoria,
        producto.especie, producto.etapa, producto.presentacion].filter(Boolean).join(" ")
    ).filter(Boolean),
    clasificacion, cliente,
  });
  if (catalogoIA.metadata?.errorBusqueda) {
    const respuesta = "No pude consultar el catálogo por un problema temporal. Aún no puedo confirmar el precio o la disponibilidad; por favor, inténtalo nuevamente.";
    await guardarConversacionPersistida(evento.channelUserId, estado, { idsEventos, cliente, mensaje, respuesta });
    return respuesta;
  }
  catalogo = catalogoIA.catalogo;
  const esContinuacionProducto = !imageUrls.length && esSenalReferenciaProducto(mensaje);
  const mensajeParaValidar = esContinuacionProducto ? consultaSemantica.consulta : mensaje;
  const contextoProductoAnterior = clasificacion.accionPendiente ? null : estado.ultimaConsultaProducto || null;
  const corrigeProductoAnterior = esCorreccionProducto(mensaje);
  if (corrigeProductoAnterior) {
    reiniciarFocoProducto(estado);
  }
  const mensajeProductoRazonado = construirConsultaProductoContextual(
    mensaje,
    contextoProductoAnterior
  );
  const continuaAclaracion = Boolean(contextoProductoAnterior?.aclaracion && mensajeProductoRazonado !== mensaje);
  const reinicioPorVision = clasificacion.requiereVision;
  if (reinicioPorVision) {
    reiniciarFocoProducto(estado);
  }
  const iniciaNuevaBusquedaProducto = Boolean(
    !clasificacion.accionPendiente && !continuaAclaracion && clasificacion.requiereBusquedaProducto &&
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
        decisionSemantica.accion === "consultar" ? mensaje : seleccionPendiente.mensajeMotor || mensaje,
        estado,
        catalogo,
        decisionSemantica
      );
      if (respuestaMotor) {
        await guardarConversacionPersistida(evento.channelUserId, estado, {
          idsEventos,
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
        idsEventos,
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
    // La decision semantica sigue vigente despues de limpiar el foco.
  }
  const validacionPrevia = clasificacion.accionPendiente
    ? {
        nivel: "no_aplica",
        razon: "accion_pendiente",
        terminos: [],
      }
    : validarCoincidenciaProducto({
        mensaje: consultaSemantica.consulta,
        catalogo,
        catalogoCandidatos: catalogoIA.catalogo,
        clasificacion,
        contextoProducto: contextoProductoAnterior,
      });

  if (["media", "baja"].includes(validacionPrevia.nivel) && !clasificacion.requiereOpenAI) {
    return responderValidacionNoConfiable({
      evento,
      idsEventos,
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
    Promise.resolve(historialSemantico),
    clasificacion.limiteEjemplos > 0
      ? obtenerEjemplosEntrenamiento(mensaje, clasificacion.limiteEjemplos, cliente)
      : Promise.resolve([]),
  ]);
  const historialReciente = historialRecuperado;
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

  const solicitudesMultiples = decisionSemantica.productos?.length > 1
    ? decisionSemantica.productos : [];
  const resultadosMultiples = await Promise.all(solicitudesMultiples.map(async (solicitud, indice) => {
    const textoSolicitud = [imageUrls.length ? solicitud.observado?.nombre : solicitud.textoVisible, solicitud.marca, solicitud.referencia,
      solicitud.linea, solicitud.categoria, solicitud.subcategoria, solicitud.especie,
      solicitud.etapa, solicitud.presentacion].filter(Boolean).join(" ");
    const candidatos = catalogoIA.resultadosPorProducto?.[indice]?.catalogo || catalogo;
    if (catalogoIA.resultadosPorProducto?.[indice]?.metadata?.errorBusqueda) {
      return { solicitud, textoSolicitud, candidatos, lectura: null, validacion: null };
    }
    let lectura = await interpretarMensajeCliente({
      mensaje: `Intencion: ${decisionSemantica.intencion}. Accion: ${decisionSemantica.accion}. Solicitud: ${textoSolicitud}`,
      estado, catalogo: candidatos, ejemplosEntrenamiento, historialReciente: [],
      cliente, vertical, clasificacion, model: modeloIA, channelUserId: evento.channelUserId,
    });
    // La primera interpretacion autoriza herramientas. El mapeo contra
    // candidatos no vuelve a decidir si esa busqueda era necesaria.
    lectura = resolverEvidenciaInterpretacion(lectura, { producto: solicitud });
    if (lectura) lectura.consultaCatalogo = consultaSemantica;
    const validacion = validarCoincidenciaProducto({ mensaje: textoSolicitud,
      interpretacion: lectura, catalogo: candidatos, catalogoCandidatos: candidatos,
      clasificacion, contextoProducto: null });
    return { solicitud, textoSolicitud, candidatos, lectura, validacion };
  }));

  let interpretacionIA =
    !solicitudesMultiples.length && clasificacion.requiereOpenAI && !omitirInterpretePorConsultaExploratoria
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
  interpretacionIA = resolverEvidenciaInterpretacion(interpretacionIA, decisionSemantica);
  if (interpretacionIA) interpretacionIA.consultaCatalogo = consultaSemantica;
  if ((clasificacion.accionPendiente || estado.pedidoConfirmado) && interpretacionIA &&
      !["pedido_producto", "consulta_producto", "consulta_marcas", "recomendacion"].includes(interpretacionIA.intencion)) {
    // Los datos de productos historicos no convierten una confirmacion o un
    // cambio de datos en una busqueda nueva.
    interpretacionIA.producto = null;
    interpretacionIA.productos = [];
  }
  if (omitirInterpretePorConsultaExploratoria) {
    console.log(
      `[OpenAI] Interprete omitido | cliente=${clienteParaLog(
        evento.channelUserId
      )} | razon=${validacionPrevia.razon}`
    );
  }

  let validacionFinal = solicitudesMultiples.length ? { nivel: "no_aplica", razon: "validacion_por_producto" } : (clasificacion.accionPendiente && !interpretacionIA) || interpretacionFueraDeProducto(interpretacionIA)
    ? {
        nivel: "no_aplica",
        razon: "intencion_no_producto_por_ia",
        terminos: [],
      }
    : validarCoincidenciaProducto({
        mensaje: mensajeParaValidar,
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
      let interpretacionRefinada = await interpretarMensajeCliente({
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
      interpretacionRefinada = resolverEvidenciaInterpretacion(interpretacionRefinada, decisionSemantica);
      if (interpretacionRefinada) interpretacionRefinada.consultaCatalogo = consultaSemantica;
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
      idsEventos,
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

  if (interpretacionIA && estado._interpretacionTurno) {
    estado._interpretacionTurno = { intencion: interpretacionIA.intencion, accion: interpretacionIA.accion,
      producto: interpretacionIA.producto, productos: interpretacionIA.productos };
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
  if (resultadosMultiples.length) {
    const respuestas = [];
    const consultados = [];
    const productosValidados = [];
    for (const resultado of resultadosMultiples) {
      const titulo = resultado.solicitud.textoVisible || resultado.textoSolicitud;
      if (!resultado.lectura) {
        respuestas.push(`${titulo}: no pude procesar esta solicitud por un problema temporal.`);
        continue;
      }
      if (resultado.validacion.nivel !== "alta") {
        respuestas.push(`${titulo}:\n${respuestaValidacionProducto(resultado.validacion)}`);
        continue;
      }
      const lecturaValidada = aplicarCoincidenciaValidada(resultado.lectura, resultado.validacion);
      const respuestaProducto = resolverConsultaCatalogo(resultado.textoSolicitud, estado,
        resultado.candidatos, lecturaValidada);
      respuestas.push(`${titulo}:\n${respuestaProducto || "No pude resolver esta referencia; necesito verificarla."}`);
      if (!lecturaValidada.producto?.requierePresentacion &&
          (lecturaValidada.accion === "consultar" || lecturaValidada.intencion === "consulta_producto")) {
        const coincidencia = resultado.validacion.coincidencia;
        for (const presentacion of coincidencia.presentaciones || []) {
          if (resultado.validacion.presentacionSolicitada &&
            normalizarPeso(presentacion.peso) !== normalizarPeso(resultado.validacion.presentacionSolicitada)) continue;
          consultados.push({ marca: coincidencia.marca,
            referencia: presentacion.referencia || coincidencia.referenciaCatalogo,
            referenciaCatalogo: presentacion.referencia || coincidencia.referenciaCatalogo,
            peso: presentacion.peso, precio: presentacion.precio, stock: presentacion.stock,
            cantidad: 1, presentaciones: coincidencia.presentaciones });
        }
      }
      if (lecturaValidada.producto) productosValidados.push(lecturaValidada.producto);
    }
    // El motor procesa cada solicitud; la cotizacion persistida conserva el conjunto.
    estado.productosConsultados = [...new Map(consultados.map(item =>
      [`${item.marca}:${item.referencia}:${item.peso || item.presentacion}`, item])).values()]
      .map((item, indice) => ({ ...item, indice: indice + 1 }));
    interpretacionIA = { ...decisionSemantica, producto: null, productos: productosValidados };
    respuestaBase = respuestas.join("\n\n");
  } else if (esSaludo(mensaje) && !tieneIntencionCatalogo && !(estado.pedidoConfirmado && estado.carrito.length)) {
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
    respuestaBase = resolverConsultaCatalogo(
      clasificacion.requiereVision && interpretacionIA?.producto?.observado
        ? consultaProductoVisual(interpretacionIA.producto)
        : continuaAclaracion ? mensajeProductoRazonado : mensajeParaValidar,
      estado, catalogo, interpretacionIA);
  }

  const debeHumanizar = !interpretacionIA?.producto?.requierePresentacion &&
    !(interpretacionIA?.productos || []).some(producto => producto.requierePresentacion) &&
    (clasificacion.requiereOpenAI || !["saludo", "general"].includes(clasificacion.intencion));
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
  const respuesta = resultadosMultiples.length ? respuestaHumanizada
    : asegurarRespuestaCatalogo(mensaje, respuestaHumanizada, { catalogo, interpretacionIA });
  const respuestaPersistida = respuestaParaHistorial(respuesta);

  await guardarConversacionPersistida(evento.channelUserId, estado, {
    idsEventos,
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
