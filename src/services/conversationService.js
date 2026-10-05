const { medir, medirSincrono, contexto } = require('./pipelineTelemetry');
const { duracionTexto, mismaSeleccionCotizada, consultaProductoCotizado } = require('../utils/catalogVariants');
const { precioPorCantidad, datosPrecio, normalizarVentaUnitaria } = require('../utils/catalogCommercialRules');
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
const { normalizar, normalizarPeso, extraerPesoTexto, normalizarMarcasCatalogo, formatearPrecio } = require("../utils/text");
const {
  aplicarCoincidenciaValidada,
  consultaIdentidadRespaldada,
  _internals: { tokensDistintivos, marcaCompatibleConIdentidad },
  construirConsultaProductoContextual,
  esCorreccionProducto,
  respuestaValidacionProducto,
  validarCoincidenciaProducto,
} = require("./productMatchValidator");
const {
  esSenalReferenciaProducto,
  registrarProductosConsultados,
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

function cotizacionSeleccionada(estado) {
  const solicitudes = estado.ultimaSolicitudProductos || [];
  // El foco de busqueda cambia al preguntar por otras presentaciones. La
  // seleccion completa vive en las solicitudes, no en ese foco transitorio.
  if (!solicitudes.length) {
    const consultados = estado.productosConsultados || [];
    const item = consultados.length === 1 ? consultados[0] : null;
    if (!item || !item.marca || !item.referencia || !(item.peso || item.presentacion) ||
        item.precio == null || !Number.isFinite(Number(item.precio)) || Number(item.precio) < 0 ||
        (item.contextoCreadoEn && Date.now() - Date.parse(item.contextoCreadoEn) > 30 * 60 * 1000)) return [];
    return [item];
  }
  if (!solicitudes.every(item => item.estado === "identificado" &&
      item.accion === "consultar" && item.cotizacion?.length === 1)) return [];
  const items = solicitudes.map(item => item.cotizacion[0]);
  if (!items.every(item => item.marca && item.referencia && (item.peso || item.presentacion) &&
      item.precio != null && Number.isFinite(Number(item.precio)) && Number(item.precio) >= 0)) return [];
  return [...new Map(items.map(item =>
    [`${item.marca}:${item.referencia}:${normalizarPeso(item.peso || item.presentacion)}`, item])).values()];
}

function resolverReferenciaDescriptiva(decision, estado, mensaje) {
  if (estado.pedidoConfirmado || decision.accion !== "agregar" || decision.productos?.length > 1) return decision;
  const descriptor = normalizar(mensaje)
    .replace(/\b(?:agrega|agregar|agregame|anade|pon|ponme|quiero|dame|deme|llevo|llevar|necesito|por|favor|de|la|el|las|los|al|carrito|pedido|unidades|unidad|tres|dos|una|uno|un)\b/g, " ")
    .replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim();
  const tipos = [
    ["comida_humeda", /^(?:comida |alimento )?humed[oa]s?$/],
    ["concentrado", /^(?:concentrado|cuido|comida seca)$/],
    ["arena_sustrato", /^(?:arena|sustrato)$/],
    ["snack", /^(?:snacks?|premios?)$/],
  ];
  const tipo = tipos.find(([, patron]) => patron.test(descriptor))?.[0];
  if (!tipo) return decision;
  const cotizacionesVigentes = (estado.ultimaSolicitudProductos || [])
    .filter(item => item.estado === "identificado")
    .flatMap(item => item.cotizacion || []);
  const candidatos = [...(estado.productosConsultados || []), ...cotizacionesVigentes, estado.ultimaSeleccion].filter(item => {
    if (!item?.referencia || item.pendiente || !Number.isFinite(Date.parse(item.contextoCreadoEn)) ||
        Date.now() - Date.parse(item.contextoCreadoEn) > 30 * 60 * 1000) return false;
    return [item.categoria, item.subcategoria].some(valor =>
      normalizar(valor || "").replace(/ /g, "_") === tipo);
  });
  const unicos = [...new Map(candidatos.map(item =>
    [`${item.marca}:${item.referencia}:${normalizarPeso(item.peso || item.presentacion || "")}`, item])).values()];
  if (unicos.length > 1) return { ...decision, intencion: "consulta_producto", accion: "consultar",
    producto: null, productos: [], continuarFlujo: false, consultaCatalogo: { necesaria: false, consulta: null },
    respuestaConversacional: `¿Cuál quieres agregar: ${unicos.map(item => `${item.referencia} ${item.peso || item.presentacion || ""}`.trim()).join(" o ")}?` };
  if (!unicos.length) return { ...decision, producto: { ...decision.producto, marca: null, referencia: descriptor },
    consultaCatalogo: { necesaria: true, consulta: mensaje } };
  const seleccionado = unicos[0];
  const cantidad = Number(normalizar(mensaje).match(/\b(\d+)\b/)?.[1]) || decision.producto?.cantidad || 1;
  const producto = { marca: seleccionado.marca, referencia: seleccionado.referencia,
    presentacion: seleccionado.presentacion || seleccionado.peso, cantidad };
  const consulta = [producto.marca, producto.referencia, producto.presentacion].filter(Boolean).join(" ");
  return { ...decision, intencion: "pedido_producto", producto, productos: [],
    consultaCatalogo: { necesaria: true, consulta }, _consultaContinuada: consulta };
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
  // No trasladar atributos inferidos o de otro item a esta solicitud.
  const evidenciaAtributos = normalizar(producto.textoVisible || mensaje);
  const atributoRespaldado = valor => valor && (evidenciaAtributos.includes(normalizar(valor)) ||
    (producto.marca && respaldo.includes(normalizar(valor))));
  return [...identidad, ...[producto.especie, producto.etapa, producto.tamano].filter(atributoRespaldado),
    ...(producto.sabores || []), ...(producto.condiciones || []), producto.presentacion]
    .filter(Boolean).map(limpiar).filter(Boolean).join(" ") || producto.referencia || "";
}

// Completar un atributo de una solicitud pendiente conserva la identidad cruda
// y la operacion del cliente. Nunca convierte una conjetura en producto validado.
function continuarSolicitudProducto(decision, estado, mensaje) {
  const contexto = estado.ultimaConsultaProducto;
  const previa = contexto?.solicitudOriginal;
  const vigente = contexto?.creadoEn && Date.now() - Date.parse(contexto.creadoEn) < 30 * 60 * 1000;
  if (!vigente || !previa?.producto || estado.pedidoConfirmado || decision.productos?.length > 1 ||
      !["pedido_producto", "consulta_producto", "confirmacion"].includes(decision.intencion)) return decision;
  const actual = decision.producto || {};
  const tokens = tokensDistintivos(mensaje);
  const conocidos = tokensDistintivos([contexto.etiqueta, contexto.terminos?.join(" ")].filter(Boolean).join(" "));
  const confirma = decision.intencion === "confirmacion" && decision.accion === "confirmar" &&
    !contexto.sinCoincidenciaInformada &&
    !(contexto.nivel === "alta" && contexto.presentacion);
  const consultaContextual = construirConsultaProductoContextual(mensaje, contexto);
  const camposAclaracion = {
    peso_mascota: ['especie', 'presentacion'], presentacion: ['presentacion'],
    especie: ['especie', 'presentacion'], etapa: ['etapa'], tamano: ['tamano'],
    sabores: ['sabores'], categoria: ['categoria'], duracion: ['duracion'],
  };
  const campos = camposAclaracion[contexto.aclaracion?.campo] || [];
  const identidad = p => [...new Set(tokensDistintivos([p.marca, p.referencia, p.linea].filter(Boolean).join(' ')))];
  const anterior = identidad(previa.producto);
  const nueva = identidad(actual);
  const mismaIdentidad = anterior.length && nueva.length && anterior.length === nueva.length &&
    anterior.every(token => nueva.includes(token));
  const pesoExplicito = extraerPesoTexto(mensaje);
  const atributos = { ...actual,
    ...(pesoExplicito ? { presentacion: pesoExplicito } : {}),
    ...(duracionTexto(mensaje) ? { duracion: duracionTexto(mensaje) } : {}) };
  // El intérprete resuelve la intención en lenguaje natural. Si conserva la
  // identidad pendiente y aporta el atributo solicitado, usar esos datos
  // estructurados; las palabras sociales no son un nombre nuevo de producto.
  const respuestaSemantica = mismaIdentidad && Number(decision.confianza) >= 0.55 &&
    campos.some(campo => Array.isArray(atributos[campo]) ? atributos[campo].length : atributos[campo]);
  const respondeAtributo = Boolean(respuestaSemantica || (contexto.aclaracion && consultaContextual !== mensaje));
  const completa = respondeAtributo || (!tokens.length && actual.presentacion) ||
    (tokens.length > 0 && tokens.length <= 3 && tokens.every(t => conocidos.includes(t)));
  if (!confirma && !completa) return decision;
  const producto = { ...previa.producto };
  for (const [campo, valor] of Object.entries(respuestaSemantica ? atributos : actual)) {
    // Una respuesta a especie/tamano/etc. no autoriza sustituir la linea,
    // la etapa ni la referencia por una conjetura nueva del interprete.
    if (respondeAtributo && !(respuestaSemantica ? campos.includes(campo) : campo === contexto.aclaracion.campo)) continue;
    if (valor != null && (!Array.isArray(valor) || valor.length)) producto[campo] = valor;
  }
  if (respondeAtributo) {
    const elegido = (contexto.aclaracion.valores || []).find(valor =>
      tokensDistintivos(valor).every(token => tokens.includes(token)));
    if (elegido) producto[contexto.aclaracion.campo] = contexto.aclaracion.campo === "sabores" ? [elegido] : elegido;
  }
  // Una aclaracion textual posterior a una foto es evidencia nueva. Si se
  // conserva observado con peso ilegible, no debe borrar el peso ya escrito.
  const pesoLiteral = mensaje.match(/\b\d+(?:[.,]\d+)?\s*(?:kg|kl|kr|kilos?|kilogramos?|gr|g|gramos?|lb|libras?)\b/i)?.[0];
  if (producto.observado && pesoLiteral) {
    producto.solicitud = { ...producto.solicitud, presentacionTexto: normalizarPeso(pesoLiteral) };
    producto.presentacion = normalizarPeso(pesoLiteral);
    producto.requierePresentacion = false;
  }
  const identidadValidada = contexto.nivel === "alta" && previa.producto.marca && previa.producto.referencia;
  const consultaContinuada = identidadValidada
    ? consultaProductoCotizado({ ...producto, referencia: previa.producto.referencia, marca: previa.producto.marca })
    : respuestaSemantica
    ? [...(contexto.terminos?.length ? contexto.terminos : anterior),
        ...campos.flatMap(campo => atributos[campo] || []),
        producto.presentacion || contexto.presentacion].filter(Boolean).join(' ')
    : [respondeAtributo ? consultaContextual : (contexto.terminos || []).join(" "),
        producto.presentacion || contexto.presentacion].filter(Boolean).join(" ");
  // Completing an uncertain lookup preserves its purpose. Selecting an already
  // validated product may now be a purchase, as interpreted from this turn.
  const compraSeleccionValidada = identidadValidada && decision.accion === 'agregar';
  return { ...decision, intencion: compraSeleccionValidada ? decision.intencion : previa.intencion,
    accion: compraSeleccionValidada ? decision.accion : previa.accion,
    producto, productos: [], continuarFlujo: true,
    consultaCatalogo: { necesaria: true, consulta: consultaContinuada },
    _consultaContinuada: consultaContinuada };
}

function mencionProductoRespaldada(producto, mensaje, catalogo = []) {
  const literal = producto?.mencionOriginal || producto?.textoVisible;
  if (!literal || !normalizar(mensaje).includes(normalizar(literal))) return null;
  // La segmentacion puede quitar prosa, pero no una variante comercial
  // nombrada por el cliente. Un fragmento inventado nunca es evidencia.
  const terminosCatalogo = new Set(catalogo.flatMap(m => (m.referencias || [])
    .flatMap(r => tokensDistintivos([r.nombre, ...(r.metadata?.original_names || [])].join(" ")))));
  const identidad = tokensDistintivos(literal);
  const conserva = tokensDistintivos(mensaje).filter(t => terminosCatalogo.has(t))
    .every(t => identidad.includes(t));
  return conserva && identidad.length ? literal : null;
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
  interpretacion = null,
}) {
  registrarValidacionProducto(evento, validacion);
  recordarConsultaProducto(estado, validacion, clasificacion);
  guardarCoincidenciasProductoPendientes(estado, validacion, {
    intencionOriginal: mensaje,
    tipoIntencion: interpretacion?.intencion || clasificacion?.intencion || "consulta_producto",
    cantidad: interpretacion?.producto?.cantidad,
    presentacion: interpretacion?.producto?.presentacion || validacion.presentacionSolicitada,
  });
  // La aclaracion sale antes del motor: conserva la operacion y los datos
  // aportados sin agregar una referencia que aun no ha sido validada.
  if (interpretacion && estado.ultimaConsultaProducto) {
    estado.ultimaConsultaProducto.solicitudOriginal = {
      intencion: interpretacion.intencion, accion: interpretacion.accion,
      producto: interpretacion.producto, entrega: interpretacion.entrega,
    };
    obtenerVerticalCliente(cliente).orderLogic.aplicarDatosInterpretados?.(estado, interpretacion);
  }
  if (estado.ultimaConsultaProducto) estado.ultimaConsultaProducto.sinCoincidenciaInformada =
    validacion.nivel === "baja" && !validacion.aclaracion && !validacion.alternativas?.length;
  let respuestaBase = respuestaValidacionProducto(validacion);
  if (estado.carrito?.length) {
    respuestaBase += `\n\n${obtenerVerticalCliente(cliente).orderLogic.resumenCarrito(estado)}`;
  }
  let humanizerUsage = { skipped: true, reason: "validacion_catalogo" };
  const respuesta = await humanizarRespuesta(mensaje, respuestaBase, {
        estado, cliente, vertical: obtenerVerticalCliente(cliente),
        clasificacion, aclaracion: validacion.aclaracion,
        productoAutonomo: validacion,
        channelUserId: evento.channelUserId,
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
    resolverConsultaCatalogo: resolverConsultaCatalogoBase,
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
  const resolverConsultaCatalogo = (...args) => medirSincrono('tool_order_logic', () => resolverConsultaCatalogoBase(...args));
  const { asegurarRespuestaCatalogo } = vertical.productLogic;
  const estado = await medir("load_context", () => obtenerConversacionPersistida(evento.channelUserId, cliente));
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
    const resultadosMedia = await Promise.allSettled(
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
    // No liberar la conversación si falla un archivo mientras los demás
    // siguen descargándose o transcribiéndose en este mismo lote.
    const falloMedia = resultadosMedia.find(resultado => resultado.status === 'rejected');
    if (falloMedia) throw falloMedia.reason;
    contenidos = resultadosMedia.map(resultado => resultado.value);
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
  // Revisar omisiones por cobertura semántica, no por saltos de línea.
  const contarSolicitudes = lectura => lectura?.productos?.length ||
    (lectura?.producto && ['marca', 'referencia', 'textoVisible', 'categoria'].some(campo => lectura.producto[campo]) ? 1 : 0);
  const solicitudesEsperadas = decisionSemantica.solicitudesProductoDetectadas;
  if (!imageUrls.length && decisionSemantica.consultaCatalogo?.necesaria === true &&
      ["agregar", "consultar"].includes(decisionSemantica.accion) &&
      Number.isInteger(solicitudesEsperadas) && solicitudesEsperadas > contarSolicitudes(decisionSemantica)) {
    const revisionLista = await interpretarMensajeCliente({
      mensaje, estado, catalogo: [], historialReciente: historialSemantico,
      imageUrls, cliente, vertical,
      clasificacion: { ...clasificacion, intencion: null, perfilContexto: "pedido",
        limiteHistorial: historialSemantico.length, decisionHerramientas: true, revisionLista: true },
      model: process.env.OPENAI_ROUTER_MODEL || "gpt-5.4", channelUserId: evento.channelUserId,
    });
    if (revisionLista && contarSolicitudes(revisionLista) >= solicitudesEsperadas) {
      // Una revisión de cobertura completa productos; no cambia una cotización
      // en compra ni pierde los datos de entrega ya interpretados.
      decisionSemantica = { ...decisionSemantica,
        producto: revisionLista.productos?.length > 1 ? null : revisionLista.producto,
        productos: revisionLista.productos || [],
        solicitudesProductoDetectadas: revisionLista.solicitudesProductoDetectadas ?? solicitudesEsperadas,
        consultaCatalogo: { necesaria: true,
          consulta: revisionLista.consultaCatalogo?.consulta || decisionSemantica.consultaCatalogo.consulta } };
    }
    else {
      const respuesta = 'No pude separar todos los productos de tu solicitud con seguridad. ¿Puedes confirmar cuáles necesitas?';
      await guardarConversacionPersistida(evento.channelUserId, estado, { idsEventos, cliente, mensaje, respuesta });
      return respuesta;
    }
  }
  decisionSemantica = resolverEvidenciaInterpretacion(decisionSemantica);
  let propuestaOperacion = null;
  // Verificar el significado antes de cualquier efecto sobre una seleccion.
  // El router general propone; esta revision se centra en operacion, target y
  // cantidad, incluyendo la diferencia entre excluir X y conservar solo X.
  if (!imageUrls.length && (estado.carrito.length || cotizacionSeleccionada(estado).length) &&
      ["agregar", "quitar", "mantener_solo", "modificar_cantidad", "conflicto"].includes(
        vertical.orderLogic.operacionCarritoInterpretada?.(decisionSemantica))) {
    propuestaOperacion = { accion: decisionSemantica.accion, carrito: decisionSemantica.carrito,
      producto: decisionSemantica.producto, productos: decisionSemantica.productos };
    const revision = await interpretarMensajeCliente({ mensaje, estado, catalogo: [],
      historialReciente: historialSemantico, cliente, vertical,
      clasificacion: { ...clasificacion, decisionHerramientas: true, perfilContexto: "pedido",
        revisionOperacion: decisionSemantica },
      model: process.env.OPENAI_ROUTER_MODEL || "gpt-5.4", channelUserId: evento.channelUserId });
    if (!revision || !(revision.confianza >= 0.55)) {
      const respuesta = "No pude determinar con seguridad qué cambio necesitas. ¿Qué producto quieres cambiar y cómo debe quedar?";
      await guardarConversacionPersistida(evento.channelUserId, estado, { idsEventos, cliente, mensaje, respuesta });
      return respuesta;
    }
    decisionSemantica = resolverEvidenciaInterpretacion(revision);
  }
  // La accion conserva su objetivo independientemente de la herramienta elegida.
  // Resolver antes de aceptar cotizaciones, confirmar o continuar una busqueda.
  const operacionExistente = vertical.orderLogic.operacionCarritoInterpretada?.(decisionSemantica);
  if (["quitar", "mantener_solo", "modificar_cantidad", "conflicto"].includes(operacionExistente) ||
      (operacionExistente === "agregar" && !estado.pedidoConfirmado && !(decisionSemantica.productos?.length > 1) &&
        (estado.carrito.length || decisionSemantica.carrito?.cantidadDelta != null))) {
    Object.defineProperty(estado, "_interpretacionTurno", { configurable: true, writable: true,
      value: { intencion: decisionSemantica.intencion, accion: decisionSemantica.accion,
        producto: decisionSemantica.producto, productos: decisionSemantica.productos,
        carrito: decisionSemantica.carrito, propuestaOperacion } });
    const consultaAnterior = decisionSemantica.consultaCatalogo;
    decisionSemantica.consultaCatalogo = { necesaria: false, consulta: null };
    const cotizacion = !estado.carrito.length ? cotizacionSeleccionada(estado) : [];
    // Cotizar no es comprar: ejecutar el mismo motor sobre una copia de la
    // seleccion cotizada y conservar solo sus cambios de contexto, no un carrito.
    const estadoOperacion = cotizacion.length
      ? { ...estado, carrito: cotizacion.map(item => ({ ...item, peso: item.peso || item.presentacion })) }
      : estado;
    let respuesta = vertical.orderLogic.resolverOperacionCarritoIA(mensaje, estadoOperacion, [], decisionSemantica);
    if (respuesta != null) {
      if (cotizacion.length) {
        if (estadoOperacion._resultadoOperacionCarrito?.mutationApplied) {
          for (const campo of ["ultimaSolicitudProductos", "productosConsultados", "ultimaSeleccion",
            "referenciasPendientes", "coincidenciasProductoPendientes", "ultimaConsultaProducto"]) {
            estado[campo] = estadoOperacion[campo];
          }
          respuesta = estadoOperacion.carrito.length
            ? `Listo, actualicé la cotización.\n\n${vertical.orderLogic.resumenCarrito(estadoOperacion).replace("Pedido:", "Cotización:")}\n\n¿Continuamos con la entrega?`
            : "Listo, la cotización quedó vacía. ¿Qué producto necesitas?";
        } else respuesta = respuesta.replace(/Pedido/g, "Cotización").replace(/pedido/g, "cotización");
      }
      // El resultado verificado del motor es la respuesta operativa. Una propuesta
      // conversacional o su humanizacion no pueden confirmar otra mutacion.
      await guardarConversacionPersistida(evento.channelUserId, estado, {
        idsEventos, cliente, mensaje, respuesta: respuestaParaHistorial(respuesta),
      });
      return respuesta;
    }
    decisionSemantica.consultaCatalogo = consultaAnterior;
  }
  if (!imageUrls.length && vertical.orderLogic.esConfirmacionCierreExplicita?.(mensaje, estado)) {
    // A complete, explicit checkout reply remains a confirmation when buffered
    // with thanks; historical payment/product fields are not new instructions.
    decisionSemantica = { ...decisionSemantica, intencion: "confirmacion", accion: "confirmar",
      confianza: 1, continuarFlujo: true, consultaCatalogo: { necesaria: false, consulta: null },
      producto: null, productos: [], entrega: {}, datosCliente: {}, carrito: {} };
  }
  if (!imageUrls.length) {
    decisionSemantica = resolverReferenciaDescriptiva(decisionSemantica, estado, mensaje);
    if (!decisionSemantica._consultaContinuada) decisionSemantica = continuarSolicitudProducto(decisionSemantica, estado, mensaje);
  }
  // Una identidad reconocible exige consultar el catalogo antes de pedir mas
  // datos, aunque el router proponga una respuesta conversacional prematura.
  if (!imageUrls.length && ["pedido_producto", "consulta_producto"].includes(decisionSemantica.intencion) &&
      decisionSemantica.consultaCatalogo?.necesaria !== true &&
      (decisionSemantica.producto?.marca || decisionSemantica.producto?.referencia ||
        ((decisionSemantica.producto?.categoria || decisionSemantica.producto?.subcategoria) &&
          decisionSemantica.producto?.textoVisible?.trim()))) {
    const consulta = consultaSolicitudProducto(decisionSemantica.producto, mensaje);
    if (consulta) decisionSemantica.consultaCatalogo = { necesaria: true, consulta };
  }
  // Aceptar una cotizacion o completar una compra requiere ejecutar el motor,
  // aunque el router crea que ya no hace falta buscar informacion.
  const seleccionActual = !estado.ultimaSeleccion?.pendiente && estado.ultimaSeleccion?.referencia
    ? estado.ultimaSeleccion
    : estado.productosConsultados?.length === 1 ? estado.productosConsultados[0] : null;
  const cotizacionCompleta = cotizacionSeleccionada(estado);
  const datosParaEntrega = !imageUrls.length && !estado.pedidoConfirmado &&
    ["datos_envio", "metodo_pago"].includes(decisionSemantica.intencion) &&
    Boolean(decisionSemantica.entrega?.direccion ||
      Object.values(decisionSemantica.datosCliente || {}).some(Boolean) ||
      (decisionSemantica.intencion === 'datos_envio' && decisionSemantica.entrega?.tipo === 'domicilio' &&
        !['consultar', 'consultar_pago'].includes(decisionSemantica.accion)));
  const aceptaCotizacionConEntrega = datosParaEntrega && !estado.carrito?.length && cotizacionCompleta.length > 0;
  const aceptaSeleccion = decisionSemantica.intencion === "confirmacion" &&
    decisionSemantica.accion === "confirmar" && decisionSemantica.confianza >= 0.55 &&
    !estado.carrito?.length && !estado.pedidoConfirmado && (seleccionActual || cotizacionCompleta.length) &&
    (estado.ultimaConsultaProducto?.solicitudOriginal?.accion === "agregar" ||
      /(?:agreg|llev|dejamos|pedido|sirve)/i.test(estado.ultimaPreguntaAsistente || ""));
  const mismaSeleccion = seleccionActual && (!decisionSemantica.producto?.referencia ||
    (normalizar(decisionSemantica.producto.referencia) === normalizar(seleccionActual.referencia) &&
      (!decisionSemantica.producto.marca || normalizar(decisionSemantica.producto.marca) === normalizar(seleccionActual.marca))));
  const compraCotizada = !imageUrls.length && decisionSemantica.accion === "agregar" &&
    mismaSeleccion && !estado.pedidoConfirmado && !(decisionSemantica.productos?.length > 1);
  const compraSinBusqueda = decisionSemantica.accion === "agregar" &&
    decisionSemantica.consultaCatalogo?.necesaria !== true;
  if (aceptaSeleccion || compraSinBusqueda || compraCotizada || aceptaCotizacionConEntrega) {
    const producto = (compraCotizada || (aceptaSeleccion && seleccionActual)) ? { ...seleccionActual,
      ...Object.fromEntries(Object.entries(decisionSemantica.producto || {}).filter(([, v]) => v != null)),
      cantidad: decisionSemantica.producto?.cantidad || estado.ultimaConsultaProducto?.solicitudOriginal?.producto?.cantidad || seleccionActual.cantidad,
      presentacion: decisionSemantica.producto?.presentacion || seleccionActual.presentacion || seleccionActual.peso,
    } : decisionSemantica.producto?.referencia ? decisionSemantica.producto : seleccionActual;
    const productos = aceptaCotizacionConEntrega ? cotizacionCompleta
      : compraCotizada ? [producto] : decisionSemantica.productos?.length ? decisionSemantica.productos
      : aceptaSeleccion && cotizacionCompleta.length ? cotizacionCompleta : [producto];
    if (productos.every(item => item?.marca && item?.referencia)) {
      const solicitados = productos.map(item => ({ ...item, presentacion: item.presentacion || item.peso || null }));
      decisionSemantica = { ...decisionSemantica, intencion: "pedido_producto", accion: "agregar",
        _compraDesdeCotizacion: Boolean(aceptaCotizacionConEntrega || (aceptaSeleccion && cotizacionCompleta.length)),
        continuarFlujo: true, producto: solicitados.length === 1 ? solicitados[0] : null, productos: solicitados,
        consultaCatalogo: { necesaria: true, consulta: solicitados.map(consultaProductoCotizado).join("; ") } };
      if (decisionSemantica._compraDesdeCotizacion && solicitados.length === 1) {
        decisionSemantica._consultaContinuada = decisionSemantica.consultaCatalogo.consulta;
      }
    }
  }
  if (decisionSemantica.accion === 'consultar' && decisionSemantica.consultaCatalogo?.necesaria) {
    const actuales = decisionSemantica.productos?.length ? decisionSemantica.productos : [decisionSemantica.producto].filter(Boolean);
    const pendientesRespuesta = (estado.historialProductosConsultados || []).filter(p => p.pendienteRespuesta &&
      Date.now() - Date.parse(p.actualizadoEn || p.creadoEn) < 30 * 60 * 1000 &&
      !actuales.some(a => normalizar(a.referencia || '') === normalizar(p.referencia)));
    if (pendientesRespuesta.length) {
      const anteriores = pendientesRespuesta.map(p => ({ marca: p.marca, referencia: p.referencia,
        textoVisible: p.referencia, accion: 'consultar',
        presentacion: p.presentaciones.length === 1 ? p.presentaciones[0].peso : null,
        _cotizacionPendiente: true }));
      decisionSemantica = { ...decisionSemantica, producto: null, productos: [...anteriores, ...actuales] };
    }
  }
  const consultaCarrito = vertical.orderLogic.esConsultaResumenCarrito?.(mensaje, decisionSemantica);
  if (consultaCarrito) decisionSemantica = { ...decisionSemantica, intencion: "carrito",
    accion: "consultar", continuarFlujo: true, carrito: {},
    consultaCatalogo: { necesaria: false, consulta: null } };
  Object.defineProperty(estado, "_interpretacionTurno", { configurable: true, writable: true,
    value: { intencion: decisionSemantica.intencion, accion: decisionSemantica.accion,
      producto: decisionSemantica.producto, productos: decisionSemantica.productos,
        carrito: decisionSemantica.carrito, propuestaOperacion } });
  const consultaSemantica = decisionSemantica?.consultaCatalogo;
  const necesitaCatalogo = consultaSemantica?.necesaria === true &&
    typeof consultaSemantica.consulta === "string" && consultaSemantica.consulta.trim().length > 0;
  console.log(`[Semantic Router] catalogo=${necesitaCatalogo ? "si" : "no"} | continuarFlujo=${decisionSemantica?.continuarFlujo === true ? "si" : "no"} | interpretacion=${decisionSemantica ? "recibida" : "no_disponible"}`);
  if (!necesitaCatalogo) {
    if (decisionSemantica) {
      decisionSemantica.consultaCatalogo = { necesaria: false, consulta: null };
      // No consultar catalogo no borra la entidad comprendida. El motor
      // limita esta ruta a operaciones existentes y datos, sin buscar ni agregar.
    }
    const respuestaConversacional = decisionSemantica?.respuestaConversacional ||
      "¿Puedes contarme un poco más sobre lo que necesitas?";
    // El motor existente conserva la autoridad sobre las transiciones y pedidos.
    const operacionPendiente = datosParaEntrega || (estado.carrito?.length > 0 &&
      ((!estado.pedidoConfirmado && ["datos_envio", "metodo_pago"].includes(decisionSemantica?.intencion)) ||
        decisionSemantica?.intencion === "confirmacion" ||
        (!estado.pedidoConfirmado && (Object.values(decisionSemantica?.datosCliente || {}).some(Boolean) ||
          Object.values(decisionSemantica?.entrega || {}).some(Boolean)))));
    const consultaPago = decisionSemantica?.accion === "consultar_pago" ||
      (estado.pedidoConfirmado && decisionSemantica?.intencion === "metodo_pago");
    const aclaracionPendiente = estado.ultimaSolicitudProductos?.find(item => item.estado === "pendiente" && item.pregunta);
    const respuestaBase = decisionSemantica?.intencion === "confirmacion" && aclaracionPendiente
      ? ["Conservo los productos de tu carrito.",
          estado.carrito.length && vertical.orderLogic.resumenCarrito?.(estado),
          aclaracionPendiente.pregunta].filter(Boolean).join("\n\n")
      : decisionSemantica?.continuarFlujo === true || operacionPendiente || consultaPago || consultaCarrito
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
  const mencionBusqueda = !decisionSemantica._consultaContinuada && !imageUrls.length && !(decisionSemantica.productos?.length > 1)
    ? mencionProductoRespaldada(decisionSemantica.producto, mensaje) : null;
  // La aceptacion recupera una identidad ya cotizada. La frase operativa
  // ("me lo envias") no debe filtrar los candidatos de esa referencia.
  const identidadBusqueda = decisionSemantica._consultaContinuada || mencionBusqueda ||
    ((compraCotizada || aceptaSeleccion) ? consultaSemantica.consulta.trim() : mensaje);
  const catalogoIA = await seleccionarCatalogoParaIA({
    catalogo: [], mensaje: imageUrls.length && decisionSemantica.producto?.observado
      ? consultaProductoVisual(decisionSemantica.producto) || consultaSemantica.consulta.trim()
      : mencionBusqueda || consultaSemantica.consulta.trim(), mensajeOriginal: identidadBusqueda, estado: {},
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
  // Una consulta generada sirve para recuperar candidatos, no para probar
  // la identidad que ella misma propone. Validar contra el mensaje original.
  const productoSolicitado = decisionSemantica.producto;
  const esContinuacion = (esSenalReferenciaProducto(mensaje) && tokensDistintivos(mensaje).length <= 1) || tokensDistintivos(mensaje).length === 0;
  // La identidad de una compra aceptada procede de una cotizacion persistida,
  // no de una nueva conjetura del modelo. Una identidad nueva explicita prevalece.
  const identidadActual = (compraCotizada || aceptaSeleccion) ? validarCoincidenciaProducto({ mensaje, catalogo,
    catalogoCandidatos: catalogo, clasificacion }) : null;
  const contradiceCotizacion = identidadActual?.nivel === "alta" &&
    normalizar(identidadActual.coincidencia?.referencia) !== normalizar(seleccionActual?.referencia);
  const continuaCotizacion = Boolean((compraCotizada || aceptaSeleccion) && seleccionActual && !contradiceCotizacion);
  const mencionLiteral = mencionProductoRespaldada(productoSolicitado, mensaje, catalogo);
  const fuenteIdentidad = decisionSemantica._consultaContinuada ||
    (esContinuacion || continuaCotizacion ? consultaSemantica.consulta : mencionLiteral || mensaje);
  const consultaIdentidad = consultaIdentidadRespaldada(productoSolicitado, fuenteIdentidad);
  // La compresion solo elimina texto operativo; no puede borrar una
  // variante del catalogo que el cliente nombro y el modelo omitio.
  const terminosCatalogo = new Set(catalogo.flatMap(m => (m.referencias || [])
    .flatMap(r => tokensDistintivos([r.nombre, ...(r.metadata?.original_names || [])].join(" ")))));
  const identidadCompleta = consultaIdentidad &&
    (!duracionTexto(fuenteIdentidad) || duracionTexto(consultaIdentidad) === duracionTexto(fuenteIdentidad)) &&
    tokensDistintivos(fuenteIdentidad)
    .filter(t => terminosCatalogo.has(t)).every(t => tokensDistintivos(consultaIdentidad).includes(t));
  let mensajeParaValidar = imageUrls.length ? mensaje : identidadCompleta ? consultaIdentidad : fuenteIdentidad;
  // Solo una selección persistida autoriza recuperar atributos omitidos al
  // aceptar una cotización. Una variante explícita nueva prevalece.
  const recientes = (estado.historialProductosConsultados || [])
    .filter(item => Date.now() - Date.parse(item.actualizadoEn || item.creadoEn) < 30 * 60 * 1000)
    .flatMap(item => (item.presentaciones || []).map(p => ({ ...item, ...p,
      referencia: p.referenciaCatalogo || item.referencia, presentacion: p.peso })));
  const cotizacionesAceptables = [...new Map([
    ...recientes, ...cotizacionCompleta, ...(seleccionActual ? [seleccionActual] : [])
  ].map(item => [`${item.marca}:${item.referencia}:${normalizarPeso(item.peso || item.presentacion)}`, item])).values()];
  const recuperarCotizada = solicitud => {
    if (imageUrls.length || ((solicitud.accion || decisionSemantica.accion) !== 'agregar' && !solicitud._cotizacionPendiente) || duracionTexto(mensaje)) return null;
    const compatibles = cotizacionesAceptables.filter(item => mismaSeleccionCotizada(solicitud, item));
    return compatibles.length === 1 ? compatibles[0] : null;
  };
  const cotizadaIndividual = recuperarCotizada(decisionSemantica.producto || {});
  if (cotizadaIndividual) mensajeParaValidar = consultaProductoCotizado(cotizadaIndividual);

  const contextoProductoAnterior = clasificacion.accionPendiente ? null : estado.ultimaConsultaProducto || null;
  const corrigeProductoAnterior = esCorreccionProducto(mensaje);
  if (corrigeProductoAnterior) {
    reiniciarFocoProducto(estado);
  }
  const mensajeProductoRazonado = construirConsultaProductoContextual(
    mensaje,
    contextoProductoAnterior
  );
  const continuaAclaracion = Boolean(decisionSemantica._consultaContinuada ||
    (contextoProductoAnterior?.aclaracion && mensajeProductoRazonado !== mensaje));
  const reinicioPorVision = clasificacion.requiereVision;
  if (reinicioPorVision) {
    reiniciarFocoProducto(estado);
  }
  const iniciaNuevaBusquedaProducto = Boolean(
    !clasificacion.accionPendiente && !continuaAclaracion && !continuaCotizacion && clasificacion.requiereBusquedaProducto &&
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
  // Una compra ya resuelta por identidad y peso pasa a validacion y al motor;
  // el selector de cotizaciones no debe volver a preguntar si quiere agregarla.
  const compraDefinida = decisionSemantica.accion === "agregar" &&
    ((decisionSemantica.producto?.referencia && decisionSemantica.producto?.presentacion) ||
      (decisionSemantica.productos?.length > 1 && decisionSemantica.productos.every(item => item.referencia && item.presentacion)));
  const aclaracionMultiple = estado.ultimaSolicitudProductos?.some(item => item.estado === "pendiente");
  const seleccionPendiente = compraDefinida || aclaracionMultiple ? null : resolverSeleccionProductoPendiente({
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
      interpretacion: decisionSemantica,
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
    const cotizada = recuperarCotizada(solicitud);
    const textoSolicitud = cotizada ? consultaProductoCotizado(cotizada) : decisionSemantica._compraDesdeCotizacion
      ? consultaProductoCotizado(solicitud)
      : consultaSolicitudProducto(solicitud, mensaje, imageUrls.length > 0);
    let candidatos = catalogoIA.resultadosPorProducto?.[indice]?.catalogo || catalogo;
    // El motor ya conoce los aliases de marca. Conserva ese mismo limite
    // tambien al validar cada item para no ofrecer marcas ajenas al pedido.
    const marcaSolicitada = solicitud.marca ? buscarMarca(candidatos, solicitud.marca) : null;
    if (marcaSolicitada && !imageUrls.length) candidatos = candidatos.filter(item => item.marca === marcaSolicitada.marca ||
      item.referencias.some(referencia => marcaCompatibleConIdentidad(
        item, referencia, marcaSolicitada.marca, tokensDistintivos(textoSolicitud))));
    if (catalogoIA.resultadosPorProducto?.[indice]?.metadata?.errorBusqueda) {
      return { solicitud, textoSolicitud, candidatos, lectura: null, validacion: null };
    }
    // Validar primero la solicitud original contra los candidatos. Una
    // coincidencia suficiente no necesita otro mapeo que cambie su identidad.
    const accionSolicitud = solicitud.accion || decisionSemantica.accion;
    const decisionSolicitud = { ...decisionSemantica, accion: accionSolicitud,
      intencion: accionSolicitud === 'consultar' ? 'consulta_producto' : decisionSemantica.intencion,
      carrito: accionSolicitud === 'consultar' ? {} : decisionSemantica.carrito };
    const lecturaObservada = { ...decisionSolicitud, producto: solicitud, productos: [solicitud] };
    if (!imageUrls.length || solicitud.observado || decisionSemantica._compraDesdeCotizacion || cotizada) {
      const validacion = validarCoincidenciaProducto({ mensaje: textoSolicitud,
        interpretacion: lecturaObservada, catalogo: candidatos, catalogoCandidatos: candidatos,
        clasificacion, contextoProducto: null });
      const pesoExplicito = extraerPesoTexto(solicitud.mencionOriginal || solicitud.textoVisible || "");
      const presentacionLiteralResuelta = pesoExplicito && validacion.coincidencia?.presentaciones?.some(p =>
        normalizarPeso(p.peso) === normalizarPeso(pesoExplicito));
      if (validacion.nivel === "alta" && (imageUrls.length || cotizada ||
          decisionSemantica._compraDesdeCotizacion || presentacionLiteralResuelta)) return { solicitud, textoSolicitud, candidatos,
        lectura: lecturaObservada, validacion };
    }
    let lectura = await interpretarMensajeCliente({
      mensaje: `Intencion: ${decisionSolicitud.intencion}. Accion: ${decisionSolicitud.accion}. Solicitud: ${textoSolicitud}. Cantidad de unidades: ${solicitud.cantidad || "no especificada"}${solicitud.observado ? `. Evidencia extraida de la imagen: ${JSON.stringify(solicitud.observado)}. No estas recibiendo la imagen en este paso: conserva esta evidencia sin inventar otra lectura.` : ""}`,
      estado, catalogo: candidatos, ejemplosEntrenamiento, historialReciente: [],
      cliente, vertical, clasificacion, model: modeloIA, channelUserId: evento.channelUserId,
    });
    // La primera interpretacion autoriza herramientas. El mapeo contra
    // candidatos no vuelve a decidir si esa busqueda era necesaria.
    lectura = resolverEvidenciaInterpretacion(lectura, { ...decisionSolicitud, producto: solicitud, productos: [solicitud] });
    if (lectura?.producto && solicitud.observado) {
      lectura.producto.observado = solicitud.observado;
      lectura = resolverEvidenciaInterpretacion(lectura);
    }
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
    const kilosLiterales = (solicitud.textoVisible || "").match(/^\s*[-•]?\s*(\d+(?:[.,]\d+)?)\s*(?:kilos?|kg|kl)\s+de\b/i);
    const pesoGranel = normalizarPeso(kilosLiterales ? `${kilosLiterales[1]}kg` : solicitud.presentacion || "").match(/^(\d+(?:\.\d+)?)kg$/);
    const referenciaGranel = candidatos.flatMap(marca => marca.referencias).find(item =>
      normalizar(item.nombre) === normalizar(lectura?.producto?.referencia || "") &&
      item.presentaciones.some(p => normalizarPeso(p.peso) === "1kg"));
    const cantidadGranel = pesoGranel && Number(pesoGranel[1]);
    const convertirGranel = !imageUrls.length &&
      (normalizar(solicitud.categoria || "") === "granel" ||
        Boolean(kilosLiterales)) &&
      (kilosLiterales || Number(solicitud.cantidad || 1) === 1) && Number.isInteger(cantidadGranel) && cantidadGranel > 1 &&
      !/\b(?:bulto|bolsa|paquete|saco)s?\b/i.test(solicitud.textoVisible || "") && referenciaGranel &&
      !referenciaGranel.presentaciones.some(p => normalizarPeso(p.peso) === `${cantidadGranel}kg`);
    if (convertirGranel && lectura?.producto) {
      lectura.producto.presentacion = "1kg";
      lectura.producto.cantidad = cantidadGranel;
    }
    const pesoLiteral = extraerPesoTexto(solicitud.mencionOriginal || solicitud.textoVisible || textoSolicitud);
    if (lectura?.producto && pesoLiteral && !convertirGranel) lectura.producto.pesoTextoOriginal = pesoLiteral;
    const convertirUnidades = normalizarVentaUnitaria(lectura, candidatos, solicitud.mencionOriginal || solicitud.textoVisible || textoSolicitud);
    const referenciaMapeada = lectura?.producto?.referencia;
    const aliasResuelto = marcaSolicitada && solicitud.marca &&
      Number(lectura?.confianza) >= 0.85 &&
      (solicitud.linea || solicitud.referencia ||
        (solicitud.textoVisible && normalizar(solicitud.textoVisible) !== normalizar(solicitud.marca))) &&
      buscarMarca(candidatos, lectura?.producto?.marca || "")?.marca === marcaSolicitada.marca &&
      marcaSolicitada.referencias.some(item => normalizar(item.nombre) === normalizar(referenciaMapeada || ""));
    const textoValidacion = convertirUnidades ? `${referenciaMapeada} ${lectura.producto.presentacion} ${solicitud.especie || ""}` : convertirGranel
      ? `${referenciaMapeada} 1kg`
      : aliasResuelto
      ? [referenciaMapeada, solicitud.especie, solicitud.etapa, solicitud.tamano,
          ...(solicitud.sabores || []), ...(solicitud.condiciones || []),
          solicitud.presentacion || lectura.producto.presentacion, duracionTexto(textoSolicitud)].filter(Boolean).join(" ")
      : textoSolicitud;
    const validacion = validarCoincidenciaProducto({ mensaje: textoValidacion,
      interpretacion: lectura, catalogo: candidatos, catalogoCandidatos: candidatos,
      clasificacion, contextoProducto: null });
    return { solicitud, textoSolicitud: convertirGranel || convertirUnidades ? textoValidacion : textoSolicitud,
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

  const pesoLiteral = extraerPesoTexto(mensaje);
  if (interpretacionIA?.producto && pesoLiteral) interpretacionIA.producto.pesoTextoOriginal = pesoLiteral;
  const convertirUnidades = normalizarVentaUnitaria(interpretacionIA, catalogoIA.catalogo, mensaje);
  if (convertirUnidades) mensajeParaValidar = `${interpretacionIA.producto.referencia} ${interpretacionIA.producto.presentacion} ${interpretacionIA.producto.especie || ""}`;

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
      interpretacion: interpretacionIA || decisionSemantica,
      clasificacion,
    });
  }
  if (validacionFinal.nivel === "alta") {
    registrarValidacionProducto(evento, validacionFinal);
    recordarConsultaProducto(estado, validacionFinal, clasificacion);
    // Persist the catalog identity that was actually shown to the customer,
    // not the incomplete description from before catalog validation.
    interpretacionIA = aplicarCoincidenciaValidada(interpretacionIA, validacionFinal);
    if (estado.ultimaConsultaProducto && interpretacionIA) {
      estado.ultimaConsultaProducto.solicitudOriginal = {
        intencion: interpretacionIA.intencion, accion: interpretacionIA.accion,
        producto: interpretacionIA.producto,
      };
    }
  }

  if (interpretacionIA && estado._interpretacionTurno) {
    estado._interpretacionTurno = { propuestaOperacion, carrito: interpretacionIA.carrito,
      intencion: interpretacionIA.intencion, accion: interpretacionIA.accion,
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
      const registro = { ...resultado.solicitud, accion: resultado.solicitud.accion || decisionSemantica.accion, estado: "pendiente" };
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
      if (!respuestaProducto) respuestas.push(`${titulo}: necesito verificar esta referencia.`);
      siguientePaso = respuestaProducto?.match(/Total: [^\n]+\n\n([\s\S]*)$/)?.[1] || siguientePaso;
      Object.assign(registro, {
        marca: lecturaValidada.producto?.marca,
        referencia: lecturaValidada.producto?.referencia,
        presentacion: lecturaValidada.producto?.presentacion,
        ...(lecturaValidada.producto?.duracion ? { duracion: lecturaValidada.producto.duracion } : {}),
        cantidad: lecturaValidada.producto?.cantidad || registro.cantidad,
        estado: lecturaValidada.producto?.requierePresentacion || !respuestaProducto ||
          (["agregar", "nuevo_pedido"].includes(lecturaValidada.accion) &&
            !estado.carrito.some(item => item.marca === lecturaValidada.producto?.marca &&
              item.referencia === lecturaValidada.producto?.referencia &&
              (!lecturaValidada.producto?.presentacion ||
                normalizarPeso(item.peso) === normalizarPeso(lecturaValidada.producto.presentacion))))
          ? "pendiente" : "identificado",
      });
      // El redactor debe recibir la presentación validada, no el peso corporal
      // ni la solicitud incompleta que dio origen a esta búsqueda.
      resultado.solicitud = { ...registro };
      if (registro.estado === "identificado") registro.pregunta = null;
      if (!lecturaValidada.producto?.requierePresentacion &&
          (lecturaValidada.accion === "consultar" || lecturaValidada.intencion === "consulta_producto")) {
        const coincidencia = resultado.validacion.coincidencia;
        registro.cotizacion = [];
        for (const presentacion of coincidencia.presentaciones || []) {
          if (resultado.validacion.presentacionSolicitada &&
            normalizarPeso(presentacion.peso) !== normalizarPeso(resultado.validacion.presentacionSolicitada)) continue;
          const cotizado = { marca: coincidencia.marca,
            ...(coincidencia.duracion ? { duracion: coincidencia.duracion } : {}),
            referencia: presentacion.referencia || coincidencia.referenciaCatalogo,
            referenciaCatalogo: presentacion.referencia || coincidencia.referenciaCatalogo,
            peso: presentacion.peso, precio: precioPorCantidad(presentacion, lecturaValidada.producto?.cantidad || 1),
            ...datosPrecio(presentacion), stock: presentacion.stock,
            cantidad: lecturaValidada.producto?.cantidad || 1, presentaciones: coincidencia.presentaciones };
          consultados.push(cotizado);
          registro.cotizacion.push(cotizado);
        }
      }
      if (lecturaValidada.producto) productosValidados.push(lecturaValidada.producto);
    }
    // El motor procesa cada solicitud; la cotizacion persistida conserva el conjunto.
    estado.productosConsultados = [...new Map(consultados.map(item =>
      [`${item.marca}:${item.referencia}:${item.peso || item.presentacion}`, item])).values()]
      .map((item, indice) => ({ ...item, indice: indice + 1 }));
    const anteriores = estado.ultimaSolicitudProductos?.some(item => item.estado === "pendiente")
      ? estado.ultimaSolicitudProductos : [];
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
    if (anteriores.length && anteriores.every(item => item.estado === "identificado")) {
      estado.ultimaConsultaProducto = null;
      estado.coincidenciasProductoPendientes = null;
      estado.referenciasPendientes = null;
      estado.productosPendientes = [];
    }
    interpretacionIA = { ...decisionSemantica, producto: null, productos: productosValidados };
    estado._interpretacionTurno = { propuestaOperacion, carrito: interpretacionIA.carrito,
      intencion: interpretacionIA.intencion, accion: interpretacionIA.accion,
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
      if (estado.ultimaConsultaProducto) estado.ultimaConsultaProducto.solicitudOriginal = {
        intencion: pendiente.accion === "consultar" ? "consulta_producto" : decisionSemantica.intencion, accion: pendiente.accion, producto: pendiente,
      };
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

  if (continuaCotizacion && estado.carrito.some(item =>
      normalizar(item.marca) === normalizar(seleccionActual.marca) &&
      normalizar(item.referencia) === normalizar(seleccionActual.referencia) &&
      normalizarPeso(item.peso) === normalizarPeso(decisionSemantica.producto?.presentacion || seleccionActual.peso || seleccionActual.presentacion))) {
    estado.productosConsultados = (estado.productosConsultados || []).filter(item =>
      !(normalizar(item.marca) === normalizar(seleccionActual.marca) &&
        normalizar(item.referencia) === normalizar(seleccionActual.referencia)));
    estado.coincidenciasProductoPendientes = null;
    estado.ultimaSeleccion = null;
    estado.ultimaConsultaProducto = null;
  }

  if (decisionSemantica._consultaContinuada && interpretacionIA?.accion === "agregar" &&
      validacionFinal.nivel === "alta" && estado.carrito.some(item =>
        normalizar(item.referencia) === normalizar(interpretacionIA.producto?.referencia) &&
        normalizarPeso(item.peso) === normalizarPeso(interpretacionIA.producto?.presentacion))) {
    estado.ultimaConsultaProducto = null;
    estado.coincidenciasProductoPendientes = null;
    estado.ultimaSeleccion = null;
  }

  let aclaroSolicitudMultiple = false;
  if (!resultadosMultiples.length && validacionFinal.nivel === "alta" && interpretacionIA?.producto) {
    const producto = interpretacionIA.producto;
    const mismaMarca = item => normalizar(normalizarMarcasCatalogo(item.marca || "", catalogo)) === normalizar(producto.marca);
    const pendientes = (estado.ultimaSolicitudProductos || []).filter(item => item.estado === "pendiente" && mismaMarca(item));
    if (pendientes.length === 1) {
      const solicitud = pendientes[0];
      const agregado = estado.carrito.some(item => item.marca === producto.marca && item.referencia === producto.referencia &&
        normalizarPeso(item.peso) === normalizarPeso(producto.presentacion || ""));
      const cotizados = (estado.productosConsultados || []).filter(item => item.marca === producto.marca &&
        item.referencia === producto.referencia && normalizarPeso(item.peso) === normalizarPeso(producto.presentacion || ""));
      if (agregado || (interpretacionIA.accion === "consultar" && cotizados.length)) {
        aclaroSolicitudMultiple = true;
        Object.assign(solicitud, producto, { estado: "identificado", pregunta: null,
          accion: interpretacionIA.accion, cotizacion: agregado ? [] : cotizados });
        if (estado.ultimaSolicitudProductos.every(item => item.estado === "identificado")) {
          estado.ultimaConsultaProducto = null;
          estado.coincidenciasProductoPendientes = null;
          estado.referenciasPendientes = null;
          estado.productosPendientes = [];
        }
      }
    }
  }
  const cotizacionConjunto = resultadosMultiples.length || aclaroSolicitudMultiple
    ? (estado.ultimaSolicitudProductos || []).flatMap(item => item.cotizacion || []) : [];
  if (interpretacionIA?.accion === "consultar" && cotizacionConjunto.length) {
    // Los candidatos de una aclaracion no reemplazan las cotizaciones confirmadas.
    estado.productosConsultados = cotizacionConjunto;
  }

  const cotizacionesValidadas = resultadosMultiples.length
    ? resultadosMultiples.filter(r => (r.solicitud.accion || decisionSemantica.accion) === 'consultar').map(r => r.validacion)
    : interpretacionIA?.accion === 'consultar' ? [validacionFinal] : [];
  for (const v of cotizacionesValidadas) {
    if (v?.nivel !== 'alta' || !v.coincidencia) continue;
    const c = v.coincidencia;
    registrarProductosConsultados(estado, [{ marca: c.marca, referencia: c.referenciaCatalogo || c.referencia,
      presentaciones: c.presentaciones.filter(p => !v.presentacionSolicitada ||
        normalizarPeso(p.peso) === normalizarPeso(v.presentacionSolicitada)) }]);
    const registrada = estado.historialProductosConsultados.find(p => p.marca === c.marca && p.referencia === (c.referenciaCatalogo || c.referencia));
    if (registrada && contexto.getStore()) registrada.pendienteRespuesta = true;
  }

  // Los descriptores pertenecen al SKU validado y al contexto reciente,
  // nunca se convierten en aliases globales compartidos por todo el catalogo.
  for (const item of [...(estado.productosConsultados || []), estado.ultimaSeleccion]) {
    if (!item?.referencia || item.pendiente) continue;
    const referencia = catalogo.find(m => m.marca === item.marca)?.referencias
      .find(r => r.nombre === item.referencia);
    if (referencia) Object.assign(item, { categoria: referencia.categoria,
      subcategoria: referencia.subcategoria, contextoCreadoEn: new Date().toISOString() });
  }

  const debeHumanizar = clasificacion.requiereOpenAI || !["saludo", "general"].includes(clasificacion.intencion);
  let humanizerUsage = { skipped: true, reason: "no_requerido" };
  const respuestaHumanizada = debeHumanizar
    ? await humanizarRespuesta(mensaje, respuestaBase, {
        ejemplosEntrenamiento,
        resumenCompacto: resultadosMultiples.length > 0 || aclaroSolicitudMultiple,
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
  if (interpretacionIA?.accion === "consultar" && cotizacionConjunto.length) {
    const lineas = cotizacionConjunto.map(item => `- ${item.cantidad || 1} x ${item.referencia} ${item.peso}: ${formatearPrecio(item.precio * (item.cantidad || 1))}`);
    const total = cotizacionConjunto.reduce((suma, item) => suma + item.precio * (item.cantidad || 1), 0);
    const pendientes = (estado.ultimaSolicitudProductos || []).filter(item => item.estado === 'pendiente');
    const aclaraciones = pendientes.map(item => item.pregunta ||
      `${item.textoVisible || item.referencia || 'Producto pendiente'}: falta confirmar; no está incluido en el total.`);
    respuesta = [`Cotización:\n${lineas.join("\n")}\nTotal cotizado: ${formatearPrecio(total)}`,
      ...aclaraciones].join('\n\n');
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
  _internals: { consultaSolicitudProducto, continuarSolicitudProducto, mencionProductoRespaldada, resolverReferenciaDescriptiva },
  responderEventoEntrante,
  responderEventosEntrantes,
};
