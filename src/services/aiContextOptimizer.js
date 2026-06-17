const DEFAULT_CHARS_PER_TOKEN = 4;

const TOKEN_BUDGETS = {
  interpreter: {
    simple: 900,
    producto: 2800,
    pedido: 4200,
    multimedia: 6000,
    complejo: 6000,
  },
  humanizer: {
    simple: 700,
    producto: 800,
    pedido: 1000,
    multimedia: 1100,
    complejo: 1200,
  },
};

const OUTPUT_SCHEMA = {
  intencion:
    "pedido_producto|consulta_producto|consulta_marcas|recomendacion|datos_envio|metodo_pago|confirmacion|rechazo|agradecimiento|carrito|otro",
  accion:
    "agregar|consultar|nuevo_pedido|repetir_pedido|confirmar|rechazar|quitar|mantener_solo|modificar_cantidad|null",
  confianza: 0,
  producto: {
    marca: null,
    referencia: null,
    linea: null,
    textoVisible: null,
    categoria: null,
    subcategoria: null,
    especie: null,
    etapa: null,
    tamano: null,
    sabores: [],
    condiciones: [],
    presentacion: null,
    cantidad: null,
  },
  productos: [],
  entrega: {
    tipo: null,
    direccion: null,
    direccionCompleta: null,
    sector: null,
    metodoPago: null,
    sede: null,
  },
  datosCliente: { nombre: null, cedula: null, correo: null, celular: null },
  carrito: { operacion: null, cantidadObjetivo: null, aplicaAlUltimoProducto: null, razon: null },
  faltanteSugerido: null,
};

function serializar(valor) {
  return JSON.stringify(valor ?? null);
}

function chars(valor) {
  return typeof valor === "string" ? valor.length : serializar(valor).length;
}

function charsPorToken() {
  const valor = Number(process.env.AI_CONTEXT_CHARS_PER_TOKEN || DEFAULT_CHARS_PER_TOKEN);
  return Number.isFinite(valor) && valor > 0 ? valor : DEFAULT_CHARS_PER_TOKEN;
}

function estimarTokens(valor) {
  return Math.ceil(chars(valor) / charsPorToken());
}

function presupuestoTokens(etapa, perfil) {
  const clave = `AI_CONTEXT_BUDGET_${etapa.toUpperCase()}_${perfil.toUpperCase()}`;
  const configurado = Number(process.env[clave]);
  if (Number.isFinite(configurado) && configurado > 0) return configurado;
  return TOKEN_BUDGETS[etapa]?.[perfil] || TOKEN_BUDGETS[etapa]?.complejo || 6000;
}

function recortarTexto(texto, maximo) {
  const valor = (texto || "").toString().trim();
  return valor.length <= maximo ? valor : `${valor.slice(0, Math.max(0, maximo - 3))}...`;
}

function compactarPresentacion(presentacion = {}) {
  return {
    peso: presentacion.peso || null,
    precio: presentacion.precio ?? null,
  };
}

function compactarCatalogo(catalogo = [], { incluirDescripcion = true } = {}) {
  return catalogo.map((marca) => ({
    marca: marca.marca,
    productos: (marca.referencias || []).map((referencia) => ({
      nombre: referencia.nombre,
      categoria: referencia.categoria || null,
      subcategoria: referencia.subcategoria || null,
      especie: referencia.especie || null,
      etapa: referencia.etapa || null,
      descripcion:
        incluirDescripcion && referencia.descripcion
          ? recortarTexto(referencia.descripcion, Number(process.env.AI_PRODUCT_DESCRIPTION_MAX_CHARS || 120))
          : undefined,
      presentaciones: (referencia.presentaciones || []).map(compactarPresentacion),
    })),
  }));
}

function compactarItem(item = {}) {
  return {
    marca: item.marca || null,
    referencia: item.referencia || item.nombre || null,
    presentacion: item.presentacion || item.peso || null,
    cantidad: item.cantidad || 1,
    precio: item.precio ?? null,
  };
}

function compactarCotizacion(item = {}) {
  return {
    indice: item.indice || null,
    marca: item.marca || null,
    referencia: item.referencia || null,
    presentaciones: (item.presentaciones || []).slice(0, 4).map(
      (presentacion) => ({
        peso: presentacion.peso || null,
        precio: presentacion.precio ?? null,
      })
    ),
  };
}

function hayPedidoActivo(estado = {}) {
  return Boolean(
    (estado.carrito?.length && !estado.pedidoConfirmado) ||
      estado.ultimaSeleccion ||
      estado.referenciasPendientes ||
      estado.coincidenciasProductoPendientes ||
      estado.productosConsultados?.length ||
      estado.esperandoDatosDomicilio ||
      estado.esperandoMetodoPago ||
      estado.esperandoConfirmacionPedido ||
      estado.esperandoConfirmacionDatosPrevios
  );
}

function compactarEstado(estado = {}, perfil = "simple") {
  if (perfil === "simple") return {};

  const activo = {
    marca: estado.marca || null,
    criterios: estado.criterios || {},
    ultimaSeleccion: estado.ultimaSeleccion || null,
    referenciasPendientes: estado.referenciasPendientes
      ? {
          marca: estado.referenciasPendientes.marca,
          referencias: (estado.referenciasPendientes.referencias || []).slice(0, 6),
        }
      : null,
    coincidenciasProductoPendientes: estado.coincidenciasProductoPendientes
      ? {
          opciones: (estado.coincidenciasProductoPendientes.opciones || [])
            .slice(0, 5)
            .map((opcion) => ({
              indice: opcion.indice,
              marca: opcion.marca,
              referencia: opcion.referencia,
            })),
        }
      : null,
    productosConsultados: (estado.productosConsultados || []).slice(-6).map(compactarItem),
    historialProductosConsultados: (
      estado.historialProductosConsultados || []
    )
      .slice(-10)
      .map(compactarCotizacion),
    ultimaInteraccionProducto: estado.ultimaInteraccionProducto
      ? {
          intencionOriginal: recortarTexto(
            estado.ultimaInteraccionProducto.intencionOriginal,
            160
          ),
          tipoIntencion: estado.ultimaInteraccionProducto.tipoIntencion || null,
          creadoEn: estado.ultimaInteraccionProducto.creadoEn || null,
        }
      : null,
    ultimaConsultaProducto: estado.ultimaConsultaProducto
      ? {
          terminos: (estado.ultimaConsultaProducto.terminos || []).slice(0, 8),
          fuente: estado.ultimaConsultaProducto.fuente || null,
          creadoEn: estado.ultimaConsultaProducto.creadoEn || null,
        }
      : null,
    carrito: estado.pedidoConfirmado ? [] : (estado.carrito || []).map(compactarItem),
    entrega: estado.entrega || {},
    metodoPago: estado.metodoPago || null,
    esperando: Object.fromEntries(
      Object.entries({
        datosDomicilio: estado.esperandoDatosDomicilio,
        metodoPago: estado.esperandoMetodoPago,
        tipoEntrega: estado.esperandoTipoEntrega,
        sedeRecogida: estado.esperandoSedeRecogida,
        confirmacionPedido: estado.esperandoConfirmacionPedido,
        repetirPedido: estado.esperandoConfirmacionRepetirPedido,
        datosPrevios: estado.esperandoConfirmacionDatosPrevios,
        cambioDireccion: estado.esperandoCambioDireccion,
      }).filter(([, valor]) => Boolean(valor))
    ),
  };

  if (perfil === "producto" && !hayPedidoActivo(estado)) {
    return estado.ultimaConsultaProducto
      ? { ultimaConsultaProducto: activo.ultimaConsultaProducto }
      : {};
  }
  if (perfil === "producto") return activo;

  return {
    ...activo,
    datosCliente: estado.datosDomicilio || {},
    ultimoPedido: estado.ultimoPedidoConfirmado
      ? {
          carrito: (estado.ultimoPedidoConfirmado.carrito || []).map(compactarItem),
          entrega: estado.ultimoPedidoConfirmado.entrega || {},
          metodoPago: estado.ultimoPedidoConfirmado.metodoPago || null,
        }
      : null,
  };
}

function omitirFocoProductoAnterior(memoria = {}) {
  return {
    ...memoria,
    marca: null,
    criterios: {},
    ultimaSeleccion: null,
    referenciasPendientes: null,
    coincidenciasProductoPendientes: null,
    productosConsultados: [],
    historialProductosConsultados: [],
    ultimaInteraccionProducto: null,
  };
}

function compactarHistorial(historial = [], limite = 0) {
  if (!limite) return [];
  return historial.slice(-limite).map((item) => ({
    rol: item.direction === "outbound" ? "asistente" : "cliente",
    texto: recortarTexto(item.body, 500),
  }));
}

function compactarEjemplos(ejemplos = [], limite = 0) {
  if (!limite) return [];
  return ejemplos.slice(0, limite).map((item) => ({
    caso: recortarTexto(item.customer_message, 240),
    criterio: recortarTexto(item.ideal_response || item.notes, 320),
  }));
}

function instruccionesPerfil(perfil) {
  const comunes = [
    "Devuelve solo JSON valido con el esquema solicitado.",
    "El catalogo candidato y el backend son la fuente de verdad; no inventes productos ni presentaciones.",
    "Interpreta espanol colombiano, errores de escritura y abreviaturas.",
    "En WhatsApp colombiano, vocativos, tono carinoso, disculpas, cierres y agradecimientos no son datos de producto.",
    "Si el cliente menciona un producto solo para decir que no lo quiere, no le sirvio, no seguira con la compra o solo agradece/cierra, usa intencion rechazo o agradecimiento y deja producto sin datos.",
    "Consultar precio o disponibilidad usa accion consultar; no agrega al carrito.",
    "Devuelve solo datos nuevos del mensaje. Usa null cuando no haya evidencia.",
  ];

  const perfiles = {
    simple: ["Clasifica el mensaje sin reconstruir conversaciones anteriores."],
    producto: [
      "Mapea marca, referencia, especie, etapa, tamano y presentacion contra los candidatos.",
      "Usa productosConsultados para ese o el de cierto peso, e historialProductosConsultados para primero, segundo u otra cotizacion anterior.",
      "Un nombre, audio o imagen nuevos cambian el producto activo; no arrastres la referencia anterior.",
      "Si el cliente dice no es, era, quise decir o me refiero a, descarta la referencia propuesta y usa el texto nuevo como correccion; nunca incluyas esas palabras en el nombre del producto.",
      "ultimaConsultaProducto conserva señales crudas del intento anterior. Usala solo para completar una correccion corta; si la correccion trae nombre suficiente, el texto nuevo reemplaza lo anterior.",
      "RP/raza pequena/mini/small indican tamano pequeno; RG/RMG/mediano/grande indican tamano grande. CACH/puppy es cachorro y MAYORES/senior es senior.",
      "Entiende canine/perro, feline/gato, puppy/cachorro, adult/adulto y small/pequeno.",
      "Condiciones como castrado, urinary, renal, gastro, piel y siglas como OM/UR/NF son parte fuerte de la referencia.",
      "Consultas por antipulgas, desparasitante, arena, snack, juguete o accesorio cambian la categoria activa.",
      "Una raza describe la mascota, no una marca. Corrige marcas aproximadas solo si un candidato lo respalda.",
      "No reemplaces una marca o referencia solicitada por otra parecida. Los candidatos son opciones de busqueda, no prueba de existencia.",
      "Si hay varias opciones plausibles deja referencia null y conserva criterios.",
      "Las presentaciones pedidas deben conservarse exactamente aunque no existan.",
    ],
    pedido: [
      "Prioriza estado.esperando y el carrito activo.",
      "Una aclaracion breve completa el dato pendiente; no inicia otra conversacion.",
      "No reemplaces datos confirmados con metodo de pago, confirmaciones o numeros ambiguos.",
      "Un pedido anterior es memoria historica. Un producto nuevo crea carrito nuevo y solo reutiliza entrega.",
      "Correcciones del carrito usan quitar, mantener_solo o modificar_cantidad.",
    ],
    multimedia: [
      "En audio corrige errores foneticos usando los candidatos, sin forzar marcas.",
      "En imagen transcribe en textoVisible las palabras comerciales legibles del empaque y separa en linea la variante distintiva, por ejemplo Urinary, Sterilised, Indoor o Gastrointestinal.",
      "En imagen lee marca, linea, especie, etapa, tamano, peso y siglas visibles; identifica tambien el sabor. No omitas una linea porque tambien aparezcan especie o etapa.",
      "Si revisionVision esta activa, vuelve a inspeccionar el empaque usando la familia de candidatos refinada y confirma especialmente la linea, especialidad y presentacion.",
      "Si marca y linea distintiva son legibles y encajan con especie, etapa, tamano o peso, devuelve la referencia exacta del candidato con confianza alta; no devuelvas solo la marca.",
      "El empaque puede traer submarcas o claims comerciales que no estan literales en la base; conserva las senales utiles y no descartes equivalencias por palabras extra.",
      "No incluyas referencias que contradigan texto visible del empaque como cachorro, adulto, senior, razas pequenas, razas grandes o todas las razas.",
      "Una receta o formula se interpreta como cotizacion de productos separados, sin diagnosticar ni indicar dosis.",
      "No inventes texto ilegible. Usa null y pide el dato faltante.",
    ],
    complejo: [
      "Consolida todos los mensajes del lote en una sola interpretacion.",
      "Separa productos y cantidades; no mezcles presentaciones entre items.",
      "Prioriza estado pendiente, cambios de carrito, entrega y confirmaciones sobre referencias historicas.",
      "No diagnostiques ni recomiendes dosis para medicamentos.",
    ],
  };

  if (perfil === "complejo") {
    return [...comunes, ...perfiles.producto, ...perfiles.pedido, ...perfiles.complejo];
  }
  if (perfil === "multimedia") {
    return [...comunes, ...perfiles.producto, ...perfiles.pedido, ...perfiles.multimedia];
  }

  return [...comunes, ...(perfiles[perfil] || perfiles.complejo)];
}

function construirPromptInterprete({ perfil = "complejo", cliente = null, vertical = null } = {}) {
  const promptCliente =
    cliente?.prompts?.interpreter || cliente?.prompts?.interprete || "";
  const promptVertical = vertical?.prompts?.interpreterContext || "";
  const rolVertical =
    vertical?.prompts?.interpreterRole ||
    "Eres el interprete semantico de un agente comercial de WhatsApp multiempresa.";
  const reglasAdicionales = [promptVertical, promptCliente]
    .filter(Boolean)
    .map((item) => recortarTexto(item, 800))
    .join("\n");

  return [
    rolVertical,
    `Perfil de contexto: ${perfil}.`,
    instruccionesPerfil(perfil).map((regla) => `- ${regla}`).join("\n"),
    reglasAdicionales ? `Reglas adicionales:\n${reglasAdicionales}` : "",
    `Esquema JSON: ${serializar(OUTPUT_SCHEMA)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function totalReferencias(catalogo = []) {
  return catalogo.reduce((total, marca) => total + (marca.productos || []).length, 0);
}

function reducirCatalogo(catalogo = []) {
  const plano = catalogo.flatMap((marca) =>
    (marca.productos || []).map((producto) => ({ marca: marca.marca, producto }))
  );
  plano.pop();
  const grupos = new Map();
  plano.forEach(({ marca, producto }) => {
    if (!grupos.has(marca)) grupos.set(marca, { marca, productos: [] });
    grupos.get(marca).productos.push(producto);
  });
  return Array.from(grupos.values());
}

function diagnosticoBloques({
  etapa,
  perfil,
  model,
  presupuesto,
  bloques,
  totalCharsReal = null,
  reducciones = [],
}) {
  const medidas = Object.fromEntries(
    Object.entries(bloques).map(([clave, valor]) => [`${clave}Chars`, chars(valor)])
  );
  const totalChars =
    totalCharsReal ?? Object.values(medidas).reduce((total, valor) => total + valor, 0);

  return {
    etapa,
    perfil,
    modeloUsado: model,
    presupuestoTokens: presupuesto,
    ...medidas,
    totalChars,
    tokensEstimados: Math.ceil(totalChars / charsPorToken()),
    reducciones,
  };
}

function logDiagnosticoContexto(diagnostico, logger = console) {
  if (process.env.AI_CONTEXT_LOGS === "false") return;
  const campos = Object.entries(diagnostico)
    .map(([clave, valor]) => `${clave}=${Array.isArray(valor) ? valor.join(",") || "ninguna" : valor}`)
    .join(" | ");
  logger.log(`[AI Context] ${campos}`);
}

function construirSolicitudInterprete({
  mensaje,
  estado = {},
  catalogo = [],
  historialReciente = [],
  ejemplosEntrenamiento = [],
  clasificacion = {},
  cliente = null,
  vertical = null,
  model,
}) {
  const perfil = clasificacion.perfilContexto || "complejo";
  const presupuesto = presupuestoTokens("interpreter", perfil);
  const promptBase = construirPromptInterprete({ perfil, cliente, vertical });
  let productos = compactarCatalogo(catalogo);
  let historial = compactarHistorial(historialReciente, clasificacion.limiteHistorial || 0);
  let ejemplos = compactarEjemplos(ejemplosEntrenamiento, clasificacion.limiteEjemplos || 0);
  let memoria = compactarEstado(estado, perfil);
  if (clasificacion.requiereVision) {
    memoria = omitirFocoProductoAnterior(memoria);
  }
  const reducciones = [];
  const historialProductoProtegido = Boolean(
    clasificacion.fallbackHistorialProductoActivo
  );

  function contenido() {
    return {
      mensaje,
      intencionDetectada: clasificacion.intencion || null,
      cliente: cliente
        ? { nombre: cliente.name || null, vertical: cliente.vertical || null }
        : null,
      contextoActivo: memoria,
      historial,
      ejemplos,
      productosCandidatos: productos,
      revisionVision: clasificacion.revisionVision
        ? "Segunda lectura focalizada: revisa otra vez marca, linea o especialidad, especie y presentacion contra estos candidatos."
        : null,
    };
  }

  function tokensActuales() {
    return estimarTokens(promptBase) + estimarTokens(contenido());
  }

  while (tokensActuales() > presupuesto && ejemplos.length) {
    ejemplos.pop();
    if (!reducciones.includes("ejemplos")) reducciones.push("ejemplos");
  }
  while (
    tokensActuales() > presupuesto &&
    historial.length &&
    !historialProductoProtegido
  ) {
    historial.shift();
    if (!reducciones.includes("historial")) reducciones.push("historial");
  }
  if (tokensActuales() > presupuesto) {
    productos = compactarCatalogo(catalogo, { incluirDescripcion: false });
    reducciones.push("descripciones_productos");
  }
  const minimoReferencias = historialProductoProtegido ? 2 : 4;
  while (
    tokensActuales() > presupuesto &&
    totalReferencias(productos) > minimoReferencias
  ) {
    productos = reducirCatalogo(productos);
    if (!reducciones.includes("candidatos")) reducciones.push("candidatos");
  }
  if (tokensActuales() > presupuesto && perfil === "producto") {
    memoria = compactarEstado({}, perfil);
    reducciones.push("memoria_no_activa");
  }

  const contexto = contenido();
  const diagnostico = diagnosticoBloques({
    etapa: "interprete",
    perfil,
    model,
    presupuesto,
    bloques: {
      promptBase,
      reglas: instruccionesPerfil(perfil),
      memoriaCliente: memoria,
      historial,
      resumen: { intencion: clasificacion.intencion, ejemplos },
      productos,
      mensajeActual: mensaje,
    },
    totalCharsReal: chars(promptBase) + chars(contexto),
    reducciones,
  });

  return { perfil, promptBase, contexto, diagnostico };
}

function construirPromptHumanizador({ cliente = null, vertical = null } = {}) {
  const adicionales = [
    vertical?.prompts?.humanizerContext,
    cliente?.prompts?.humanizer || cliente?.prompts?.humanizador,
  ]
    .filter(Boolean)
    .map((item) => recortarTexto(item, 500))
    .join("\n");

  return [
    "Redacta una respuesta breve y natural de WhatsApp en espanol colombiano.",
    "El backend ya valido los hechos. No cambies productos, acciones, precios, pesos, cantidades ni preguntas.",
    "Conserva exactamente lineas que empiecen por '- ', 'Precio:' o 'Total:'.",
    "Evita sonar como plantilla: puedes variar apertura y cierre, manteniendo una sola pregunta clara.",
    "No confirmes pedidos antes de la confirmacion explicita. No inventes cobertura, horarios, recargos, dosis ni tratamientos.",
    "Haz como maximo una pregunta y usa maximo un emoji. Devuelve solo la respuesta final.",
    adicionales,
  ]
    .filter(Boolean)
    .join("\n");
}

function construirSolicitudHumanizador({
  mensaje,
  respuestaBase,
  interpretacion = null,
  clasificacion = {},
  estado = {},
  cliente = null,
  vertical = null,
  model,
}) {
  const perfil = clasificacion.perfilContexto || "complejo";
  const presupuesto = presupuestoTokens("humanizer", perfil);
  const promptBase = construirPromptHumanizador({ cliente, vertical });
  const reducciones = [];
  const contexto = {
    intencion: interpretacion?.intencion || clasificacion.intencion || null,
    accion: interpretacion?.accion || null,
    producto: interpretacion?.producto || null,
    contextoActivo: compactarEstado(estado, perfil),
    mensaje: recortarTexto(mensaje, 800),
    respuestaBase,
  };
  if (estimarTokens(promptBase) + estimarTokens(contexto) > presupuesto) {
    contexto.contextoActivo = {};
    reducciones.push("memoria");
  }
  if (estimarTokens(promptBase) + estimarTokens(contexto) > presupuesto) {
    contexto.mensaje = recortarTexto(contexto.mensaje, 240);
    reducciones.push("mensaje");
  }
  const diagnostico = diagnosticoBloques({
    etapa: "humanizador",
    perfil,
    model,
    presupuesto,
    bloques: {
      promptBase,
      reglas: "",
      memoriaCliente: contexto.contextoActivo,
      historial: [],
      resumen: {
        intencion: contexto.intencion,
        accion: contexto.accion,
        producto: contexto.producto,
      },
      productos: contexto.producto || {},
      mensajeActual: contexto.mensaje,
      respuestaBase,
    },
    totalCharsReal: chars(promptBase) + chars(contexto),
    reducciones,
  });

  return {
    perfil,
    promptBase,
    contexto,
    diagnostico,
    excedePresupuesto: diagnostico.tokensEstimados > presupuesto,
  };
}

module.exports = {
  construirPromptHumanizador,
  construirPromptInterprete,
  construirSolicitudHumanizador,
  construirSolicitudInterprete,
  estimarTokens,
  logDiagnosticoContexto,
  presupuestoTokens,
  _internals: {
    compactarCatalogo,
    compactarEstado,
    instruccionesPerfil,
  },
};
