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
const { normalizar, normalizarPeso } = require("../utils/text");
const {
  aplicarCoincidenciaValidada,
  consultaIdentidadRespaldada,
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

// Reutiliza la identidad solicitada, sin convertir etiquetas de clasificacion
// (categoria/subcategoria) en palabras del nombre comercial que deban existir.
function consultaSolicitudProducto(producto = {}, mensaje = "", visual = false) {
  if (visual) return consultaProductoVisual(producto);
  const respaldo = normalizar(mensaje);
  const literal = valor => valor && respaldo.includes(normalizar(valor));
  const referencia = literal(producto.referencia) ? producto.referencia : null;
  const linea = literal(producto.linea) ? producto.linea : null;
  const identidad = [producto.marca, referencia, linea].filter(Boolean);
  const texto = producto.textoVisible;
  const colores = "negr[oa]|blanc[oa]|roj[oa]|azul|verde|amarill[oa]|gris|morad[oa]|rosad[oa]|naranja";
  const descripcionEmpaque = new RegExp(`\\b(?:bolsa|empaque|envase|saco|paquete)\\s+(?:de\\s+color\\s+|color\\s+)?(?:${colores})(?:\\s+(?:con|y)\\s+(?:${colores}))*`, "gi");
  const limpiar = valor => (valor || "")
    .replace(descripcionEmpaque, " ")
    .replace(/\b\d+\s+(?:bultos?|bolsas?|paquetes?|sobres?|unidades?)\s*(?:de\s+)?/gi, " ")
    .replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  // Una descripcion de color/empaque no reemplaza un nombre ya extraido.
  if (!identidad.length || (!referencia && !linea) ||
      (producto.marca && normalizar(texto || "").replace(/\s/g, "").includes(
        normalizar(producto.marca).replace(/\s/g, "")))) identidad.push(texto);
  return [...identidad, producto.especie, producto.etapa, producto.tamano,
    ...(producto.sabores || []), ...(producto.condiciones || []), producto.presentacion]
    .filter(Boolean).map(limpiar).filter(Boolean).join(" ") || producto.referencia || "";
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
  const respuesta = await humanizarRespuesta(mensaje, respuestaBase, {
        estado, cliente, vertical: obtenerVerticalCliente(cliente),
        clasificacion, aclaracion: validacion.aclaracion,
        productoAutonomo: validacion,
        model: modeloHumanizador(clasificacion || {}),
        onUsage: (usage) => { humanizerUsage = usage; },
      });
  await guardarConversacionPersistida(evento.channelUserId, estado, {
    idsEventos,
    cliente,
    mensaje,
    respuesta,
  });
  console.log(
    `[Catalog Match] Aclaracion redactada por IA | cliente=${clienteParaLog(
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
  if (!imageUrls.length && vertical.orderLogic.esConfirmacionCierreExplicita?.(mensaje, estado)) {
    // A complete, explicit checkout reply remains a confirmation when buffered
    // with thanks; historical payment/product fields are not new instructions.
    decisionSemantica = { ...decisionSemantica, intencion: "confirmacion", accion: "confirmar",
      confianza: 1, continuarFlujo: true, consultaCatalogo: { necesaria: false, consulta: null },
      producto: null, productos: [], entrega: {}, datosCliente: {}, carrito: {} };
  }
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
    const operacionPendiente = estado.carrito?.length > 0 &&
      ((!estado.pedidoConfirmado && ["datos_envio", "metodo_pago"].includes(decisionSemantica?.intencion)) ||
        (Object.entries(estado).some(([campo, valor]) => campo.startsWith("esperando") && valor === true) &&
          decisionSemantica?.intencion === "confirmacion"));
    const consultaPago = decisionSemantica?.accion === "consultar_pago" ||
      (estado.pedidoConfirmado && decisionSemantica?.intencion === "metodo_pago");
    const aclaracionPendiente = estado.ultimaSolicitudProductos?.find(item => item.estado === "pendiente" && item.pregunta);
    const respuestaBase = decisionSemantica?.intencion === "confirmacion" && aclaracionPendiente
      ? ["Conservo los productos de tu carrito.",
          estado.carrito.length && vertical.orderLogic.resumenCarrito?.(estado),
          aclaracionPendiente.pregunta].filter(Boolean).join("\n\n")
      : decisionSemantica?.continuarFlujo === true || operacionPendiente || consultaPago
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
      consultaSolicitudProducto(producto, mensaje, imageUrls.length > 0)),
    clasificacion, cliente,
  });
  if (catalogoIA.metadata?.errorBusqueda) {
    const respuesta = "No pude consultar el catálogo por un problema temporal. Aún no puedo confirmar el precio o la disponibilidad; por favor, inténtalo nuevamente.";
    await guardarConversacionPersistida(evento.channelUserId, estado, { idsEventos, cliente, mensaje, respuesta });
    return respuesta;
  }
  catalogo = catalogoIA.catalogo;
  // The router extracts these attributes before seeing catalog candidates.
  // Retrieval prose contains operational terms (price, delivery, address) that
  // must not count as missing words in a product's commercial identity.
  const productoSolicitado = decisionSemantica.producto;
  const consultaIdentidad = consultaIdentidadRespaldada(productoSolicitado, consultaSemantica.consulta);
  const mensajeParaValidar = imageUrls.length ? mensaje : consultaIdentidad || consultaSemantica.consulta;
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
      let respuestaMotor = resolverConsultaCatalogo(
        decisionSemantica.accion === "consultar" ? mensaje : seleccionPendiente.mensajeMotor || mensaje,
        estado,
        catalogo,
        decisionSemantica
      );
      if (respuestaMotor) {
        respuestaMotor = await humanizarRespuesta(mensaje, respuestaMotor, {
          estado, cliente, vertical, clasificacion, interpretacionIA: decisionSemantica,
          productoAutonomo: { nivel: "alta", seleccion: seleccionPendiente.seleccion },
          model: modeloHumanizador(clasificacion),
        });
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
      const respuestaSeleccion = await humanizarRespuesta(mensaje, seleccionPendiente.respuesta, {
        estado, cliente, vertical, clasificacion, interpretacionIA: decisionSemantica,
        productoAutonomo: { nivel: seleccionPendiente.resuelta ? "alta" : "media",
          seleccion: seleccionPendiente.seleccion,
          alternativas: estado.coincidenciasProductoPendientes?.opciones || [] },
        model: modeloHumanizador(clasificacion),
      });
      await guardarConversacionPersistida(evento.channelUserId, estado, {
        idsEventos,
        cliente,
        mensaje,
        respuesta: respuestaSeleccion,
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
      return respuestaSeleccion;
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
        mensaje: mensajeParaValidar,
        catalogo,
        catalogoCandidatos: catalogoIA.catalogo,
        clasificacion,
        contextoProducto: consultaIdentidad ? null : contextoProductoAnterior,
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
    const textoSolicitud = consultaSolicitudProducto(solicitud, mensaje, imageUrls.length > 0);
    let candidatos = catalogoIA.resultadosPorProducto?.[indice]?.catalogo || catalogo;
    // El motor ya conoce los aliases de marca. Conserva ese mismo limite
    // tambien al validar cada item para no ofrecer marcas ajenas al pedido.
    const marcaSolicitada = buscarMarca(candidatos, solicitud.marca || textoSolicitud);
    if (marcaSolicitada) candidatos = candidatos.filter(item => item.marca === marcaSolicitada.marca);
    if (catalogoIA.resultadosPorProducto?.[indice]?.metadata?.errorBusqueda) {
      return { solicitud, textoSolicitud, candidatos, lectura: null, validacion: null };
    }
    let lectura = await interpretarMensajeCliente({
      mensaje: `Intencion: ${decisionSemantica.intencion}. Accion: ${decisionSemantica.accion}. Solicitud: ${textoSolicitud}. Cantidad de unidades: ${solicitud.cantidad || "no especificada"}`,
      estado, catalogo: candidatos, ejemplosEntrenamiento, historialReciente: [],
      cliente, vertical, clasificacion, model: modeloIA, channelUserId: evento.channelUserId,
    });
    // La primera interpretacion autoriza herramientas. El mapeo contra
    // candidatos no vuelve a decidir si esa busqueda era necesaria.
    lectura = resolverEvidenciaInterpretacion(lectura, { ...decisionSemantica, producto: solicitud, productos: [solicitud] });
    if (lectura) {
      lectura.consultaCatalogo = consultaSemantica;
      // Las etiquetas inferidas no son restricciones pedidas por el cliente.
      // El nombre comercial sigue resolviendose con el motor y su catalogo.
      for (const campo of ["categoria", "subcategoria"]) {
        const valor = lectura.producto?.[campo];
        if (valor && !normalizar(mensaje).includes(normalizar(valor.replace(/_/g, " ")))) {
          lectura.producto[campo] = null;
        }
      }
    }
    // Un peso total a granel no es una bolsa de ese peso. Solo convertir
    // cuando la solicitud lo clasifica asi y existe la unidad de 1 kg exacta.
    const pesoGranel = normalizarPeso(solicitud.presentacion || "").match(/^(\d+(?:\.\d+)?)kg$/);
    const referenciaGranel = candidatos.flatMap(marca => marca.referencias).find(item =>
      normalizar(item.nombre) === normalizar(lectura?.producto?.referencia || "") &&
      item.presentaciones.some(p => normalizarPeso(p.peso) === "1kg"));
    const cantidadGranel = pesoGranel && Number(pesoGranel[1]);
    const convertirGranel = !imageUrls.length &&
      (normalizar(solicitud.categoria || "") === "granel" ||
        /^\s*\d+(?:[.,]\d+)?\s*(?:kilos?|kg|kl)\s+de\b/i.test(solicitud.textoVisible || "")) &&
      Number(solicitud.cantidad || 1) === 1 && Number.isInteger(cantidadGranel) && cantidadGranel > 1 &&
      !/\b(?:bulto|bolsa|paquete|saco)s?\b/i.test(solicitud.textoVisible || "") && referenciaGranel;
    if (convertirGranel && lectura?.producto) {
      lectura.producto.presentacion = "1kg";
      lectura.producto.cantidad = cantidadGranel;
    }
    const referenciaMapeada = lectura?.producto?.referencia;
    const aliasResuelto = marcaSolicitada && solicitud.marca &&
      Number(lectura?.confianza) >= 0.85 &&
      (solicitud.linea || solicitud.referencia ||
        (solicitud.textoVisible && normalizar(solicitud.textoVisible) !== normalizar(solicitud.marca))) &&
      buscarMarca(candidatos, lectura?.producto?.marca || "")?.marca === marcaSolicitada.marca &&
      marcaSolicitada.referencias.some(item => normalizar(item.nombre) === normalizar(referenciaMapeada || ""));
    const textoValidacion = convertirGranel
      ? `${referenciaMapeada} 1kg`
      : aliasResuelto
      ? [referenciaMapeada, solicitud.especie, solicitud.etapa, solicitud.tamano,
          ...(solicitud.sabores || []), ...(solicitud.condiciones || []),
          solicitud.presentacion || lectura.producto.presentacion].filter(Boolean).join(" ")
      : textoSolicitud;
    const validacion = validarCoincidenciaProducto({ mensaje: textoValidacion,
      interpretacion: lectura, catalogo: candidatos, catalogoCandidatos: candidatos,
      clasificacion, contextoProducto: null });
    return { solicitud, textoSolicitud: convertirGranel ? textoValidacion : textoSolicitud,
      candidatos, lectura, validacion };
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
        contextoProducto: consultaIdentidad ? null : contextoProductoAnterior,
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
    const solicitudesProcesadas = [];
    let siguientePaso = "";
    for (const resultado of resultadosMultiples) {
      const titulo = resultado.solicitud.textoVisible || resultado.textoSolicitud;
      const registro = { ...resultado.solicitud, estado: "pendiente" };
      solicitudesProcesadas.push(registro);
      if (!resultado.lectura) {
        respuestas.push(`${titulo}: no pude procesar esta solicitud por un problema temporal.`);
        continue;
      }
      if (resultado.validacion.nivel !== "alta") {
        // La redaccion conversacional pide la aclaracion; no publicar fichas
        // de alternativas inciertas como si fueran productos solicitados.
        respuestas.push(`${titulo}: falta confirmar ${resultado.validacion.aclaracion?.campo || "la referencia o presentación"}. No se agregó al pedido.`);
        continue;
      }
      const lecturaValidada = aplicarCoincidenciaValidada(resultado.lectura, resultado.validacion);
      if (lecturaValidada.carrito?.operacion === "modificar_cantidad") {
        const producto = lecturaValidada.producto;
        const existente = estado.carrito.find(item => item.marca === producto?.marca &&
          item.referencia === producto?.referencia &&
          normalizarPeso(item.peso) === normalizarPeso(producto?.presentacion || ""));
        // La correccion se aplica solo a un item existente. Una aclaracion
        // del mismo turno tambien puede completar otro articulo aun no agregado.
        lecturaValidada.carrito = existente
          ? { ...lecturaValidada.carrito, cantidadObjetivo: producto.cantidad || existente.cantidad }
          : { ...lecturaValidada.carrito, operacion: null, cantidadObjetivo: null };
      }
      const respuestaProducto = resolverConsultaCatalogo(resultado.textoSolicitud, estado,
        resultado.candidatos, lecturaValidada);
      // Cada ejecucion puede generar un resumen parcial. Publicar solo el
      // resumen final del estado evita mostrar el carrito a medio construir.
      const detalle = respuestaProducto?.split("Pedido:")[0].trim();
      respuestas.push(`${titulo}:\n${detalle || "No pude resolver esta referencia; necesito verificarla."}`);
      siguientePaso = respuestaProducto?.match(/Total: [^\n]+\n\n([\s\S]*)$/)?.[1] || siguientePaso;
      Object.assign(registro, {
        marca: lecturaValidada.producto?.marca,
        referencia: lecturaValidada.producto?.referencia,
        presentacion: lecturaValidada.producto?.presentacion,
        cantidad: lecturaValidada.producto?.cantidad || registro.cantidad,
        estado: lecturaValidada.producto?.requierePresentacion || !respuestaProducto ||
          (["agregar", "nuevo_pedido"].includes(lecturaValidada.accion) &&
            !estado.carrito.some(item => item.marca === lecturaValidada.producto?.marca &&
              item.referencia === lecturaValidada.producto?.referencia &&
              (!lecturaValidada.producto?.presentacion ||
                normalizarPeso(item.peso) === normalizarPeso(lecturaValidada.producto.presentacion))))
          ? "pendiente" : "identificado",
      });
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
            cantidad: lecturaValidada.producto?.cantidad || 1, presentaciones: coincidencia.presentaciones });
        }
      }
      if (lecturaValidada.producto) productosValidados.push(lecturaValidada.producto);
    }
    // El motor procesa cada solicitud; la cotizacion persistida conserva el conjunto.
    estado.productosConsultados = [...new Map(consultados.map(item =>
      [`${item.marca}:${item.referencia}:${item.peso || item.presentacion}`, item])).values()]
      .map((item, indice) => ({ ...item, indice: indice + 1 }));
    const anteriores = estado.ultimaSolicitudProductos || [];
    for (const solicitud of solicitudesProcesadas) {
      const mismaIdentidad = item => normalizar(item.marca || "") === normalizar(solicitud.marca || "") &&
        (normalizar(item.referencia || item.textoVisible || "") === normalizar(solicitud.referencia || solicitud.textoVisible || ""));
      let indice = anteriores.findIndex(mismaIdentidad);
      if (indice < 0) {
        const nombreNuevo = normalizar(solicitud.textoVisible || solicitud.referencia || "");
        const previos = anteriores.map((item, i) => ({ item, i })).filter(({ item }) =>
          item.estado === "pendiente" && !item.marca && item.referencia &&
          nombreNuevo.includes(normalizar(item.referencia)));
        if (previos.length === 1) indice = previos[0].i;
      }
      if (indice < 0 && solicitud.marca) {
        const pendientes = anteriores.map((item, i) => ({ item, i })).filter(({ item }) =>
          item.estado === "pendiente" && normalizar(item.marca || "") === normalizar(solicitud.marca));
        if (pendientes.length === 1) indice = pendientes[0].i;
      }
      if (indice < 0) anteriores.push(solicitud);
      else anteriores[indice] = { ...anteriores[indice], ...solicitud };
    }
    estado.ultimaSolicitudProductos = anteriores;
    interpretacionIA = { ...decisionSemantica, producto: null, productos: productosValidados };
    estado._interpretacionTurno = { intencion: interpretacionIA.intencion, accion: interpretacionIA.accion,
      producto: null, productos: solicitudesProcesadas };
    const pendiente = solicitudesProcesadas.find(item => item.estado === "pendiente");
    let preguntaPendiente = null;
    if (pendiente) {
      const nombre = pendiente.textoVisible || pendiente.referencia || pendiente.marca || "el producto pendiente";
      const descripcion = pendiente.presentacion &&
        !normalizarPeso(nombre).includes(normalizarPeso(pendiente.presentacion))
        ? `${nombre} de ${pendiente.presentacion}` : nombre;
      const resultadoPendiente = resultadosMultiples[solicitudesProcesadas.indexOf(pendiente)];
      recordarConsultaProducto(estado, resultadoPendiente.validacion, clasificacion);
      guardarCoincidenciasProductoPendientes(estado, resultadoPendiente.validacion, {
        intencionOriginal: resultadoPendiente.textoSolicitud,
        tipoIntencion: decisionSemantica.intencion, cantidad: pendiente.cantidad,
        presentacion: pendiente.presentacion,
      });
      preguntaPendiente = resultadoPendiente.validacion?.aclaracion
        ? respuestaValidacionProducto(resultadoPendiente.validacion)
        : !pendiente.marca
          ? `¿De qué marca necesitas ${nombre}?`
          : !pendiente.presentacion
            ? `¿Qué presentación necesitas de ${nombre}?`
            : `Para ${descripcion}, ¿me confirmas el nombre completo que aparece en el empaque?`;
    }
    if (pendiente) {
      pendiente.pregunta = preguntaPendiente;
      for (const item of estado.ultimaSolicitudProductos) {
        if (item.estado === "pendiente" && item.marca === pendiente.marca && item.referencia === pendiente.referencia) {
          item.pregunta = preguntaPendiente;
        }
      }
    }
    interpretacionIA.preguntaPendiente = preguntaPendiente;
    if (estado.carrito.length && vertical.orderLogic.resumenCarrito) {
      respuestas.push(vertical.orderLogic.resumenCarrito(estado));
      if (preguntaPendiente) respuestas.push(preguntaPendiente);
      if (siguientePaso && solicitudesProcesadas.every(item => item.estado === "identificado")) {
        respuestas.push(siguientePaso);
      }
    }
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
        // Checkout summaries and bank details retain their protected transport;
        // product conversation is generated from validated facts, never a card.
        productoAutonomo: resultadosMultiples.length ? {
          nivel: "no_aplica",
          resultados: resultadosMultiples.map(item => ({ solicitud: item.solicitud,
            nivel: item.validacion?.nivel || "error",
            aclaracion: item.validacion?.aclaracion || null,
            coincidencia: item.validacion?.nivel === "alta" ? item.validacion.coincidencia : null })),
        } : { ...validacionFinal,
            ...(interpretacionIA?.producto?.requierePresentacion ? { nivel: "media", aclaracion: { campo: "presentacion" } } : {}) },
        model: modeloHumanizar,
        channelUserId: evento.channelUserId,
        onUsage: (usage) => {
          humanizerUsage = usage;
        },
      })
    : respuestaBase;
  let respuesta = resultadosMultiples.length ? respuestaHumanizada
    : asegurarRespuestaCatalogo(mensaje, respuestaHumanizada, { catalogo, interpretacionIA });
  if (respuesta !== respuestaHumanizada) {
    respuesta = await humanizarRespuesta(mensaje, respuesta, {
      estado, cliente, vertical, clasificacion, interpretacionIA,
      productoAutonomo: { ...validacionFinal, nivel: "media", presentacionValida: false },
      model: modeloHumanizar, channelUserId: evento.channelUserId,
    });
  }
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
  _internals: { consultaSolicitudProducto },
  responderEventoEntrante,
  responderEventosEntrantes,
};
