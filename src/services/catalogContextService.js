const { normalizar, normalizarPeso } = require("../utils/text");
const { buscarProductosCatalogoCliente } = require("../repositories/productRepository");
const {
  esSenalReferenciaProducto,
} = require("./pendingProductMatchService");

const DEFAULT_TEXT_REFERENCE_LIMIT = 8;
const DEFAULT_VISION_REFERENCE_LIMIT = 20;
const MAX_REFERENCE_LIMIT = 20;

function referenciasCatalogo(catalogo = []) {
  return catalogo.flatMap((marca) =>
    (marca.referencias || []).map((referencia) => ({
      marca,
      referencia,
    }))
  );
}

function limiteReferencias(clasificacion = {}) {
  const variable = clasificacion.requiereVision
    ? process.env.VISION_CATALOG_CONTEXT_MAX_REFERENCES
    : process.env.CATALOG_CONTEXT_MAX_REFERENCES;
  const defecto = clasificacion.requiereVision ? DEFAULT_VISION_REFERENCE_LIMIT : DEFAULT_TEXT_REFERENCE_LIMIT;
  const valor = Number(variable || defecto);
  return Math.max(0, Math.min(valor, MAX_REFERENCE_LIMIT));
}

function textoBusqueda(mensaje = "", estado = {}) {
  if (mensaje.trim() && !esSenalReferenciaProducto(mensaje)) {
    return mensaje;
  }

  const partes = [
    mensaje,
    estado.marca,
    estado.ultimaSeleccion?.marca,
    estado.ultimaSeleccion?.referencia,
    estado.referenciasPendientes?.marca,
    estado.referenciasPendientes?.texto,
    JSON.stringify(estado.criterios || {}),
  ];

  return partes.filter(Boolean).join(" ");
}

function expandirConsulta(texto = "") {
  const normalizado = normalizar(texto);
  const expansiones = [normalizado];

  if (/dog\s*chow|dogchow|doc\s*chow|dog\s*show/.test(normalizado)) expansiones.push("dog chow");
  if (/brabecto|bravecto/.test(normalizado)) expansiones.push("bravecto");
  if (/\b(pequeno|pequena|pequenos|pequenas|mini)\b/.test(normalizado)) {
    expansiones.push("rp raza pequena");
  }
  if (/\b(grande|grandes|mediano|mediana|medianos|medianas)\b/.test(normalizado)) {
    expansiones.push("rg rmg raza grande");
  }
  if (/purg|desparas|parasito|antiparas/.test(normalizado)) expansiones.push("desparasitante medicamento");
  if (/pulga|garrapata/.test(normalizado)) expansiones.push("antipulgas medicamento");
  if (/snack|premio|galleta/.test(normalizado)) expansiones.push("snack");
  if (/arena|sustrato/.test(normalizado)) expansiones.push("arena sustrato");
  if (/juguete|pelota|mordedor/.test(normalizado)) expansiones.push("juguete accesorio");

  return normalizar(expansiones.join(" "));
}

function tokens(texto = "") {
  return expandirConsulta(texto)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !["para", "tiene", "tienes", "manejan", "quiero"].includes(token));
}

function contiene(texto, token) {
  return texto.includes(token);
}

function puntuarReferencia({ marca, referencia }, consulta, tokensConsulta) {
  const textoMarca = normalizar(marca.marca || "");
  const textoReferencia = normalizar(
    [
      referencia.nombre,
      referencia.descripcion,
      referencia.especie,
      referencia.categoria,
      referencia.subcategoria,
      referencia.etapa,
      ...(referencia.metadata?.original_names || []),
      ...(referencia.presentaciones || []).map((presentacion) => presentacion.peso),
    ].join(" ")
  );
  const textoCompleto = `${textoMarca} ${textoReferencia}`;
  let puntos = 0;

  if (textoMarca && contiene(consulta, textoMarca)) puntos += 40;
  if (normalizar(referencia.nombre || "") && contiene(consulta, normalizar(referencia.nombre))) puntos += 60;

  tokensConsulta.forEach((token) => {
    if (contiene(textoMarca, token)) puntos += 10;
    if (contiene(textoReferencia, token)) puntos += token.length <= 2 ? 4 : 8;
  });

  const pesoConsulta = normalizarPeso(consulta);
  if (pesoConsulta) {
    const coincidePeso = (referencia.presentaciones || []).some((presentacion) =>
      normalizarPeso(presentacion.peso).includes(pesoConsulta)
    );
    if (coincidePeso) puntos += 6;
  }

  if (consulta.includes("gato") && referencia.especie === "gato") puntos += 10;
  if (consulta.includes("perro") && referencia.especie === "perro") puntos += 10;
  if (consulta.includes("desparasitante") && referencia.subcategoria === "desparasitante") puntos += 20;
  if (consulta.includes("antipulgas") && referencia.subcategoria === "antipulgas") puntos += 20;

  return puntos;
}

function agruparCatalogo(items = []) {
  const grupos = new Map();
  items.forEach(({ marca, referencia }) => {
    const nombre = marca.marca;
    if (!grupos.has(nombre)) {
      grupos.set(nombre, { ...marca, referencias: [] });
    }
    grupos.get(nombre).referencias.push(referencia);
  });
  return Array.from(grupos.values());
}

function seleccionarCatalogoLocal({ catalogo = [], mensaje = "", estado = {}, clasificacion = {} } = {}) {
  const totalReferencias = referenciasCatalogo(catalogo).length;
  const limite = limiteReferencias(clasificacion);

  if (!limite) {
    return {
      catalogo: [],
      metadata: { totalReferencias, referenciasEnviadas: 0, limite, estrategia: "sin_catalogo" },
    };
  }

  const consulta = expandirConsulta(textoBusqueda(mensaje, estado));
  const tokensConsulta = tokens(consulta);
  const items = referenciasCatalogo(catalogo);
  const conPuntaje = items
    .map((item, index) => ({
      ...item,
      index,
      puntos: puntuarReferencia(item, consulta, tokensConsulta),
    }))
    .filter((item) => item.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.index - b.index);

  let seleccionados = conPuntaje.slice(0, limite);
  let estrategia = "candidatos_keyword";

  if (!seleccionados.length && clasificacion.requiereBusquedaProducto) {
    seleccionados = items.slice(0, limite).map((item, index) => ({ ...item, index, puntos: 0 }));
    estrategia = "fallback_limitado";
  }

  if (!clasificacion.requiereBusquedaProducto && !clasificacion.requiereVision) {
    seleccionados = [];
    estrategia = "sin_busqueda";
  }

  return {
    catalogo: agruparCatalogo(seleccionados),
    metadata: {
      totalReferencias,
      referenciasEnviadas: seleccionados.length,
      limite,
      estrategia,
      semanticaPreparada: process.env.CATALOG_SEARCH_STRATEGY === "semantic",
    },
  };
}

function debeBuscarEnSupabase(clasificacion = {}) {
  if (!clasificacion.requiereBusquedaProducto && !clasificacion.requiereVision) return false;
  return process.env.CATALOG_SEARCH_BACKEND !== "local";
}

function logBusquedaCatalogo({ cliente, query, metadata, fallback = false, error = null }) {
  if (process.env.CATALOG_SEARCH_LOGS === "false") return;

  console.log(
    `[Catalog Search] cliente=${cliente?.slug || cliente?.id || "sin_cliente"} | tipo=${
      metadata?.estrategia || "desconocida"
    } | fallback=${fallback ? "si" : "no"} | resultados=${
      metadata?.referenciasEnviadas ?? 0
    } | duracionMs=${metadata?.duracionMs ?? 0} | query="${query}"${error ? ` | error=${error.message}` : ""}`
  );
}

async function seleccionarCatalogoParaIA({ catalogo = [], mensaje = "", estado = {}, clasificacion = {}, cliente = null } = {}) {
  const limite = limiteReferencias(clasificacion);
  const query = expandirConsulta(textoBusqueda(mensaje, estado));

  if (!debeBuscarEnSupabase(clasificacion)) {
    const resultadoLocal = seleccionarCatalogoLocal({ catalogo, mensaje, estado, clasificacion });
    logBusquedaCatalogo({ cliente, query, metadata: resultadoLocal.metadata, fallback: false });
    return resultadoLocal;
  }

  try {
    const resultado = await buscarProductosCatalogoCliente(cliente, { query, limit: limite });
    const metadata = {
      totalReferencias: referenciasCatalogo(catalogo).length,
      limite,
      semanticaPreparada: process.env.CATALOG_SEARCH_STRATEGY === "semantic",
      ...resultado.metadata,
    };

    logBusquedaCatalogo({ cliente, query, metadata, fallback: false });

    return {
      catalogo: resultado.catalogo,
      metadata,
    };
  } catch (error) {
    const resultadoLocal = seleccionarCatalogoLocal({ catalogo, mensaje, estado, clasificacion });
    const metadata = {
      ...resultadoLocal.metadata,
      estrategia: `fallback_${resultadoLocal.metadata.estrategia}`,
      fallbackReason: error.message,
      query,
    };
    logBusquedaCatalogo({ cliente, query, metadata, fallback: true, error });

    return {
      catalogo: resultadoLocal.catalogo,
      metadata,
    };
  }
}

module.exports = {
  seleccionarCatalogoParaIA,
  _internals: {
    expandirConsulta,
    puntuarReferencia,
    seleccionarCatalogoLocal,
    textoBusqueda,
  },
};
