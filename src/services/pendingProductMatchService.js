const { formatearPrecio, normalizar, normalizarPeso } = require("../utils/text");
const { _internals } = require("./productMatchValidator");

const DEFAULT_TTL_MS = 20 * 60 * 1000;
const DEFAULT_MAX_TURNS = 3;
const DEFAULT_QUOTE_HISTORY_LIMIT = 20;
const MIN_SELECTION_SCORE = 0.72;
const MIN_SELECTION_MARGIN = 0.12;
const MIN_CONTEXT_SCORE = 0.42;

function numeroEnv(nombre, defecto) {
  const valor = Number(process.env[nombre]);
  return Number.isFinite(valor) ? valor : defecto;
}

function normalizarSeleccion(texto = "") {
  return normalizar(texto)
    .replace(/\bgatos?\b/g, "cat")
    .replace(/\bperros?\b/g, "dog")
    .replace(/\bopci[oó]n\b/g, "opcion")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensSeleccion(texto = "") {
  return normalizarSeleccion(texto)
    .split(/\s+/)
    .filter(Boolean)
    .filter(
      (token) =>
        ![
          "el",
          "la",
          "los",
          "las",
          "de",
          "del",
          "por",
          "favor",
          "quiero",
          "esa",
          "ese",
          "esta",
          "este",
          "referencia",
          "producto",
        ].includes(token)
    );
}

function opcionesValidas(validacion = {}) {
  return (validacion.alternativas || [])
    .filter((item) => item.marca && item.referencia)
    .map((item, index) => ({
      indice: index + 1,
      marca: item.marca,
      referencia: item.referencia,
      referenciaCatalogo: item.referenciaCatalogo || item.referencia,
      referenciasEquivalentes:
        item.referenciasEquivalentes || [item.referencia],
      presentaciones: (item.presentaciones || []).map((presentacion) => ({
        peso: presentacion.peso,
        precio: presentacion.precio,
        stock: typeof presentacion.stock === "boolean" ? presentacion.stock : null,
        referencia:
          presentacion.referencia ||
          item.referenciaCatalogo ||
          item.referencia,
      })),
    }));
}

function crearContextoId(ahora, turno) {
  return `${ahora}-${turno}`;
}

function claveProductoConsultado(item = {}) {
  return `${normalizar(item.marca)}::${normalizar(
    item.familiaReferencia || item.referencia
  )}`;
}

function registrarProductosConsultados(estado, productos = []) {
  const validos = productos.filter(
    (item) => item?.marca && (item.familiaReferencia || item.referencia)
  );
  if (!validos.length) return;

  const grupos = new Map();
  validos.forEach((item) => {
    const clave = claveProductoConsultado(item);
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        marca: item.marca,
        referencia: item.familiaReferencia || item.referencia,
        referenciasEquivalentes:
          item.referenciasEquivalentes || [item.referencia],
        presentaciones: [],
      });
    }
    const grupo = grupos.get(clave);
    const presentacionesItem =
      Array.isArray(item.presentaciones) && item.presentaciones.length
        ? item.presentaciones
        : [
            {
              peso: item.peso || item.presentacion || null,
              precio: item.precio ?? null,
              stock: typeof item.stock === "boolean" ? item.stock : null,
              referenciaCatalogo: item.referenciaCatalogo || item.referencia,
            },
          ];

    presentacionesItem.forEach((presentacionItem) => {
      const peso = presentacionItem.peso || presentacionItem.presentacion || null;
      const precio = presentacionItem.precio ?? null;
      const clavePresentacion = `${normalizarPeso(peso || "")}::${precio ?? ""}`;
      if (
        !grupo.presentaciones.some(
          (presentacion) => presentacion.clave === clavePresentacion
        )
      ) {
        grupo.presentaciones.push({
          clave: clavePresentacion,
          peso,
          precio,
          stock:
            typeof presentacionItem.stock === "boolean"
              ? presentacionItem.stock
              : null,
          referenciaCatalogo:
            presentacionItem.referenciaCatalogo ||
            item.referenciaCatalogo ||
            item.referencia,
        });
      }
    });
  });

  const historial = Array.isArray(estado.historialProductosConsultados)
    ? [...estado.historialProductosConsultados]
    : [];
  grupos.forEach((grupo, clave) => {
    const existente = historial.find(
      (item) => claveProductoConsultado(item) === clave
    );
    const presentaciones = grupo.presentaciones.map(
      ({ clave: _clave, ...presentacion }) => presentacion
    );
    if (existente) {
      existente.presentaciones = existente.presentaciones || [];
      const vistas = new Set(
        existente.presentaciones.map(
          (presentacion) =>
            `${normalizarPeso(presentacion.peso || "")}::${
              presentacion.precio ?? ""
            }`
        )
      );
      presentaciones.forEach((presentacion) => {
        const clavePresentacion = `${normalizarPeso(
          presentacion.peso || ""
        )}::${presentacion.precio ?? ""}`;
        if (!vistas.has(clavePresentacion)) {
          existente.presentaciones.push(presentacion);
          vistas.add(clavePresentacion);
        }
      });
      existente.actualizadoEn = new Date().toISOString();
      return;
    }

    const ahora = new Date().toISOString();
    historial.push({
      indice: historial.length + 1,
      marca: grupo.marca,
      referencia: grupo.referencia,
      referenciasEquivalentes: grupo.referenciasEquivalentes,
      presentaciones,
      creadoEn: ahora,
      actualizadoEn: ahora,
    });
  });

  const limite = Math.max(
    10,
    numeroEnv(
      "PRODUCT_QUOTE_HISTORY_LIMIT",
      DEFAULT_QUOTE_HISTORY_LIMIT
    )
  );
  estado.historialProductosConsultados = historial
    .slice(-limite)
    .map((item, index) => ({ ...item, indice: index + 1 }));
}

function establecerProductosConsultados(estado, productos = []) {
  estado.productosConsultados = productos;
  registrarProductosConsultados(estado, productos);
}

function reiniciarFocoProducto(estado) {
  estado.marca = null;
  estado.criterios = {};
  estado.ultimaSeleccion = null;
  estado.referenciasPendientes = null;
  estado.coincidenciasProductoPendientes = null;
  estado.productosConsultados = [];
  estado.ultimaInteraccionProducto = null;
  estado.alternativaPendiente = null;
  estado.esperandoMarca = false;
  estado.esperandoPresupuesto = false;
  estado.pendienteRecomendacion = false;
}

function productosConsultadosDesdeOpciones(opciones, contextoProductoId) {
  return opciones.flatMap((opcion) => {
    const presentaciones = opcion.presentaciones.length
      ? opcion.presentaciones
      : [{ peso: null, precio: null, stock: null }];
    return presentaciones.map((presentacion) => ({
      contextoProductoId,
      indice: opcion.indice,
      marca: opcion.marca,
      referencia: opcion.referencia,
      familiaReferencia: opcion.referencia,
      referenciasEquivalentes: opcion.referenciasEquivalentes,
      referenciaCatalogo:
        presentacion.referencia ||
        opcion.referenciaCatalogo ||
        opcion.referencia,
      peso: presentacion.peso,
      precio: presentacion.precio,
      stock: presentacion.stock,
      cantidad: 1,
    }));
  });
}

function guardarCoincidenciasProductoPendientes(
  estado,
  validacion,
  contextoOriginal = {}
) {
  if (validacion?.nivel !== "media") {
    estado.coincidenciasProductoPendientes = null;
    return;
  }

  const opciones = opcionesValidas(validacion);
  if (!opciones.length) {
    estado.coincidenciasProductoPendientes = null;
    return;
  }

  const ahora = Date.now();
  const turnoCreacion = Number(estado.ultimoTurnoContextoProducto || 0) + 1;
  const contextoProductoId = crearContextoId(ahora, turnoCreacion);
  const creadoEn = new Date(ahora).toISOString();
  const expiraEn = new Date(
    ahora + numeroEnv("CATALOG_PENDING_MATCH_TTL_MS", DEFAULT_TTL_MS)
  ).toISOString();
  const marcas = [...new Set(opciones.map((opcion) => opcion.marca))];
  const contexto = {
    contextoProductoId,
    consulta: validacion.etiqueta || (validacion.terminos || []).join(" "),
    intencionOriginal:
      contextoOriginal.intencionOriginal ||
      validacion.etiqueta ||
      (validacion.terminos || []).join(" "),
    tipoIntencion: contextoOriginal.tipoIntencion || "consulta_producto",
    opciones,
    creadoEn,
    expiraEn,
    turnoCreacion,
    turnosRestantes: numeroEnv(
      "CATALOG_PENDING_MATCH_MAX_TURNS",
      DEFAULT_MAX_TURNS
    ),
  };
  estado.coincidenciasProductoPendientes = contexto;
  estado.referenciasPendientes = {
    contextoProductoId,
    marca: marcas.length === 1 ? marcas[0] : null,
    referencias: opciones.map((opcion) => opcion.referencia),
    opciones,
    texto: contexto.intencionOriginal,
    criterios: {},
    cantidad: 1,
    intencionOriginal: contexto.intencionOriginal,
    tipoIntencion: contexto.tipoIntencion,
    creadoEn,
    expiraEn,
    turnoCreacion,
  };
  estado.ultimaSeleccion = {
    contextoProductoId,
    pendiente: true,
    marca: marcas.length === 1 ? marcas[0] : null,
    referencia: null,
    presentacion: null,
    cantidad: 1,
    opciones: opciones.map((opcion) => ({
      indice: opcion.indice,
      marca: opcion.marca,
      referencia: opcion.referencia,
      referenciaCatalogo: opcion.referenciaCatalogo,
      referenciasEquivalentes: opcion.referenciasEquivalentes,
    })),
    intencionOriginal: contexto.intencionOriginal,
    tipoIntencion: contexto.tipoIntencion,
    creadoEn,
    turnoCreacion,
  };
  estado.productosConsultados = productosConsultadosDesdeOpciones(
    opciones,
    contextoProductoId
  );
  estado.ultimaInteraccionProducto = {
    contextoProductoId,
    intencionOriginal: contexto.intencionOriginal,
    tipoIntencion: contexto.tipoIntencion,
    creadoEn,
    turnoCreacion,
  };
  estado.ultimoTurnoContextoProducto = turnoCreacion;
}

function opcionesDesdeProductosConsultados(productos = []) {
  const grupos = new Map();
  productos.forEach((item) => {
    if (!item.marca || !item.referencia) return;
    const familia = item.familiaReferencia || item.referencia;
    const clave = `${normalizar(item.marca)}::${normalizar(familia)}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        indice: item.indice || grupos.size + 1,
        marca: item.marca,
        referencia: familia,
        referenciaCatalogo: item.referenciaCatalogo || item.referencia,
        referenciasEquivalentes:
          item.referenciasEquivalentes || [item.referencia],
        presentaciones: [],
      });
    }
    const presentacionesItem =
      Array.isArray(item.presentaciones) && item.presentaciones.length
        ? item.presentaciones
        : [
            {
              peso: item.peso || item.presentacion || null,
              precio: item.precio ?? null,
              stock: typeof item.stock === "boolean" ? item.stock : null,
              referencia: item.referenciaCatalogo || item.referencia,
            },
          ];
    presentacionesItem
      .filter((presentacion) => presentacion.peso || presentacion.precio != null)
      .forEach((presentacion) => {
        const grupo = grupos.get(clave);
        const peso = presentacion.peso || presentacion.presentacion || null;
        const clavePresentacion = `${normalizarPeso(peso || "")}::${
          presentacion.precio ?? ""
        }`;
        if (
          grupo.presentaciones.some(
            (itemPresentacion) =>
              `${normalizarPeso(itemPresentacion.peso || "")}::${
                itemPresentacion.precio ?? ""
              }` === clavePresentacion
          )
        ) {
          return;
        }
        grupo.presentaciones.push({
          peso,
          precio: presentacion.precio ?? null,
          stock: typeof presentacion.stock === "boolean" ? presentacion.stock : null,
          referencia:
            presentacion.referencia ||
            presentacion.referenciaCatalogo ||
            item.referenciaCatalogo ||
            item.referencia,
        });
      });
  });
  return [...grupos.values()];
}

function contextoDesdeEstado(estado) {
  if (estado.coincidenciasProductoPendientes?.opciones?.length) {
    return {
      ...estado.coincidenciasProductoPendientes,
      fuente: "coincidenciasProductoPendientes",
    };
  }
  if (estado.referenciasPendientes?.opciones?.length) {
    return {
      ...estado.referenciasPendientes,
      fuente: "referenciasPendientes",
      opciones: estado.referenciasPendientes.opciones,
      turnosRestantes:
        estado.referenciasPendientes.turnosRestantes ||
        numeroEnv("CATALOG_PENDING_MATCH_MAX_TURNS", DEFAULT_MAX_TURNS),
    };
  }
  if (estado.ultimaSeleccion?.pendiente && estado.ultimaSeleccion.opciones?.length) {
    return {
      ...estado.ultimaSeleccion,
      fuente: "ultimaSeleccionPendiente",
      opciones: estado.ultimaSeleccion.opciones.map((opcion) => ({
        ...opcion,
        presentaciones: opcionesDesdeProductosConsultados(
          estado.productosConsultados
        ).find(
          (item) =>
            normalizar(item.marca) === normalizar(opcion.marca) &&
            normalizar(item.referencia) === normalizar(opcion.referencia)
        )?.presentaciones || [],
      })),
      turnosRestantes: numeroEnv(
        "CATALOG_PENDING_MATCH_MAX_TURNS",
        DEFAULT_MAX_TURNS
      ),
    };
  }
  if (estado.ultimaSeleccion?.marca && estado.ultimaSeleccion?.referencia) {
    return {
      fuente: "ultimaSeleccion",
      contextoProductoId: estado.ultimaSeleccion.contextoProductoId || null,
      opciones: [
        {
          indice: 1,
          marca: estado.ultimaSeleccion.marca,
          referencia: estado.ultimaSeleccion.referencia,
          presentaciones: opcionesDesdeProductosConsultados(
            estado.productosConsultados
          )[0]?.presentaciones || [],
        },
      ],
      creadoEn:
        estado.ultimaSeleccion.creadoEn ||
        estado.ultimaInteraccionProducto?.creadoEn ||
        null,
      turnosRestantes: numeroEnv(
        "CATALOG_PENDING_MATCH_MAX_TURNS",
        DEFAULT_MAX_TURNS
      ),
    };
  }
  const opcionesConsultadas = opcionesDesdeProductosConsultados(
    estado.productosConsultados
  );
  if (!opcionesConsultadas.length) return null;
  return {
    fuente: "productosConsultados",
    contextoProductoId:
      estado.productosConsultados.find((item) => item.contextoProductoId)
        ?.contextoProductoId || null,
    opciones: opcionesConsultadas,
    creadoEn: estado.ultimaInteraccionProducto?.creadoEn || null,
    turnosRestantes: numeroEnv(
      "CATALOG_PENDING_MATCH_MAX_TURNS",
      DEFAULT_MAX_TURNS
    ),
  };
}

function limpiarContextoTemporal(estado, contextoProductoId = null) {
  const coincide = (valor) =>
    !contextoProductoId || valor?.contextoProductoId === contextoProductoId;
  if (coincide(estado.coincidenciasProductoPendientes)) {
    estado.coincidenciasProductoPendientes = null;
  }
  if (coincide(estado.referenciasPendientes)) {
    estado.referenciasPendientes = null;
  }
  if (
    coincide(estado.ultimaSeleccion) &&
    (estado.ultimaSeleccion?.pendiente || !contextoProductoId)
  ) {
    estado.ultimaSeleccion = null;
  }
  estado.productosConsultados = contextoProductoId
    ? (estado.productosConsultados || []).filter(
        (item) => item.contextoProductoId !== contextoProductoId
      )
    : [];
}

function contextoVigente(estado) {
  const contexto = contextoDesdeEstado(estado);
  if (!contexto?.opciones?.length) return null;

  const expiraEn = Date.parse(contexto.expiraEn || "");
  if (
    (Number.isFinite(expiraEn) && expiraEn < Date.now()) ||
    Number(contexto.turnosRestantes || 0) <= 0
  ) {
    limpiarContextoTemporal(estado, contexto.contextoProductoId);
    return null;
  }

  return contexto;
}

function indiceOrdinal(mensaje = "", total = 0) {
  const texto = normalizarSeleccion(mensaje);
  const matchNumero =
    texto.match(/\bopcion\s*([1-9]\d*)\b/) ||
    texto.match(/^(?:quiero\s+)?(?:la\s+|el\s+)?([1-9]\d*)$/);
  if (matchNumero) {
    const indice = Number(matchNumero[1]) - 1;
    if (indice >= 0 && indice < total) return indice;
  }

  const ordinales = [
    ["primera", "primero"],
    ["segunda", "segundo"],
    ["tercera", "tercero"],
    ["cuarta", "cuarto"],
    ["quinta", "quinto"],
    ["sexta", "sexto"],
    ["septima", "septimo"],
    ["octava", "octavo"],
    ["novena", "noveno"],
    ["decima", "decimo"],
  ];
  const indiceOrdinalTexto = ordinales.findIndex((variantes) =>
    variantes.some((variante) => texto.includes(variante))
  );
  if (indiceOrdinalTexto >= 0 && indiceOrdinalTexto < total) {
    return indiceOrdinalTexto;
  }

  const matchProducto = texto.match(
    /\b(?:producto|referencia|cotizacion)\s*(?:numero\s*)?([1-9]\d*)\b/
  );
  if (matchProducto) {
    const indice = Number(matchProducto[1]) - 1;
    if (indice >= 0 && indice < total) return indice;
  }
  return -1;
}

function pesoSolicitado(mensaje = "") {
  const texto = normalizarSeleccion(mensaje);
  const match = texto.match(
    /\b\d+(?:\.\d+)?\s*(?:kg|kl|kilogramos?|kilos?|g|gr|gramos?|lb|libras?)\b/
  );
  return match ? normalizarPeso(match[0]) : null;
}

function esSenalReferenciaProducto(mensaje = "") {
  const texto = normalizarSeleccion(mensaje);
  if (!texto || texto.length > 80) return false;
  if (
    /\b(?:asi\s+)?esta\s+bien\b/.test(texto) ||
    /\b(?:eso\s+es\s+todo|nada\s+mas|no\s+mas|hasta\s+ahi)\b/.test(texto)
  ) {
    return false;
  }
  return Boolean(
    /^(?:si|sii+|dale|listo|correcto|esa|ese|esta|este|lo quiero|quiero ese|quiero esa)$/.test(
      texto
    ) ||
      /\b(?:el|la)\s+(?:primero|primera|segundo|segunda|tercero|tercera)\b/.test(
        texto
      ) ||
      /\b(?:ese|esa|este|esta)\b/.test(texto) ||
      /\bcu[aá]nto\s+(?:vale|cuesta).*(?:ese|esa|este|esta)\b/.test(texto) ||
      /\b(?:el|la)\s+de\s+\d+(?:\.\d+)?\s*(?:kg|g|gr|lb)\b/.test(texto) ||
      /^(?:de\s+)?\d+(?:\.\d+)?\s*(?:kg|g|gr|lb)$/.test(texto)
  );
}

function solicitaOperacionSobreSeleccion(mensaje = "") {
  const texto = normalizarSeleccion(mensaje);
  return Boolean(
    /^(?:si|sii+|dale|listo|correcto)$/.test(texto) ||
      /\b(?:quiero|llevo|dame|deme|regalame|dejame|agrega|agregame)\b/.test(
        texto
      )
  );
}

function esConsultaDePrecio(mensaje = "") {
  const texto = normalizarSeleccion(mensaje);
  return /\b(?:cuanto|precio|costo|vale|valor|a como|cotizar)\b/.test(texto);
}

function seleccionaPresentacionParaAgregar(mensaje = "", contexto = {}, presentacion = null) {
  return Boolean(
    presentacion &&
      ["productosConsultados", "ultimaSeleccion"].includes(contexto.fuente) &&
      esSenalReferenciaProducto(mensaje) &&
      !esConsultaDePrecio(mensaje)
  );
}

function hayOpcionesPendientesExplicitas(estado = {}) {
  return Boolean(
    estado.coincidenciasProductoPendientes?.opciones?.length ||
      estado.referenciasPendientes?.opciones?.length ||
      (estado.ultimaSeleccion?.pendiente &&
        estado.ultimaSeleccion.opciones?.length)
  );
}

function opcionDesdeCotizacion(cotizacion) {
  return {
    indice: cotizacion.indice,
    marca: cotizacion.marca,
    referencia: cotizacion.referencia,
    referenciaCatalogo:
      cotizacion.presentaciones?.[0]?.referenciaCatalogo ||
      cotizacion.referencia,
    referenciasEquivalentes:
      cotizacion.referenciasEquivalentes || [cotizacion.referencia],
    presentaciones: (cotizacion.presentaciones || []).map(
      (presentacion) => ({
        peso: presentacion.peso,
        precio: presentacion.precio,
        stock: presentacion.stock,
        referencia:
          presentacion.referenciaCatalogo || cotizacion.referencia,
      })
    ),
  };
}

function resolverOrdinalHistorial({ mensaje, estado, catalogo }) {
  if (hayOpcionesPendientesExplicitas(estado)) return null;
  const historial = estado.historialProductosConsultados || [];
  if (historial.length < 2) return null;
  const indice = indiceOrdinal(mensaje, historial.length);
  if (indice < 0) return null;

  const opcion = opcionDesdeCotizacion(historial[indice]);
  const producto = buscarReferenciaCatalogo(catalogo, opcion, mensaje);
  if (!producto) return null;
  const presentacion =
    presentacionSeleccionada(mensaje, opcion, producto.referencia) ||
    (opcion.presentaciones.length === 1
      ? producto.referencia.presentaciones.find(
          (item) =>
            normalizarPeso(item.peso) ===
            normalizarPeso(opcion.presentaciones[0].peso)
        ) || null
      : null);
  const productosActivos = opcion.presentaciones.map((item) => ({
    marca: opcion.marca,
    referencia: item.referencia || opcion.referenciaCatalogo,
    familiaReferencia: opcion.referencia,
    referenciasEquivalentes: opcion.referenciasEquivalentes,
    referenciaCatalogo: item.referencia || opcion.referenciaCatalogo,
    peso: item.peso,
    precio: item.precio,
    stock: item.stock,
    cantidad: 1,
  }));

  estado.marca = producto.marca.marca;
  estado.criterios = Object.fromEntries(
    Object.entries({
      especie: producto.referencia.especie || null,
      categoria: producto.referencia.categoria || null,
      subcategoria: producto.referencia.subcategoria || null,
      etapa: producto.referencia.etapa || null,
    }).filter(([, valor]) => Boolean(valor))
  );
  estado.productosConsultados = productosActivos;
  estado.ultimaSeleccion = {
    marca: producto.marca.marca,
    referencia: producto.referencia.nombre,
    presentacion: presentacion?.peso || null,
    cantidad: 1,
    origenHistorial: indice + 1,
    creadoEn: new Date().toISOString(),
  };

  if (solicitaOperacionSobreSeleccion(mensaje)) {
    return {
      resuelta: true,
      delegarMotorPedido: true,
      mensajeMotor: presentacion
        ? `agrega ${presentacion.peso}`
        : "sí",
      origen: "historialProductosConsultados",
      seleccion: {
        marca: producto.marca.marca,
        referencia: producto.referencia.nombre,
        presentacion: presentacion?.peso || null,
      },
    };
  }

  return {
    resuelta: true,
    origen: "historialProductosConsultados",
    seleccion: {
      marca: producto.marca.marca,
      referencia: producto.referencia.nombre,
      presentacion: presentacion?.peso || null,
    },
    respuesta: respuestaSeleccion(
      producto.marca,
      producto.referencia,
      presentacion
    ),
  };
}

function puntuarOpcion(mensaje, opcion) {
  const consulta = normalizarSeleccion(mensaje);
  if (!consulta) return 0;

  const nombres = [
    opcion.referencia,
    ...(opcion.referenciasEquivalentes || []),
  ].filter(Boolean);
  const nombresNormalizados = nombres.flatMap((referencia) => [
    normalizarSeleccion(referencia),
    normalizarSeleccion(`${opcion.marca} ${referencia}`),
  ]);
  if (
    nombresNormalizados.some(
      (nombre) =>
        consulta === nombre ||
        consulta.includes(nombre) ||
        nombre.includes(consulta)
    )
  ) return 1;

  const consultaTokens = tokensSeleccion(consulta);
  const opcionTokens = new Set(
    nombresNormalizados.flatMap((nombre) => tokensSeleccion(nombre))
  );
  const coincidencias = consultaTokens.filter((token) => opcionTokens.has(token));
  const cobertura = consultaTokens.length
    ? coincidencias.length / consultaTokens.length
    : 0;
  const precision = opcionTokens.size
    ? coincidencias.length / opcionTokens.size
    : 0;
  const similitud = nombresNormalizados.reduce(
    (maximo, nombre) =>
      Math.max(maximo, _internals.similitudTexto(consulta, nombre)),
    0
  );

  return Math.max(similitud, cobertura * 0.8 + precision * 0.2);
}

function buscarReferenciaCatalogo(catalogo, opcion, mensaje = "") {
  const marca = catalogo.find(
    (item) => normalizar(item.marca) === normalizar(opcion.marca)
  );
  if (!marca) return null;

  const peso = pesoSolicitado(mensaje);
  const referenciaPorPeso = peso
    ? (opcion.presentaciones || []).find(
        (presentacion) => normalizarPeso(presentacion.peso) === peso
      )?.referencia
    : null;
  const nombreReferencia =
    referenciaPorPeso || opcion.referenciaCatalogo || opcion.referencia;
  const referencia = (marca.referencias || []).find(
    (item) => normalizar(item.nombre) === normalizar(nombreReferencia)
  );
  return referencia ? { marca, referencia } : null;
}

function presentacionSeleccionada(mensaje, opcion, referencia) {
  const peso = pesoSolicitado(mensaje);
  if (!peso) return null;
  return (referencia.presentaciones || []).find(
    (presentacion) => normalizarPeso(presentacion.peso) === peso
  ) || null;
}

function coincideReferenciaExplicita(mensaje, opcion) {
  const consulta = normalizarSeleccion(mensaje);
  return [
    opcion.referencia,
    ...(opcion.referenciasEquivalentes || []),
  ]
    .filter(Boolean)
    .some((nombre) => {
      const referencia = normalizarSeleccion(nombre);
      const marcaReferencia = normalizarSeleccion(
        `${opcion.marca} ${nombre}`
      );
      return (
        consulta === referencia ||
        consulta === marcaReferencia ||
        consulta.includes(referencia) ||
        consulta.includes(marcaReferencia)
      );
    });
}

function disponibilidadReferencia(referencia) {
  const stocks = (referencia.presentaciones || [])
    .map((presentacion) => presentacion.stock)
    .filter((stock) => typeof stock === "boolean");
  if (!stocks.length) return "Disponibilidad: por confirmar.";
  if (stocks.some(Boolean)) return "Disponibilidad: disponible.";
  return "Disponibilidad: sin existencias registradas.";
}

function respuestaSeleccion(marca, referencia, presentacionElegida = null) {
  const candidatas = presentacionElegida
    ? [presentacionElegida]
    : referencia.presentaciones || [];
  const presentaciones = candidatas
    .map((presentacion) => {
      const stock =
        presentacion.stock === true
          ? " - disponible"
          : presentacion.stock === false
            ? " - sin existencias"
            : "";
      return `- ${presentacion.peso}: ${formatearPrecio(
        presentacion.precio
      )}${stock}`;
    })
    .join("\n");

  return `Perfecto, encontré ${referencia.nombre}.\n\nPresentaciones y precios:\n${
    presentaciones || "- Sin presentaciones activas"
  }\n\n${disponibilidadReferencia(
    referencia
  )}\n\n¿Quieres agregar alguna presentación al pedido?`;
}

function respuestaAmbigua(contexto) {
  const opciones = contexto.opciones
    .map((opcion) => `- ${opcion.referencia}`)
    .join("\n");
  const [primera, segunda] = contexto.opciones;
  const pregunta = segunda
    ? `¿Te refieres a ${primera.referencia} o a ${segunda.referencia}?`
    : `¿Te refieres a ${primera.referencia}?`;
  return `Quiero asegurarme de darte el precio correcto. Tengo estas referencias:\n\n${opciones}\n\n${pregunta}`;
}

function resolverSeleccionProductoPendiente({
  mensaje,
  estado,
  catalogo,
  nuevaBusquedaProducto = false,
}) {
  const seleccionHistorica = resolverOrdinalHistorial({
    mensaje,
    estado,
    catalogo,
  });
  if (seleccionHistorica) return seleccionHistorica;

  const contexto = contextoVigente(estado);
  if (!contexto) return null;
  if (
    contexto.fuente === "ultimaSeleccion" &&
    solicitaOperacionSobreSeleccion(mensaje)
  ) {
    return {
      resuelta: true,
      delegarMotorPedido: true,
      origen: "ultimaSeleccion",
      seleccion: {
        marca: estado.ultimaSeleccion.marca,
        referencia: estado.ultimaSeleccion.referencia,
        presentacion: estado.ultimaSeleccion.presentacion || null,
      },
    };
  }
  const pesoExplicito = pesoSolicitado(mensaje);
  if (
    contexto.opciones.length === 1 &&
    ["ultimaSeleccion", "productosConsultados"].includes(contexto.fuente) &&
    !esSenalReferenciaProducto(mensaje) &&
    (!coincideReferenciaExplicita(mensaje, contexto.opciones[0]) ||
      (pesoExplicito &&
        !(contexto.opciones[0].presentaciones || []).some(
          (presentacion) =>
            normalizarPeso(presentacion.peso) === pesoExplicito
        )))
  ) {
    if (nuevaBusquedaProducto) reiniciarFocoProducto(estado);
    return null;
  }

  const indice = indiceOrdinal(mensaje, contexto.opciones.length);
  let opcion = indice >= 0 ? contexto.opciones[indice] : null;
  let origen = opcion ? "referenciasPendientes" : null;
  const peso = pesoSolicitado(mensaje);

  if (!opcion && peso) {
    const porPresentacion = contexto.opciones.filter((item) =>
      (item.presentaciones || []).some(
        (presentacion) => normalizarPeso(presentacion.peso) === peso
      )
    );
    if (porPresentacion.length === 1) {
      opcion = porPresentacion[0];
      origen = "productosConsultados";
    }
  }

  if (!opcion) {
    const puntuadas = contexto.opciones
      .map((item) => ({ item, score: puntuarOpcion(mensaje, item) }))
      .sort((a, b) => b.score - a.score);
    const [primera, segunda] = puntuadas;
    const diferencia = (primera?.score || 0) - (segunda?.score || 0);

    if (
      primera?.score >= MIN_SELECTION_SCORE &&
      diferencia >= MIN_SELECTION_MARGIN
    ) {
      opcion = primera.item;
      origen = "referenciasPendientes";
    } else if (primera?.score >= MIN_SELECTION_SCORE) {
      contexto.turnosRestantes -= 1;
      return {
        resuelta: false,
        respuesta: respuestaAmbigua(contexto),
      };
    } else if (
      esSenalReferenciaProducto(mensaje) &&
      contexto.opciones.length === 1
    ) {
      opcion = contexto.opciones[0];
      origen = estado.ultimaSeleccion?.referencia
        ? "ultimaSeleccion"
        : "productosConsultados";
    } else if (
      esSenalReferenciaProducto(mensaje) ||
      primera?.score >= MIN_CONTEXT_SCORE
    ) {
      contexto.turnosRestantes -= 1;
      return {
        resuelta: false,
        origen: "estado_ambiguo",
        respuesta: respuestaAmbigua(contexto),
      };
    }
  }

  if (!opcion) {
    if (nuevaBusquedaProducto) reiniciarFocoProducto(estado);
    return null;
  }

  const producto = buscarReferenciaCatalogo(catalogo, opcion, mensaje);
  if (!producto) {
    limpiarContextoTemporal(estado, contexto.contextoProductoId);
    return null;
  }

  const presentacion = presentacionSeleccionada(
    mensaje,
    opcion,
    producto.referencia
  );
  limpiarContextoTemporal(estado, contexto.contextoProductoId);
  estado.marca = producto.marca.marca;
  estado.criterios = Object.fromEntries(
    Object.entries({
      especie: producto.referencia.especie || null,
      categoria: producto.referencia.categoria || null,
      subcategoria: producto.referencia.subcategoria || null,
      etapa: producto.referencia.etapa || null,
    }).filter(([, valor]) => Boolean(valor))
  );
  estado.referenciasPendientes = null;
  estado.productosPendientes = [];
  estado.alternativaPendiente = null;
  estado.esperandoMarca = false;
  estado.esperandoPresupuesto = false;
  estado.pendienteRecomendacion = false;
  estado.ultimaSeleccion = {
    contextoProductoId: contexto.contextoProductoId || null,
    marca: producto.marca.marca,
    referencia: producto.referencia.nombre,
    presentacion: presentacion?.peso || null,
    cantidad: 1,
    creadoEn: new Date().toISOString(),
  };
  establecerProductosConsultados(
    estado,
    (producto.referencia.presentaciones || []).map(
      (presentacion) => ({
        marca: producto.marca.marca,
        referencia: producto.referencia.nombre,
        peso: presentacion.peso,
        precio: presentacion.precio,
        stock:
          typeof presentacion.stock === "boolean"
            ? presentacion.stock
            : null,
        cantidad: 1,
      })
    )
  );
  estado.ultimaInteraccionProducto = {
    contextoProductoId: contexto.contextoProductoId || null,
    intencionOriginal: contexto.intencionOriginal || mensaje,
    tipoIntencion: contexto.tipoIntencion || "consulta_producto",
    creadoEn: new Date().toISOString(),
    turnoCreacion:
      contexto.turnoCreacion || estado.ultimoTurnoContextoProducto || null,
    resueltaPor: origen || "estado",
  };

  if (seleccionaPresentacionParaAgregar(mensaje, contexto, presentacion)) {
    return {
      resuelta: true,
      delegarMotorPedido: true,
      mensajeMotor: `agrega ${presentacion.peso}`,
      origen: origen || "estado",
      seleccion: {
        marca: producto.marca.marca,
        referencia: producto.referencia.nombre,
        presentacion: presentacion.peso,
      },
    };
  }

  return {
    resuelta: true,
    origen: origen || "estado",
    seleccion: {
      marca: producto.marca.marca,
      referencia: producto.referencia.nombre,
      presentacion: presentacion?.peso || null,
    },
    respuesta: respuestaSeleccion(
      producto.marca,
      producto.referencia,
      presentacion
    ),
  };
}

function historialRepresentaInteraccionProducto(historial = []) {
  return historial.some((item) => {
    const cuerpo = (item.body || "").toString();
    const texto = normalizar(cuerpo);
    return (
      /\b(presentaciones?|precios?|disponibilidad|catalogo|referencias?|coincidencias?|producto)\b/.test(
        texto
      ) ||
      (cuerpo.includes("$") &&
        /\b(kg|g|gr|lb|unidad|tableta|frasco|sobre)\b/.test(texto))
    );
  });
}

module.exports = {
  esSenalReferenciaProducto,
  establecerProductosConsultados,
  guardarCoincidenciasProductoPendientes,
  historialRepresentaInteraccionProducto,
  registrarProductosConsultados,
  reiniciarFocoProducto,
  resolverSeleccionProductoPendiente,
  _internals: {
    indiceOrdinal,
    limpiarContextoTemporal,
    opcionesDesdeProductosConsultados,
    pesoSolicitado,
    puntuarOpcion,
  },
};
