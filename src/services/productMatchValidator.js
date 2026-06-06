const { normalizar, normalizarPeso } = require("../utils/text");

const DEFAULT_HIGH_THRESHOLD = 0.84;
const DEFAULT_MEDIUM_THRESHOLD = 0.68;
const DEFAULT_AMBIGUITY_MARGIN = 0.08;
const DEFAULT_ALTERNATIVE_LIMIT = 3;

const STOPWORDS = new Set(
  [
    "a",
    "al",
    "algo",
    "agregar",
    "busco",
    "categoria",
    "comida",
    "comprar",
    "concentrado",
    "consulta",
    "cuanto",
    "cuesta",
    "de",
    "del",
    "disponible",
    "el",
    "en",
    "esta",
    "este",
    "hay",
    "la",
    "las",
    "lo",
    "los",
    "maneja",
    "manejan",
    "marca",
    "medicina",
    "medicamento",
    "medicamentos",
    "necesito",
    "para",
    "pastilla",
    "pastillas",
    "pulga",
    "pulgas",
    "antipulgas",
    "garrapata",
    "garrapatas",
    "desparasitante",
    "arena",
    "snack",
    "snacks",
    "juguete",
    "juguetes",
    "accesorio",
    "accesorios",
    "precio",
    "producto",
    "productos",
    "opcion",
    "opciones",
    "alternativa",
    "alternativas",
    "recomienda",
    "recomiendas",
    "recomendacion",
    "recomendaciones",
    "sirve",
    "sirven",
    "que",
    "raza",
    "razas",
    "referencia",
    "tiene",
    "tienes",
    "tienen",
    "todas",
    "todos",
    "un",
    "una",
    "vale",
    "venden",
    "vende",
    "y",
    "quiero",
  ].map(normalizar)
);

const TERMINOS_ATRIBUTO = new Set(
  [
    "adulto",
    "adultos",
    "cachorro",
    "cachorros",
    "senior",
    "perro",
    "perros",
    "gato",
    "gatos",
    "ave",
    "aves",
    "roedor",
    "roedores",
    "pez",
    "peces",
    "equino",
    "equinos",
    "bovino",
    "bovinos",
    "pequena",
    "pequenas",
    "pequeno",
    "pequenos",
    "mediana",
    "medianas",
    "mediano",
    "medianos",
    "grande",
    "grandes",
    "mini",
  ].map(normalizar)
);

function numeroEnv(nombre, defecto) {
  const valor = Number(process.env[nombre]);
  return Number.isFinite(valor) ? valor : defecto;
}

function distanciaLevenshtein(a = "", b = "") {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const anterior = Array.from({ length: b.length + 1 }, (_, index) => index);
  const actual = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    actual[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      actual[j] = Math.min(
        actual[j - 1] + 1,
        anterior[j] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j += 1) anterior[j] = actual[j];
  }

  return anterior[b.length];
}

function similitudTexto(a = "", b = "") {
  const izquierda = normalizar(a).replace(/\s+/g, "");
  const derecha = normalizar(b).replace(/\s+/g, "");
  if (!izquierda || !derecha) return 0;
  if (izquierda === derecha) return 1;
  return 1 - distanciaLevenshtein(izquierda, derecha) / Math.max(izquierda.length, derecha.length);
}

function tokensDistintivos(texto = "", opciones = {}) {
  let textoNormalizado = normalizar(texto);
  if (opciones.inferirEspeciePorRaza) {
    textoNormalizado = textoNormalizado.replace(
      /\b(?:r|raza|razas)\s+(?=pequena|pequeno|mediana|mediano|grande)/g,
      "perro raza "
    );
  }

  return textoNormalizado
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|gr|lb|ml|mg|unidad|unidades)\b/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !STOPWORDS.has(token))
    .filter((token) => !/^\d+(?:\.\d+)?$/.test(token))
    .filter((token) => token.length >= 2);
}

function nombresReferencia(marca, referencia) {
  const palabrasClave = Array.isArray(referencia.metadata?.keywords)
    ? referencia.metadata.keywords
    : [referencia.metadata?.keywords];
  return [
    marca.marca,
    referencia.nombre,
    ...(Array.isArray(referencia.metadata?.original_names)
      ? referencia.metadata.original_names
      : []),
    ...palabrasClave,
  ].filter(Boolean);
}

function descriptorReferencia(marca, referencia) {
  return [
    marca.marca,
    referencia.nombre,
    referencia.especie,
    referencia.categoria,
    referencia.subcategoria,
    referencia.etapa,
    ...(referencia.presentaciones || []).map((presentacion) => presentacion.peso),
  ]
    .filter(Boolean)
    .join(" ");
}

function catalogoPlano(catalogo = []) {
  return catalogo.flatMap((marca) =>
    (marca.referencias || []).map((referencia) => ({
      marca,
      referencia,
      nombres: nombresReferencia(marca, referencia),
    }))
  );
}

function marcaExactaConsultada(catalogo = [], terminos = []) {
  return catalogo
    .map((marca) => ({
      marca: normalizar(marca.marca),
      tokens: normalizar(marca.marca).split(/\s+/).filter(Boolean),
    }))
    .filter((entrada) => entrada.tokens.length && entrada.tokens.every((token) => terminos.includes(token)))
    .sort((a, b) => b.tokens.length - a.tokens.length)[0]?.marca;
}

function coincidenciaNombre(terminos = [], nombre = "") {
  const nombreNormalizado = normalizar(nombre);
  const tokensNombre = nombreNormalizado.split(/\s+/).filter(Boolean);
  const consulta = terminos.join(" ");
  const consultaCompacta = consulta.replace(/\s+/g, "");
  const nombreCompacto = nombreNormalizado.replace(/\s+/g, "");

  if (!consulta || !nombreNormalizado) return { score: 0, exacta: false };
  const coincidenciaExacta =
    nombreNormalizado === consulta ||
    nombreCompacto === consultaCompacta ||
    terminos.every((termino) => tokensNombre.includes(termino));
  if (coincidenciaExacta) {
    return { score: 1, exacta: true };
  }

  let suma = 0;
  let coincidencias = 0;
  terminos.forEach((termino) => {
    const mejor = tokensNombre.reduce((maximo, token) => {
      if (termino === token) return 1;
      if (termino.length <= 3 || token.length <= 3) return maximo;
      return Math.max(maximo, similitudTexto(termino, token));
    }, 0);
    suma += mejor;
    if (mejor >= 0.72) coincidencias += 1;
  });

  const cobertura = coincidencias / terminos.length;
  const promedio = suma / terminos.length;
  const frase = similitudTexto(consulta, nombreNormalizado);
  return {
    score: Math.max(frase, promedio * 0.75 + cobertura * 0.25),
    exacta: false,
  };
}

function puntuarItem(item, terminos) {
  const resultados = [
    { nombre: item.marca.marca, tipo: "marca" },
    { nombre: item.referencia.nombre, tipo: "referencia" },
    {
      nombre: `${item.marca.marca} ${item.referencia.nombre}`,
      tipo: "referencia",
    },
    {
      nombre: descriptorReferencia(item.marca, item.referencia),
      tipo: "referencia",
    },
    ...item.nombres.slice(2).map((nombre) => ({ nombre, tipo: "alias" })),
  ].map((entrada) => ({
    ...entrada,
    ...coincidenciaNombre(terminos, entrada.nombre),
  }));
  resultados.sort((a, b) => b.score - a.score);
  return {
    ...item,
    score: resultados[0]?.score || 0,
    exacta: Boolean(resultados[0]?.exacta),
    nombreCoincidente: resultados[0]?.nombre || null,
    tipoCoincidencia: resultados[0]?.tipo || null,
  };
}

function terminosInterpretados(interpretacion = null) {
  const producto =
    interpretacion?.producto ||
    (interpretacion?.productos?.length === 1 ? interpretacion.productos[0] : {});
  return tokensDistintivos(`${producto.marca || ""} ${producto.referencia || ""}`);
}

function presentacionCoincide(referencia, mensaje, interpretacion) {
  const producto =
    interpretacion?.producto ||
    (interpretacion?.productos?.length === 1 ? interpretacion.productos[0] : {});
  const solicitada = normalizarPeso(
    producto.presentacion || mensaje.match(/\b\d+(?:[.,]\d+)?\s*(?:kg|kl|g|gr|lb)\b/i)?.[0] || ""
  );
  if (!solicitada) return null;
  return (referencia.presentaciones || []).some(
    (presentacion) => normalizarPeso(presentacion.peso) === solicitada
  );
}

function estaEnCandidatos(item, catalogoCandidatos = []) {
  return catalogoCandidatos.some(
    (marca) =>
      normalizar(marca.marca) === normalizar(item.marca.marca) &&
      (item.tipoCoincidencia === "marca" ||
        (marca.referencias || []).some(
          (referencia) => normalizar(referencia.nombre) === normalizar(item.referencia.nombre)
        ))
  );
}

function resumirAlternativa(item) {
  return {
    marca: item.marca.marca,
    referencia: item.referencia.nombre,
    score: Number(item.score.toFixed(3)),
    tipoCoincidencia: item.tipoCoincidencia,
    presentaciones: (item.referencia.presentaciones || []).map((presentacion) => ({
      peso: presentacion.peso,
      precio: presentacion.precio,
    })),
  };
}

function validarCoincidenciaProducto({
  mensaje = "",
  catalogo = [],
  catalogoCandidatos = [],
  clasificacion = {},
  interpretacion = null,
} = {}) {
  const intencionProducto = ["precio", "busqueda_producto", "imagen", "audio"].includes(
    clasificacion.intencion
  );
  const perfilValidable =
    ["producto", "multimedia"].includes(clasificacion.perfilContexto) ||
    (clasificacion.perfilContexto === "pedido" && intencionProducto);
  if (!perfilValidable) {
    return {
      nivel: "no_aplica",
      razon: "fuera_del_flujo_de_producto_simple",
      terminos: [],
    };
  }

  if (!intencionProducto && !interpretacion?.producto?.marca && !interpretacion?.producto?.referencia) {
    return { nivel: "no_aplica", razon: "sin_busqueda_especifica", terminos: [] };
  }

  const terminosMensaje = clasificacion.requiereVision
    ? []
    : tokensDistintivos(mensaje, { inferirEspeciePorRaza: true });
  const terminosVisibles = clasificacion.requiereVision ? [] : tokensDistintivos(mensaje);
  const terminosIA = terminosInterpretados(interpretacion);
  const puedeUsarInterpretacion = Boolean(clasificacion.requiereVision);
  const usaInterpretacion =
    puedeUsarInterpretacion && !terminosMensaje.length && terminosIA.length > 0;
  const terminos = terminosMensaje.length
    ? terminosMensaje
    : usaInterpretacion
      ? terminosIA
      : [];

  if (!terminos.length) {
    return { nivel: "no_aplica", razon: "consulta_generica", terminos: [] };
  }

  const marcaExacta = marcaExactaConsultada(catalogo, terminos);
  const terminosIdentidad = terminos.filter((termino) => !TERMINOS_ATRIBUTO.has(termino));
  if (!marcaExacta && !terminosIdentidad.length) {
    return {
      nivel: "no_aplica",
      razon: "consulta_categoria",
      terminos,
      etiqueta: terminosVisibles.join(" "),
    };
  }

  const itemsEvaluados = catalogoPlano(catalogo).filter(
    (item) => !marcaExacta || normalizar(item.marca.marca) === marcaExacta
  );
  const puntuados = itemsEvaluados
    .map((item) => puntuarItem(item, terminos))
    .sort((a, b) => b.score - a.score);
  const [primero, segundo] = puntuados;
  const high = numeroEnv("CATALOG_MATCH_HIGH_THRESHOLD", DEFAULT_HIGH_THRESHOLD);
  const medium = numeroEnv("CATALOG_MATCH_MEDIUM_THRESHOLD", DEFAULT_MEDIUM_THRESHOLD);
  const margin = numeroEnv("CATALOG_MATCH_AMBIGUITY_MARGIN", DEFAULT_AMBIGUITY_MARGIN);
  const diferencia = (primero?.score || 0) - (segundo?.score || 0);
  const enCandidatos = primero ? estaEnCandidatos(primero, catalogoCandidatos) : false;
  const confianzaIA = Number(interpretacion?.confianza || 0);
  const presentacionValida = primero
    ? presentacionCoincide(primero.referencia, mensaje, interpretacion)
    : null;

  let nivel = "baja";
  let razon = "sin_coincidencia_confiable";
  const exactaSinAmbiguedad =
    primero?.exacta &&
    (primero.tipoCoincidencia === "marca" || diferencia >= margin);

  if (
    primero &&
    (primero.exacta || primero.score >= high) &&
    (diferencia >= margin || exactaSinAmbiguedad) &&
    (enCandidatos || !catalogoCandidatos.length)
  ) {
    nivel = "alta";
    razon = primero.exacta ? "nombre_exacto" : "similitud_alta";
  } else if (primero && primero.score >= medium) {
    nivel = "media";
    razon = diferencia < margin ? "ambigua" : "similitud_media";
  }

  if (usaInterpretacion && nivel === "alta" && !primero.exacta && confianzaIA < 0.85) {
    nivel = "media";
    razon = "entidad_multimedia_por_confirmar";
  }

  return {
    nivel,
    razon,
    terminos,
    etiqueta: (terminosVisibles.length ? terminosVisibles : terminosIA).join(" "),
    score: Number((primero?.score || 0).toFixed(3)),
    diferencia: Number(diferencia.toFixed(3)),
    usaInterpretacion,
    marcaExacta,
    presentacionValida,
    coincidencia: nivel === "alta" && primero ? resumirAlternativa(primero) : null,
    alternativas: puntuados
      .filter((item) => item.score >= medium)
      .slice(0, numeroEnv("CATALOG_MATCH_ALTERNATIVE_LIMIT", DEFAULT_ALTERNATIVE_LIMIT))
      .map(resumirAlternativa),
  };
}

function etiquetaConsulta(validacion = {}) {
  return validacion.etiqueta?.toUpperCase() || validacion.terminos?.join(" ").toUpperCase() || "ese producto";
}

function respuestaValidacionProducto(validacion = {}) {
  if (validacion.nivel === "media" && validacion.alternativas?.length) {
    const opciones = validacion.alternativas
      .map((item) => `- ${item.marca}: ${item.referencia}`)
      .join("\n");
    return `No encontré una coincidencia exacta para ${etiquetaConsulta(
      validacion
    )}. Estas son posibles coincidencias:\n${opciones}\n\n¿Te refieres a alguna de ellas?`;
  }

  return `Por ahora no encuentro ${etiquetaConsulta(
    validacion
  )} en el catálogo actual. Puede que no lo manejemos o que esté escrito de otra forma. ¿Tienes una foto, la marca completa o la presentación para revisarlo mejor?`;
}

function aplicarCoincidenciaValidada(interpretacion, validacion) {
  if (validacion?.nivel !== "alta" || !validacion.coincidencia) {
    return interpretacion;
  }

  const producto =
    interpretacion?.producto ||
    (interpretacion?.productos?.length === 1 ? interpretacion.productos[0] : null);
  if (!producto || typeof producto !== "object") {
    return interpretacion;
  }

  const coincidencia = validacion.coincidencia;
  const productoValidado = {
    ...producto,
    marca: coincidencia.marca || producto.marca,
  };

  if (coincidencia.tipoCoincidencia !== "marca" && coincidencia.referencia) {
    productoValidado.referencia = coincidencia.referencia;
  }

  const resultado = {
    ...interpretacion,
    producto: productoValidado,
  };
  if (interpretacion.productos?.length === 1) {
    resultado.productos = [productoValidado];
  }
  return resultado;
}

module.exports = {
  aplicarCoincidenciaValidada,
  respuestaValidacionProducto,
  validarCoincidenciaProducto,
  _internals: {
    distanciaLevenshtein,
    similitudTexto,
    tokensDistintivos,
  },
};
