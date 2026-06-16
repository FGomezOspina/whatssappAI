const { formatearPrecio, normalizar, normalizarPeso } = require("../utils/text");

const DEFAULT_HIGH_THRESHOLD = 0.84;
const DEFAULT_MEDIUM_THRESHOLD = 0.68;
const DEFAULT_AMBIGUITY_MARGIN = 0.08;
const DEFAULT_ALTERNATIVE_LIMIT = 3;
const MIN_SIMILITUD_MARCA_VISUAL = 0.76;
const PESOS_MATCH_VISUAL = {
  marca: 0.26,
  linea: 0.28,
  especie: 0.18,
  presentacion: 0.2,
  sabor: 0.08,
};

const STOPWORDS = new Set(
  [
    "a",
    "al",
    "algo",
    "agregar",
    "agrega",
    "agregame",
    "busco",
    "categoria",
    "comida",
    "comprar",
    "concentrado",
    "consulta",
    "cuanto",
    "cuesta",
    "de",
    "dame",
    "deme",
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
    "no",
    "es",
    "era",
    "digo",
    "quise",
    "queria",
    "decir",
    "refiero",
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

const TERMINOS_COMERCIALES_VISUALES = new Set(
  [
    "adul",
    "adult",
    "all",
    "breeds",
    "developed",
    "diet",
    "diets",
    "for",
    "gold",
    "line",
    "linea",
    "nutrition",
    "nutricion",
    "plus",
    "premium",
    "sizes",
    "veterinaria",
    "veterinarias",
    "veterinario",
    "veterinarios",
    "veterinary",
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

function normalizarFonetico(texto = "") {
  return normalizar(texto)
    .replace(/h/g, "")
    .replace(/ph/g, "f")
    .replace(/qu/g, "k")
    .replace(/[cq]/g, "k")
    .replace(/[vz]/g, "b")
    .replace(/ll/g, "y")
    .replace(/y/g, "i")
    .replace(/(.)\1+/g, "$1");
}

function similitudTokenFlexible(a = "", b = "") {
  const izquierda = normalizar(a);
  const derecha = normalizar(b);
  if (!izquierda || !derecha) return 0;
  if (izquierda === derecha) return 1;

  let score = similitudTexto(izquierda, derecha);
  if (izquierda.length >= 3 && derecha.length >= 3) {
    if (izquierda.includes(derecha) || derecha.includes(izquierda)) {
      const proporcion =
        Math.min(izquierda.length, derecha.length) /
        Math.max(izquierda.length, derecha.length);
      score = Math.max(score, 0.78 + proporcion * 0.2);
    }

    const foneticaIzquierda = normalizarFonetico(izquierda);
    const foneticaDerecha = normalizarFonetico(derecha);
    score = Math.max(
      score,
      similitudTexto(foneticaIzquierda, foneticaDerecha)
    );
  }

  return Math.min(1, score);
}

function combinacionesContiguas(tokens = [], maximo = 3) {
  const combinaciones = [];
  for (let inicio = 0; inicio < tokens.length; inicio += 1) {
    for (
      let largo = 1;
      largo <= maximo && inicio + largo <= tokens.length;
      largo += 1
    ) {
      combinaciones.push(tokens.slice(inicio, inicio + largo).join(""));
    }
  }
  return [...new Set(combinaciones)];
}

function normalizarIdentidadProducto(texto = "") {
  return normalizar(texto)
    .replace(/\bpremiun\b/g, "premium")
    .replace(/\bpro\b/g, "premium")
    .replace(/\bad\b/g, "adulto")
    .replace(/\brp\b/g, "raza pequeno")
    .replace(/\b(?:peq|pequena|pequenas|pequenos)\b/g, "pequeno")
    .replace(/\b(?:rg|rmg)\b/g, "raza grande")
    .replace(/\b(?:gran|grand|grandes|mediano|mediana|medianos|medianas)\b/g, "grande");
}

function tokenIdentidadVisual(token = "") {
  if (/^(?:cat|cats|gato|gatos|feline|felino|felina)$/.test(token)) {
    return "gato";
  }
  if (/^(?:dog|dogs|perro|perros|canine|canino|canina)$/.test(token)) {
    return "perro";
  }
  if (/^(?:urin|uro|urinary|urinay|urinario|urology)/.test(token)) {
    return "urinario";
  }
  if (/^(?:renal|kidney)/.test(token)) return "renal";
  if (/^(?:gastro|digestive|digestivo)/.test(token)) return "gastro";
  if (/^(?:derm|skin|piel|atopic)/.test(token)) return "piel";
  if (/^(?:castr|steriliz|esteriliz)/.test(token)) return "castrado";
  if (/^(?:obes|weight|sobrepeso)/.test(token)) return "peso";
  return token;
}

function tokensIdentidadVisual(texto = "") {
  return [
    ...new Set(
      normalizarIdentidadProducto(texto)
        .replace(
          /\b(?:x|por)?\s*\d+(?:\.\d+)?\s*(?:kg|kl|kr|kilos?|kilogramos?|g|gr|gramos?|lb|libras?|ml|mg|unidad|unidades)\b/g,
          " "
        )
        .split(/\s+/)
        .filter(Boolean)
        .filter((token) => !STOPWORDS.has(token))
        .filter((token) => !TERMINOS_COMERCIALES_VISUALES.has(token))
        .filter((token) => !/^\d+(?:\.\d+)?$/.test(token))
        .map(tokenIdentidadVisual)
        .filter((token) => token.length >= 2)
    ),
  ];
}

function tokensDistintivos(texto = "", opciones = {}) {
  let textoNormalizado = normalizarIdentidadProducto(texto);
  if (opciones.inferirEspeciePorRaza) {
    textoNormalizado = textoNormalizado.replace(
      /\b(?:r|raza|razas)\s+(?=pequena|pequeno|mediana|mediano|grande)/g,
      "perro raza "
    );
  }

  return [...new Set(textoNormalizado
    .replace(
      /\b(?:x|por)?\s*\d+(?:\.\d+)?\s*(?:kg|kl|kr|kilos?|kilogramos?|g|gr|gramos?|lb|libras?|ml|mg|unidad|unidades)\b/g,
      " "
    )
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !STOPWORDS.has(token))
    .filter((token) => !/^\d+(?:\.\d+)?$/.test(token))
    .filter((token) => token.length >= 2))];
}

function esCorreccionProducto(mensaje = "") {
  const texto = normalizar(mensaje).trim();
  return Boolean(
    /^(?:no[\s,]+)?(?:es|era|quise decir|queria decir|me refiero a|digo)\b/.test(
      texto
    ) ||
      /\b(?:no es|sino|quise decir|queria decir|me refiero a)\b/.test(texto)
  );
}

function limpiarMarcadoresCorreccion(mensaje = "") {
  return normalizar(mensaje)
    .replace(
      /^(?:no[\s,]+)?(?:es|era|quise decir|queria decir|me refiero a|digo)\s+/,
      ""
    )
    .trim();
}

function contextoProductoVigente(contexto = {}) {
  if (!contexto || typeof contexto !== "object") return false;
  const creadoEn = Date.parse(contexto.creadoEn || "");
  if (!Number.isFinite(creadoEn)) return false;
  const ttl = numeroEnv("PRODUCT_REASONING_CONTEXT_TTL_MS", 30 * 60 * 1000);
  return Date.now() - creadoEn <= ttl;
}

function construirConsultaProductoContextual(
  mensaje = "",
  contextoProducto = null
) {
  if (
    !esCorreccionProducto(mensaje) ||
    !contextoProductoVigente(contextoProducto)
  ) {
    return mensaje;
  }

  const correccion = limpiarMarcadoresCorreccion(mensaje);
  const terminosActuales = tokensDistintivos(correccion);
  const terminosPrevios = Array.isArray(contextoProducto.terminos)
    ? contextoProducto.terminos
    : tokensDistintivos(contextoProducto.etiqueta || "");
  const conservaContexto = terminosActuales.some((actual) =>
    terminosPrevios.some(
      (anterior) => similitudTokenFlexible(actual, anterior) >= 0.66
    )
  );
  if (terminosActuales.length >= 3 || !conservaContexto) return correccion;

  const complementarios = terminosPrevios.filter(
    (anterior) =>
      !terminosActuales.some(
        (actual) => similitudTokenFlexible(actual, anterior) >= 0.66
      )
  );

  return [correccion, ...complementarios].filter(Boolean).join(" ");
}

function nombresReferencia(marca, referencia) {
  const palabrasClave = Array.isArray(referencia.metadata?.keywords)
    ? referencia.metadata.keywords
    : [referencia.metadata?.keywords];
  const aliases = [
    ...(Array.isArray(referencia.aliases) ? referencia.aliases : []),
    ...(Array.isArray(referencia.metadata?.aliases)
      ? referencia.metadata.aliases
      : []),
    ...(Array.isArray(referencia.metadata?.equivalent_references)
      ? referencia.metadata.equivalent_references
      : []),
  ];
  return [
    marca.marca,
    referencia.nombre,
    referencia.descripcion,
    ...(Array.isArray(referencia.metadata?.original_names)
      ? referencia.metadata.original_names
      : []),
    ...aliases,
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
      completaReferencia: (marca.referencias || []).some((referencia) => {
        const tokensReferencia = new Set(
          normalizar(`${marca.marca} ${referencia.nombre}`)
            .split(/\s+/)
            .filter(Boolean)
        );
        return terminos.every((termino) => tokensReferencia.has(termino));
      }),
    }))
    .filter(
      (entrada) =>
        entrada.tokens.length &&
        entrada.tokens.every((token) => terminos.includes(token)) &&
        !(
          entrada.tokens.length === 1 &&
          entrada.tokens[0].length <= 3 &&
          terminos.some((termino) => termino !== entrada.tokens[0]) &&
          !entrada.completaReferencia &&
          terminos[0] !== entrada.tokens[0]
        )
    )
    .sort((a, b) => b.tokens.length - a.tokens.length)[0]?.marca;
}

function coincidenciaNombre(terminos = [], nombre = "") {
  const nombreNormalizado = normalizarIdentidadProducto(nombre);
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
  if (
    consultaCompacta.length >= 5 &&
    nombreCompacto.includes(consultaCompacta)
  ) {
    return { score: 0.98, exacta: false };
  }

  let suma = 0;
  let coincidencias = 0;
  const unidadesNombre = combinacionesContiguas(tokensNombre);
  terminos.forEach((termino) => {
    const mejor = unidadesNombre.reduce(
      (maximo, token) =>
        Math.max(maximo, similitudTokenFlexible(termino, token)),
      0
    );
    suma += mejor;
    if (mejor >= 0.72) coincidencias += 1;
  });

  const cobertura = coincidencias / terminos.length;
  const promedio = suma / terminos.length;
  const frase = similitudTexto(consulta, nombreNormalizado);
  const consultaCompuesta = terminos.length > 1 ? terminos.join("") : "";
  const similitudCompuesta = consultaCompuesta
    ? unidadesNombre.reduce(
        (mejor, nombreCompuesto) => {
          const proporcion =
            Math.min(consultaCompuesta.length, nombreCompuesto.length) /
            Math.max(consultaCompuesta.length, nombreCompuesto.length);
          if (proporcion < 0.65) return mejor;
          return Math.max(
            mejor,
            similitudTokenFlexible(consultaCompuesta, nombreCompuesto)
          );
        },
        0
      )
    : 0;
  return {
    score: Math.max(
      frase,
      promedio * 0.75 + cobertura * 0.25,
      similitudCompuesta
    ),
    exacta: false,
  };
}

function coincidenciaIdentidadVisual(terminos = [], nombre = "") {
  const tokensConsulta = tokensIdentidadVisual(terminos.join(" "));
  const tokensNombre = tokensIdentidadVisual(nombre);
  if (!tokensConsulta.length || !tokensNombre.length) {
    return { score: 0, exacta: false };
  }

  const mejorCoincidencia = (token, candidatos) =>
    candidatos.reduce((maximo, candidato) => {
      if (token === candidato) return 1;
      if (token.length <= 3 || candidato.length <= 3) return maximo;
      return Math.max(maximo, similitudTexto(token, candidato));
    }, 0);

  const coberturaConsulta =
    tokensConsulta.reduce(
      (suma, token) => suma + mejorCoincidencia(token, tokensNombre),
      0
    ) / tokensConsulta.length;
  const coberturaNombre =
    tokensNombre.reduce(
      (suma, token) => suma + mejorCoincidencia(token, tokensConsulta),
      0
    ) / tokensNombre.length;
  const score = Math.min(coberturaConsulta, coberturaNombre);

  return {
    score,
    exacta: score >= 0.96,
  };
}

function puntuarItem(item, terminos, opciones = {}) {
  const tokensMarca = new Set(
    normalizarIdentidadProducto(item.marca.marca).split(/\s+/).filter(Boolean)
  );
  const consultaSoloMarca =
    opciones.desambiguarMarca &&
    terminos.length > 0 &&
    terminos.every((termino) => tokensMarca.has(termino));
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
  ].flatMap((entrada) => {
    const coincidenciaTextual = coincidenciaNombre(terminos, entrada.nombre);
    const coincidenciaVisual = coincidenciaIdentidadVisual(
      terminos,
      entrada.nombre
    );
    const limitarMarcaEnReferencia =
      consultaSoloMarca && entrada.tipo !== "marca";

    return [
      {
        ...entrada,
        ...coincidenciaTextual,
        score:
          limitarMarcaEnReferencia && coincidenciaTextual.exacta
            ? 0.56
            : coincidenciaTextual.score,
        exacta:
          limitarMarcaEnReferencia && coincidenciaTextual.exacta
            ? false
            : coincidenciaTextual.exacta,
      },
      {
        ...entrada,
        tipo: entrada.tipo === "marca" ? "marca" : "identidad_visual",
        ...coincidenciaVisual,
        score:
          limitarMarcaEnReferencia && coincidenciaVisual.exacta
            ? 0.56
            : coincidenciaVisual.score,
        exacta:
          limitarMarcaEnReferencia && coincidenciaVisual.exacta
            ? false
            : coincidenciaVisual.exacta,
      },
    ];
  });
  const prioridadResultado = (resultado = {}) =>
    resultado.tipo === "marca" ? 0 : 1;
  resultados.sort(
    (a, b) => b.score - a.score || prioridadResultado(b) - prioridadResultado(a)
  );
  const mejor = resultados[0];
  const coincidenciaSoloMarca =
    opciones.desambiguarMarca && mejor?.tipo === "marca";
  return {
    ...item,
    score: coincidenciaSoloMarca ? 0.56 : mejor?.score || 0,
    exacta: coincidenciaSoloMarca ? false : Boolean(mejor?.exacta),
    nombreCoincidente: mejor?.nombre || null,
    tipoCoincidencia: mejor?.tipo || null,
  };
}

function normalizarEspecie(valor = "") {
  const texto = normalizar(valor || "");
  if (/\b(gato|cat|feline|felino)\b/.test(texto)) return "gato";
  if (/\b(perro|dog|canine|canino)\b/.test(texto)) return "perro";
  if (/\b(ave|aves|pajaro|pajaros)\b/.test(texto)) return "ave";
  if (/\b(roedor|roedores|hamster|conejo|cobayo)\b/.test(texto)) return "roedor";
  if (/\b(pez|peces)\b/.test(texto)) return "pez";
  if (/\b(equino|caballo|caballos)\b/.test(texto)) return "equino";
  if (/\b(bovino|vaca|ganado)\b/.test(texto)) return "bovino";
  return null;
}

function normalizarCategoria(valor = "") {
  const texto = normalizar(valor || "").replace(/_/g, " ");
  if (/\b(arena|sustrato|tofu)\b/.test(texto)) return "arena_sustrato";
  if (/\b(snack|premio|galleta)\b/.test(texto)) return "snack";
  if (/\b(juguete|pelota|mordedor)\b/.test(texto)) return "juguete";
  if (/\b(accesorio|collar|cama|comedero)\b/.test(texto)) return "accesorio";
  if (/\b(champu|shampoo|higiene)\b/.test(texto)) return "higiene";
  if (/\b(vitamina|suplemento)\b/.test(texto)) return "suplemento";
  if (
    /\b(medicamento|medicina|antipulgas|desparasitante|purgante)\b/.test(
      texto
    )
  ) {
    return "medicamento";
  }
  if (/\b(comida|alimento|concentrado|cuido)\b/.test(texto)) return "comida";
  return null;
}

function normalizarEtapa(valor = "") {
  const texto = normalizar(valor || "");
  if (/\b(senior|mayor|mayores|viejo|viejito)\b/.test(texto)) {
    return "senior";
  }
  if (/\b(cach|cachorro|cachorros|puppy|kitten|gatito|gatitos|bebe)\b/.test(texto)) {
    return "cachorro";
  }
  if (/\b(adult|adulto|adultos)\b/.test(texto)) return "adulto";
  return null;
}

function normalizarTamano(valor = "") {
  const texto = normalizar(valor || "");
  if (
    /\b(todas las razas|todos los tamanos|all breeds|all sizes)\b/.test(texto)
  ) {
    return "todas";
  }
  if (
    /\b(rp|peq|mini|small|pequeno|pequena|pequenos|pequenas)\b/.test(texto)
  ) {
    return "pequeno";
  }
  if (
    /\b(rg|rmg|gran|grand|medium|large|mediano|mediana|medianos|medianas|grande|grandes)\b/.test(
      texto
    )
  ) {
    return "grande";
  }
  return null;
}

function etapaReferencia(referencia = {}) {
  return (
    normalizarEtapa(
      `${referencia.nombre || ""} ${referencia.descripcion || ""}`
    ) || normalizarEtapa(referencia.etapa)
  );
}

function tamanoReferencia(referencia = {}) {
  return (
    normalizarTamano(
      `${referencia.nombre || ""} ${referencia.descripcion || ""}`
    ) || normalizarTamano(referencia.tamano)
  );
}

function condicionesProducto(texto = "", condiciones = []) {
  const normalizado = normalizar(
    `${texto} ${(condiciones || []).join(" ")}`
  );
  const resultado = [];
  const agregar = (valor) => {
    if (!resultado.includes(valor)) resultado.push(valor);
  };
  if (/\b(urin|urinay|uninar|uro|urinary|urology)\w*\b/.test(normalizado)) {
    agregar("urinario");
  }
  if (/\b(renal|kidney)\w*\b/.test(normalizado)) agregar("renal");
  if (/\b(gastro|digestive)\w*\b/.test(normalizado)) {
    agregar("gastrointestinal");
  }
  if (/\b(derm|skin|piel|atopic)\w*\b/.test(normalizado)) agregar("piel");
  if (/\b(obes|weight|sobrepeso)\w*\b/.test(normalizado)) {
    agregar("control_peso");
  }
  if (/\b(castr|steriliz|esteriliz)\w*\b/.test(normalizado)) {
    agregar("castrado");
  }
  if (/\b(indoor|interior)\w*\b/.test(normalizado)) agregar("indoor");
  if (/\b(sensitiv|sensible)\w*\b/.test(normalizado)) agregar("sensitive");
  if (/\b(hypo|hipoalerg)\w*\b/.test(normalizado)) agregar("hipoalergenico");
  if (/\b(hairball|bola de pelo)\b/.test(normalizado)) agregar("bola_pelo");
  return resultado;
}

function saboresProducto(texto = "", sabores = []) {
  const normalizado = normalizar(`${texto} ${(sabores || []).join(" ")}`);
  return [
    ["pollo", /\b(pollo|chicken)\b/],
    ["salmon", /\b(salmon)\b/],
    ["cordero", /\b(cordero|lamb)\b/],
    ["carne", /\b(carne|beef)\b/],
    ["pavo", /\b(pavo|turkey)\b/],
    ["atun", /\b(atun|tuna)\b/],
  ]
    .filter(([, patron]) => patron.test(normalizado))
    .map(([sabor]) => sabor);
}

function formatosProducto(texto = "") {
  const normalizado = normalizar(texto);
  const resultado = [];
  const agregar = (valor) => {
    if (!resultado.includes(valor)) resultado.push(valor);
  };
  if (/\b(lata|can)\b/.test(normalizado)) agregar("lata");
  if (/\b(pouch|pouche|sobre|sachet)\b/.test(normalizado)) agregar("pouch");
  return resultado;
}

function pideLineaBaseOriginal(interpretacion = null, mensaje = "") {
  const producto =
    interpretacion?.producto ||
    (interpretacion?.productos?.length === 1 ? interpretacion.productos[0] : {});
  const texto = normalizar(
    [
      producto.referencia,
      producto.linea,
      producto.textoVisible,
      mensaje,
    ]
      .filter(Boolean)
      .join(" ")
  );
  return /\b(original|tradicional|clasico|clasica|normal|regular)\b/.test(texto);
}

function referenciaTieneLineaNoBase(referencia = {}) {
  const texto = normalizar(
    [
      referencia.nombre,
      referencia.descripcion,
      ...(referencia.metadata?.original_names || []),
      ...(referencia.metadata?.equivalent_references || []),
      ...(referencia.metadata?.aliases || []),
    ]
      .filter(Boolean)
      .join(" ")
  );
  return /\b(premium|premiun|pro|plus|vitality|vitalidad|gold|gourmet)\b/.test(texto);
}

function especieExplicita(texto = "") {
  const normalizado = normalizar(texto);
  if (/\b(gato|gatos|cat|cats|feline|felino|felina)\b/.test(normalizado)) {
    return "gato";
  }
  if (/\b(perro|perros|dog|dogs|canine|canino|canina)\b/.test(normalizado)) {
    return "perro";
  }
  return null;
}

function tokenEsCondicion(token = "") {
  return /^(?:urin|uninar|uro|urology|renal|kidney|gastro|digest|derm|skin|piel|atopic|obes|weight|sobrepeso|castr|steriliz|esteriliz|indoor|interior|sensitiv|sensible|hypo|hipoalerg|hairball)/.test(
    token
  );
}

function tokensIdentidadReferencia(marca, referencia) {
  const tokensMarca = new Set(
    normalizar(marca.marca).split(/\s+/).filter(Boolean)
  );
  const ignorados = new Set([
    "cat",
    "cats",
    "gato",
    "gatos",
    "feline",
    "felino",
    "felina",
    "dog",
    "dogs",
    "perro",
    "perros",
    "canine",
    "canino",
    "canina",
    "diet",
    "diets",
    "dieta",
    "veterinary",
    "veterinaria",
    "veterinario",
    "formula",
    "linea",
  ]);

  return normalizar(referencia.nombre)
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !tokensMarca.has(token))
    .filter((token) => !ignorados.has(token))
    .filter((token) => !tokenEsCondicion(token));
}

function similitudTokensIdentidad(izquierda = [], derecha = []) {
  if (!izquierda.length && !derecha.length) return 1;
  if (!izquierda.length || !derecha.length) return 0;

  const cobertura = (origen, destino) =>
    origen.reduce((suma, token) => {
      const mejor = destino.reduce(
        (maximo, candidato) =>
          Math.max(maximo, similitudTexto(token, candidato)),
        0
      );
      return suma + mejor;
    }, 0) / origen.length;

  return Math.min(
    cobertura(izquierda, derecha),
    cobertura(derecha, izquierda)
  );
}

function mismasCondiciones(izquierda = [], derecha = []) {
  if (izquierda.length !== derecha.length) return false;
  return izquierda.every((condicion) => derecha.includes(condicion));
}

function referenciasEquivalentes(itemA, itemB) {
  const marcaA = normalizar(itemA.marca.marca);
  const marcaB = normalizar(itemB.marca.marca);
  const comparacionVisual = [itemA, itemB].some(
    (item) => typeof item.componentesVisuales?.marca === "number"
  );
  if (
    marcaA !== marcaB &&
    (
      !comparacionVisual ||
      similitudTokenFlexible(marcaA, marcaB) < MIN_SIMILITUD_MARCA_VISUAL
    )
  ) {
    return false;
  }

  const especieA = especieExplicita(itemA.referencia.nombre);
  const especieB = especieExplicita(itemB.referencia.nombre);
  if (especieA && especieB && especieA !== especieB) return false;

  const condicionesA = condicionesProducto(
    `${itemA.referencia.nombre} ${itemA.referencia.descripcion || ""}`
  );
  const condicionesB = condicionesProducto(
    `${itemB.referencia.nombre} ${itemB.referencia.descripcion || ""}`
  );
  if (
    (condicionesA.length || condicionesB.length) &&
    !mismasCondiciones(condicionesA, condicionesB)
  ) {
    return false;
  }

  const identidadA = tokensIdentidadReferencia(itemA.marca, itemA.referencia);
  const identidadB = tokensIdentidadReferencia(itemB.marca, itemB.referencia);
  if (condicionesA.length && !identidadA.length && !identidadB.length) {
    return true;
  }

  return similitudTokensIdentidad(identidadA, identidadB) >= 0.86;
}

function compatibleConSenales(item, interpretacion, mensaje = "") {
  const señales = señalesInterpretadas(interpretacion, mensaje);
  const categoriaReferencia = normalizarCategoria(item.referencia.categoria);
  const condicionesReferencia = condicionesProducto(
    `${item.referencia.nombre} ${item.referencia.descripcion || ""}`
  );
  if (
    señales.categoria &&
    categoriaReferencia &&
    señales.categoria !== categoriaReferencia
  ) {
    return false;
  }
  if (
    señales.condiciones.length &&
    !señales.condiciones.every((condicion) =>
      condicionesReferencia.includes(condicion)
    )
  ) {
    return false;
  }

  const especieNombre = especieExplicita(item.referencia.nombre);
  if (
    señales.especie &&
    especieNombre &&
    señales.especie !== especieNombre
  ) {
    return false;
  }

  if (!item.exacta) {
    const etapa = etapaReferencia(item.referencia);
    if (señales.etapa && etapa && señales.etapa !== etapa) return false;

    const tamano = tamanoReferencia(item.referencia);
    if (señales.tamano && tamano && señales.tamano !== tamano) return false;
  }

  return true;
}

function agruparReferenciasEquivalentes(items = []) {
  const grupos = [];
  items.forEach((item) => {
    const grupo = grupos.find((actual) =>
      actual.items.some((existente) =>
        referenciasEquivalentes(existente, item)
      )
    );
    if (grupo) {
      grupo.items.push(item);
    } else {
      grupos.push({ items: [item] });
    }
  });

  return grupos
    .map((grupo) => {
      grupo.items.sort((a, b) => b.score - a.score);
      const primero = grupo.items[0];
      return {
        ...primero,
        items: grupo.items,
        score: Math.max(...grupo.items.map((item) => item.score)),
        exacta: grupo.items.some((item) => item.exacta),
        coincidenciaReferenciaExacta: grupo.items.some(
          (item) => item.exacta && item.tipoCoincidencia !== "marca"
        ),
        senalesFuertesCoincidentes: Math.max(
          ...grupo.items.map(
            (item) => item.senalesFuertesCoincidentes || 0
          )
        ),
        presentacionCoincide: grupo.items.some(
          (item) => item.presentacionCoincide === true
        )
          ? true
          : grupo.items.every((item) => item.presentacionCoincide === false)
            ? false
            : null,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function señalesInterpretadas(interpretacion = null, mensaje = "") {
  const producto =
    interpretacion?.producto ||
    (interpretacion?.productos?.length === 1 ? interpretacion.productos[0] : {});
  const texto = [
    producto.marca,
    producto.referencia,
    producto.linea,
    producto.textoVisible,
    producto.especie,
    producto.etapa,
    producto.tamano,
    ...(producto.sabores || []),
    mensaje,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    marca: producto.marca || null,
    linea: producto.linea || null,
    textoVisible: producto.textoVisible || null,
    categoria:
      normalizarCategoria(producto.categoria) ||
      normalizarCategoria(texto),
    especie:
      normalizarEspecie(producto.especie) ||
      normalizarEspecie(texto),
    etapa:
      normalizarEtapa(producto.etapa) ||
      normalizarEtapa(texto),
    tamano:
      normalizarTamano(producto.tamano) ||
      normalizarTamano(texto),
    condiciones: condicionesProducto(
      texto,
      producto.condiciones
    ),
    sabores: saboresProducto(texto, producto.sabores),
    formatos: formatosProducto(texto),
  };
}

function scoreMarcaVisual(item, señales) {
  if (!señales.marca) return null;
  const terminosMarca = tokensDistintivos(señales.marca);
  if (!terminosMarca.length) return null;
  return coincidenciaNombre(terminosMarca, item.marca.marca).score;
}

function scoreLineaVisual(item, señales, condicionesReferencia) {
  if (señales.condiciones.length) {
    return señales.condiciones.every((condicion) =>
      condicionesReferencia.includes(condicion)
    )
      ? 1
      : 0;
  }

  const terminosLinea = tokensDistintivos(señales.linea || "");
  if (!terminosLinea.length) return null;
  return coincidenciaNombre(
    terminosLinea,
    `${item.referencia.nombre} ${item.referencia.descripcion || ""}`
  ).score;
}

function scoreSaborVisual(señales, saboresReferencia) {
  if (!señales.sabores.length) return null;
  const coincidencias = señales.sabores.filter((sabor) =>
    saboresReferencia.includes(sabor)
  ).length;
  return coincidencias / señales.sabores.length;
}

function calcularScoreVisualPonderado({
  item,
  señales,
  presentacionCoincide,
  especieCoincide,
  condicionesReferencia,
  saboresReferencia,
}) {
  const componentes = {
    marca: scoreMarcaVisual(item, señales),
    linea: scoreLineaVisual(item, señales, condicionesReferencia),
    especie: señales.especie ? (especieCoincide === true ? 1 : 0) : null,
    presentacion:
      presentacionCoincide === null
        ? null
        : presentacionCoincide
          ? 1
          : 0,
    sabor: scoreSaborVisual(señales, saboresReferencia),
  };
  let score = 0;
  let pesoDisponible = 0;

  Object.entries(componentes).forEach(([componente, valor]) => {
    if (valor === null) return;
    const peso = PESOS_MATCH_VISUAL[componente];
    pesoDisponible += peso;
    score += peso * valor;
  });

  return {
    componentes,
    pesoDisponible,
    score: Math.max(0, Math.min(1, score)),
  };
}

function ajustarPorSenales(item, mensaje, interpretacion, clasificacion = {}) {
  const coincide = presentacionCoincide(
    item.referencia,
    mensaje,
    interpretacion
  );
  const señales = señalesInterpretadas(interpretacion, mensaje);
  const categoriaReferencia = normalizarCategoria(item.referencia.categoria);
  const especieReferencia = normalizarEspecie(item.referencia.especie);
  const condicionesReferencia = condicionesProducto(
    `${item.referencia.nombre} ${item.referencia.descripcion || ""}`
  );
  const saboresReferencia = saboresProducto(
    `${item.referencia.nombre} ${item.referencia.descripcion || ""}`
  );
  const formatosReferencia = formatosProducto(
    `${item.referencia.nombre} ${item.referencia.descripcion || ""}`
  );
  const etapa = etapaReferencia(item.referencia);
  const tamano = tamanoReferencia(item.referencia);
  const esVision = Boolean(clasificacion.requiereVision);
  let ajuste =
    coincide === true
      ? esVision
        ? 0.12
        : 0.05
      : coincide === false
        ? esVision
          ? -0.28
          : -0.05
        : 0;

  if (señales.categoria && categoriaReferencia) {
    ajuste += señales.categoria === categoriaReferencia ? 0.1 : -0.22;
  }
  if (señales.especie && especieReferencia) {
    ajuste += señales.especie === especieReferencia ? 0.07 : -0.24;
  }
  señales.condiciones.forEach((condicion) => {
    ajuste += condicionesReferencia.includes(condicion) ? 0.12 : -0.2;
  });
  if (!señales.condiciones.length && condicionesReferencia.length) {
    ajuste -= 0.22;
  }
  señales.formatos.forEach((formato) => {
    ajuste += formatosReferencia.includes(formato) ? 0.08 : -0.12;
  });
  if (!señales.formatos.length && formatosReferencia.length) {
    ajuste -= 0.12;
  }
  let scoreMaximo = 1;
  if (!señales.condiciones.length && condicionesReferencia.length) {
    scoreMaximo = Math.min(scoreMaximo, 0.66);
  }
  if (!señales.formatos.length && formatosReferencia.length) {
    scoreMaximo = Math.min(scoreMaximo, 0.66);
  }
  if (señales.etapa && etapa) {
    ajuste += señales.etapa === etapa ? 0.1 : -0.22;
  } else if (señales.etapa && !etapa) {
    ajuste -= 0.06;
  }
  if (señales.tamano && tamano) {
    ajuste += señales.tamano === tamano ? 0.14 : -0.24;
  } else if (señales.tamano && !tamano) {
    ajuste += esVision && coincide === true ? 0 : -0.12;
  }

  if (esVision && pideLineaBaseOriginal(interpretacion, mensaje)) {
    if (referenciaTieneLineaNoBase(item.referencia)) {
      ajuste -= 0.28;
    } else if (coincide === true) {
      ajuste += 0.38;
    }
  }

  const especieCoincide =
    señales.especie && especieReferencia
      ? señales.especie === especieReferencia
      : null;
  const categoriaCoincide =
    señales.categoria && categoriaReferencia
      ? señales.categoria === categoriaReferencia
      : null;
  const etapaCoincide =
    señales.etapa && etapa ? señales.etapa === etapa : null;
  const tamanoCoincide =
    señales.tamano && tamano ? señales.tamano === tamano : null;
  const condicionesCoinciden =
    señales.condiciones.length > 0 &&
    señales.condiciones.every((condicion) =>
      condicionesReferencia.includes(condicion)
    );
  const ponderacionVisual = calcularScoreVisualPonderado({
    item,
    señales,
    presentacionCoincide: coincide,
    especieCoincide,
    condicionesReferencia,
    saboresReferencia,
  });
  const senalesFuertesCoincidentes = [
    coincide === true,
    categoriaCoincide === true,
    especieCoincide === true,
    etapaCoincide === true,
    tamanoCoincide === true,
    condicionesCoinciden,
  ].filter(Boolean).length;

  const scoreAjustado = Math.max(
    0,
    Math.min(1, scoreMaximo, item.score + ajuste)
  );
  const usaPonderacionVisual = Boolean(
    esVision &&
      (
        ponderacionVisual.componentes.linea !== null ||
        (
          ponderacionVisual.componentes.marca !== null &&
          ponderacionVisual.componentes.presentacion !== null
        )
      )
  );
  const scoreCombinado = usaPonderacionVisual
    ? scoreAjustado * 0.58 + ponderacionVisual.score * 0.42
    : scoreAjustado;
  const coincidenciaComercialExacta = Boolean(
    item.exacta && item.tipoCoincidencia !== "marca"
  );

  return {
    ...item,
    scoreBase: item.score,
    score: coincidenciaComercialExacta
      ? Math.max(scoreCombinado, 0.9)
      : scoreCombinado,
    scoreVisualPonderado: ponderacionVisual.score,
    pesoVisualDisponible: ponderacionVisual.pesoDisponible,
    componentesVisuales: ponderacionVisual.componentes,
    presentacionCoincide: coincide,
    categoriaCoincide,
    especieCoincide,
    etapaCoincide,
    tamanoCoincide,
    condicionesCoinciden,
    senalesFuertesCoincidentes,
  };
}

function filtrarPorSenalesEspecificas(
  items = [],
  interpretacion,
  clasificacion = {},
  mensaje = ""
) {
  if (!clasificacion.requiereVision) return items;
  const señales = señalesInterpretadas(interpretacion, mensaje);
  let filtrados = items;

  [
    [señales.categoria, "categoriaCoincide"],
    [señales.condiciones.length, "condicionesCoinciden"],
  ].forEach(([senal, propiedad]) => {
    if (!senal || !filtrados.some((item) => item[propiedad] === true)) return;
    filtrados = filtrados.filter((item) => item[propiedad] === true);
  });

  if (
    señales.linea &&
    !señales.condiciones.length &&
    filtrados.some(
      (item) => (item.componentesVisuales?.linea || 0) >= 0.78
    )
  ) {
    filtrados = filtrados.filter(
      (item) => (item.componentesVisuales?.linea || 0) >= 0.78
    );
  }

  [
    ["etapa", "etapaCoincide"],
    ["tamano", "tamanoCoincide"],
  ].forEach(([senal, propiedad]) => {
    if (!señales[senal] || !filtrados.some((item) => item[propiedad] === true)) {
      return;
    }
    const existeCoincidenciaEspecificaConPresentacion = filtrados.some(
      (item) => item[propiedad] === true && item.presentacionCoincide === true
    );
    filtrados = filtrados.filter(
      (item) =>
        item[propiedad] === true ||
        (!existeCoincidenciaEspecificaConPresentacion &&
          item[propiedad] === null &&
          item.presentacionCoincide === true &&
          item.categoriaCoincide !== false &&
          item.especieCoincide !== false) ||
        (item.exacta && item.tipoCoincidencia !== "marca")
    );
  });

  return filtrados;
}

function terminosInterpretados(interpretacion = null) {
  const producto =
    interpretacion?.producto ||
    (interpretacion?.productos?.length === 1 ? interpretacion.productos[0] : {});
  return tokensDistintivos(
    [
      producto.marca,
      producto.referencia,
      producto.linea,
      ...(producto.condiciones || []),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function terminosEtiquetaInterpretada(interpretacion = null) {
  const producto =
    interpretacion?.producto ||
    (interpretacion?.productos?.length === 1 ? interpretacion.productos[0] : {});
  return tokensDistintivos(
    [
      producto.marca,
      producto.referencia || producto.linea || producto.textoVisible,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function obtenerPresentacionSolicitada(mensaje, interpretacion) {
  const producto =
    interpretacion?.producto ||
    (interpretacion?.productos?.length === 1 ? interpretacion.productos[0] : {});
  return normalizarPeso(
    producto.presentacion ||
      mensaje.match(
        /(?:\b(?:x|por)\s*)?\d+(?:[.,]\d+)?\s*(?:kg|kl|kr|kilos?|kilogramos?|g|gr|gramos?|lb|libras?)\b/i
      )?.[0] ||
      ""
  );
}

function presentacionCoincide(referencia, mensaje, interpretacion) {
  const solicitada = obtenerPresentacionSolicitada(mensaje, interpretacion);
  if (!solicitada) return null;
  return (referencia.presentaciones || []).some(
    (presentacion) => normalizarPeso(presentacion.peso) === solicitada
  );
}

function consultaTraeDetalleAdicional(terminos = [], marcaExacta = null) {
  if (!marcaExacta) return false;
  const tokensMarca = new Set(
    normalizarIdentidadProducto(marcaExacta).split(/\s+/).filter(Boolean)
  );
  return terminos.some((termino) => !tokensMarca.has(termino));
}

function estaEnCandidatos(item, catalogoCandidatos = []) {
  if (item.items?.length) {
    return item.items.some((integrante) =>
      estaEnCandidatos(integrante, catalogoCandidatos)
    );
  }
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
  const integrantes = item.items?.length ? item.items : [item];
  const nombres = [...new Set(integrantes.map((actual) => actual.referencia.nombre))];
  const integranteCanonico = [...integrantes].sort((a, b) => {
    const marcaA = a.componentesVisuales?.marca;
    const marcaB = b.componentesVisuales?.marca;
    const diferenciaMarca =
      (typeof marcaB === "number" ? marcaB : -1) -
      (typeof marcaA === "number" ? marcaA : -1);
    if (Math.abs(diferenciaMarca) > 0.001) return diferenciaMarca;
    return (
      normalizar(b.referencia.nombre).length -
      normalizar(a.referencia.nombre).length
    );
  })[0];
  const referenciaCanonica = integranteCanonico.referencia.nombre;
  const referenciaCatalogo =
    integrantes.find((actual) => actual.presentacionCoincide === true)
      ?.referencia.nombre || integrantes[0].referencia.nombre;
  const presentaciones = [];
  const vistas = new Set();
  integrantes.forEach((actual) => {
    (actual.referencia.presentaciones || []).forEach((presentacion) => {
      const clave = `${normalizarPeso(presentacion.peso)}::${presentacion.precio}`;
      if (vistas.has(clave)) return;
      vistas.add(clave);
      presentaciones.push({
        peso: presentacion.peso,
        precio: presentacion.precio,
        stock:
          typeof presentacion.stock === "boolean" ? presentacion.stock : null,
        referencia: actual.referencia.nombre,
      });
    });
  });

  return {
    marca: integranteCanonico.marca.marca,
    referencia: referenciaCanonica,
    referenciaCatalogo,
    referenciasEquivalentes: nombres,
    score: Number(item.score.toFixed(3)),
    tipoCoincidencia: item.tipoCoincidencia,
    presentaciones,
  };
}

function validarCoincidenciaProducto({
  mensaje = "",
  catalogo = [],
  catalogoCandidatos = [],
  clasificacion = {},
  interpretacion = null,
  contextoProducto = null,
} = {}) {
  const intencionProducto = [
    "precio",
    "busqueda_producto",
    "referencia_producto",
    "imagen",
    "audio",
  ].includes(clasificacion.intencion);
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

  const mensajeRazonado = construirConsultaProductoContextual(
    mensaje,
    contextoProducto
  );
  const terminosMensaje = clasificacion.requiereVision
    ? []
    : tokensDistintivos(mensajeRazonado, { inferirEspeciePorRaza: true });
  const terminosVisibles = clasificacion.requiereVision
    ? []
    : tokensDistintivos(limpiarMarcadoresCorreccion(mensaje));
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
    (item) =>
      !marcaExacta ||
      normalizar(item.marca.marca) === marcaExacta ||
      (
        clasificacion.requiereVision &&
        similitudTokenFlexible(item.marca.marca, marcaExacta) >=
          MIN_SIMILITUD_MARCA_VISUAL
      )
  );
  const puntuadosSinFiltrar = itemsEvaluados
    .map((item) =>
      puntuarItem(item, terminos, {
        desambiguarMarca:
          clasificacion.requiereVision ||
          consultaTraeDetalleAdicional(terminos, marcaExacta),
      })
    )
    .map((item) =>
      ajustarPorSenales(item, mensajeRazonado, interpretacion, clasificacion)
    )
    .filter((item) =>
      compatibleConSenales(item, interpretacion, mensajeRazonado)
    )
    .sort((a, b) => b.score - a.score);
  const puntuados = filtrarPorSenalesEspecificas(
    puntuadosSinFiltrar,
    interpretacion,
    clasificacion,
    mensajeRazonado
  );
  const gruposPuntuados = agruparReferenciasEquivalentes(puntuados);
  const [primero, segundo] = gruposPuntuados;
  const high = numeroEnv("CATALOG_MATCH_HIGH_THRESHOLD", DEFAULT_HIGH_THRESHOLD);
  const medium = numeroEnv("CATALOG_MATCH_MEDIUM_THRESHOLD", DEFAULT_MEDIUM_THRESHOLD);
  const margin = numeroEnv("CATALOG_MATCH_AMBIGUITY_MARGIN", DEFAULT_AMBIGUITY_MARGIN);
  const diferencia = (primero?.score || 0) - (segundo?.score || 0);
  const enCandidatos = primero ? estaEnCandidatos(primero, catalogoCandidatos) : false;
  const confianzaIA = Number(interpretacion?.confianza || 0);
  const presentacionValida = primero?.presentacionCoincide ?? null;
  const coincidenciaReferenciaExacta = Boolean(
    primero?.coincidenciaReferenciaExacta
  );
  const evidenciaVisualFuerte = Boolean(
    clasificacion.requiereVision &&
      primero?.score >= high &&
      primero?.senalesFuertesCoincidentes >= 2 &&
      (!segundo || diferencia >= Math.min(margin, 0.04))
  );
  const evidenciaEstructuradaFuerte = Boolean(
    primero?.score >= high &&
      primero?.senalesFuertesCoincidentes >= 2 &&
      (!segundo || diferencia >= Math.min(margin, 0.04))
  );
  const evidenciaLexicaFuerte = Boolean(
    primero?.scoreBase >= high &&
      primero?.tipoCoincidencia !== "marca" &&
      (!segundo || diferencia >= margin)
  );

  let nivel = "baja";
  let razon = "sin_coincidencia_confiable";
  const exactaSinAmbiguedad =
    coincidenciaReferenciaExacta &&
    (!segundo || diferencia >= margin);
  const presentacionDesambigua = Boolean(
    (coincidenciaReferenciaExacta || evidenciaVisualFuerte || primero?.score >= high) &&
      primero.presentacionCoincide === true &&
      (!segundo || segundo.presentacionCoincide === false) &&
      diferencia >= Math.min(margin, 0.04)
  );

  if (
    primero &&
    (coincidenciaReferenciaExacta || primero.score >= high) &&
    (
      !segundo ||
      diferencia >= margin ||
      exactaSinAmbiguedad ||
      presentacionDesambigua ||
      evidenciaVisualFuerte ||
      evidenciaEstructuradaFuerte
    ) &&
    (enCandidatos ||
      !catalogoCandidatos.length ||
      evidenciaVisualFuerte ||
      evidenciaEstructuradaFuerte ||
      evidenciaLexicaFuerte)
  ) {
    nivel = "alta";
    razon = evidenciaVisualFuerte
      ? "senales_visuales_convergentes"
      : coincidenciaReferenciaExacta
        ? "nombre_exacto"
        : evidenciaEstructuradaFuerte
          ? "senales_convergentes"
          : evidenciaLexicaFuerte
            ? "similitud_lexica_catalogo_completo"
        : "similitud_alta";
  } else if (primero && primero.score >= medium) {
    nivel = "media";
    razon = diferencia < margin ? "ambigua" : "similitud_media";
  }

  if (
    usaInterpretacion &&
    nivel === "alta" &&
    !coincidenciaReferenciaExacta &&
    !evidenciaVisualFuerte &&
    confianzaIA < 0.85
  ) {
    nivel = "media";
    razon = "entidad_multimedia_por_confirmar";
  }

  return {
    nivel,
    razon,
    terminos,
    etiqueta: (
      terminosVisibles.length
        ? terminosVisibles
        : terminosEtiquetaInterpretada(interpretacion)
    ).join(" "),
    score: Number((primero?.score || 0).toFixed(3)),
    diferencia: Number(diferencia.toFixed(3)),
    usaInterpretacion,
    marcaExacta,
    presentacionValida,
    presentacionSolicitada: obtenerPresentacionSolicitada(
      mensajeRazonado,
      interpretacion
    ) || null,
    coincidencia: nivel === "alta" && primero ? resumirAlternativa(primero) : null,
    alternativas: gruposPuntuados
      .filter((item) => item.score >= medium)
      .slice(0, numeroEnv("CATALOG_MATCH_ALTERNATIVE_LIMIT", DEFAULT_ALTERNATIVE_LIMIT))
      .map(resumirAlternativa),
  };
}

function etiquetaConsulta(validacion = {}) {
  const tokens = [
    ...new Set(
      normalizar(
        validacion.etiqueta || validacion.terminos?.join(" ") || ""
      )
        .split(/\s+/)
        .filter(Boolean)
    ),
  ];
  return tokens.join(" ").toUpperCase() || "ese producto";
}

function respuestaValidacionProducto(validacion = {}) {
  if (validacion.nivel === "media" && validacion.alternativas?.length) {
    const opciones = validacion.alternativas
      .map((item) => {
        const presentaciones = (item.presentaciones || [])
          .filter((presentacion) => presentacion.precio !== null && presentacion.precio !== undefined)
          .map(
            (presentacion) =>
              `${presentacion.peso}: ${formatearPrecio(presentacion.precio)}`
          )
          .join(", ");
        return `- ${item.referencia}${
          presentaciones ? `: ${presentaciones}` : ""
        }`;
      })
      .join("\n");
    const [primera, segunda] = validacion.alternativas;
    const cierre = segunda
      ? `¿Buscas ${primera.referencia} o ${segunda.referencia}?`
      : "No alcanzo a distinguir un dato del empaque. ¿Me envías una foto más cerca del nombre o el peso?";
    const apertura = segunda
      ? "Veo estas referencias muy parecidas:"
      : "Alcancé a identificar esta opción:";
    return `${apertura}\n\n${opciones}\n\n${cierre}`;
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

  const permiteReferenciaValidada =
    coincidencia.tipoCoincidencia !== "marca" ||
    ["senales_visuales_convergentes", "senales_convergentes"].includes(
      validacion.razon
    );

  if (permiteReferenciaValidada && coincidencia.referencia) {
    const presentacionSolicitada = normalizarPeso(
      producto.presentacion || validacion.presentacionSolicitada || ""
    );
    const referenciaPorPresentacion = presentacionSolicitada
      ? coincidencia.presentaciones?.find(
          (presentacion) =>
            normalizarPeso(presentacion.peso) === presentacionSolicitada
        )?.referencia
      : null;
    productoValidado.referencia =
      referenciaPorPresentacion ||
      coincidencia.referenciaCatalogo ||
      coincidencia.referencia;
    productoValidado.nombreFamilia = coincidencia.referencia;
    productoValidado.referenciasEquivalentes =
      coincidencia.referenciasEquivalentes || [productoValidado.referencia];
    productoValidado.presentacionesEquivalentes =
      coincidencia.presentaciones || [];
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
  construirConsultaProductoContextual,
  esCorreccionProducto,
  respuestaValidacionProducto,
  validarCoincidenciaProducto,
  _internals: {
    distanciaLevenshtein,
    referenciasEquivalentes,
    similitudTokenFlexible,
    similitudTexto,
    tokensDistintivos,
  },
};
