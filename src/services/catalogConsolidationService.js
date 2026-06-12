const { normalizar, normalizarPeso } = require("../utils/text");

const MIN_SIMILITUD_MARCA = 0.76;
const MIN_SIMILITUD_REFERENCIA = 0.84;

function distanciaDamerauLevenshtein(a = "", b = "") {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matriz = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i += 1) matriz[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matriz[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      matriz[i][j] = Math.min(
        matriz[i - 1][j] + 1,
        matriz[i][j - 1] + 1,
        matriz[i - 1][j - 1] + costo
      );

      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        matriz[i][j] = Math.min(
          matriz[i][j],
          matriz[i - 2][j - 2] + costo
        );
      }
    }
  }

  return matriz[a.length][b.length];
}

function similitudOrtografica(a = "", b = "") {
  const izquierda = normalizar(a).replace(/\s+/g, "");
  const derecha = normalizar(b).replace(/\s+/g, "");
  if (!izquierda || !derecha) return 0;
  if (izquierda === derecha) return 1;
  return (
    1 -
    distanciaDamerauLevenshtein(izquierda, derecha) /
      Math.max(izquierda.length, derecha.length)
  );
}

function identidadReferencia(marca = "", referencia = "") {
  const marcaNormalizada = normalizar(marca);
  let identidad = normalizar(referencia)
    .replace(
      /\b(?:x|por)?\s*\d+(?:\.\d+)?\s*(?:kg|g|gr|lb|ml|mg|unidad|unidades)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  if (
    marcaNormalizada &&
    (identidad === marcaNormalizada ||
      identidad.startsWith(`${marcaNormalizada} `))
  ) {
    identidad = identidad.slice(marcaNormalizada.length).trim();
  }

  return identidad;
}

function tokensIdentidad(marca, referencia) {
  return identidadReferencia(marca, referencia)
    .split(/\s+/)
    .filter(Boolean);
}

function similitudToken(token, candidato) {
  if (token === candidato) return 1;
  if (Math.min(token.length, candidato.length) <= 3) return 0;
  return similitudOrtografica(token, candidato);
}

function coberturaTokens(origen = [], destino = []) {
  if (!origen.length || !destino.length) return 0;
  return (
    origen.reduce(
      (total, token) =>
        total +
        destino.reduce(
          (mejor, candidato) =>
            Math.max(mejor, similitudToken(token, candidato)),
          0
        ),
      0
    ) / origen.length
  );
}

function referenciasCompatibles(marcaA, referenciaA, marcaB, referenciaB) {
  if (
    referenciaA.especie &&
    referenciaB.especie &&
    normalizar(referenciaA.especie) !== normalizar(referenciaB.especie)
  ) {
    return false;
  }
  if (
    referenciaA.categoria &&
    referenciaB.categoria &&
    normalizar(referenciaA.categoria) !== normalizar(referenciaB.categoria)
  ) {
    return false;
  }

  const identidadA = identidadReferencia(marcaA.marca, referenciaA.nombre);
  const identidadB = identidadReferencia(marcaB.marca, referenciaB.nombre);
  const tokensA = tokensIdentidad(marcaA.marca, referenciaA.nombre);
  const tokensB = tokensIdentidad(marcaB.marca, referenciaB.nombre);
  const cobertura = Math.min(
    coberturaTokens(tokensA, tokensB),
    coberturaTokens(tokensB, tokensA)
  );

  return (
    similitudOrtografica(identidadA, identidadB) >=
      MIN_SIMILITUD_REFERENCIA ||
    cobertura >= MIN_SIMILITUD_REFERENCIA
  );
}

function marcasRelacionadas(marcaA, marcaB) {
  if (
    similitudOrtografica(marcaA.marca, marcaB.marca) <
    MIN_SIMILITUD_MARCA
  ) {
    return false;
  }

  return (marcaA.referencias || []).some((referenciaA) =>
    (marcaB.referencias || []).some((referenciaB) =>
      referenciasCompatibles(marcaA, referenciaA, marcaB, referenciaB)
    )
  );
}

function unirValoresUnicos(valores = []) {
  const vistos = new Set();
  return valores.filter((valor) => {
    const clave = normalizar(valor);
    if (!clave || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

function fusionarMetadata(referencias = []) {
  const principal = referencias[0]?.metadata || {};
  const nombresOriginales = unirValoresUnicos(
    referencias.flatMap((referencia) => [
      referencia.nombre,
      ...(referencia.metadata?.original_names || []),
    ])
  );
  return {
    ...principal,
    original_names: nombresOriginales,
    equivalent_references: unirValoresUnicos(
      referencias.map((referencia) => referencia.nombre)
    ),
  };
}

function inferirUnidadesPresentaciones(presentaciones = []) {
  const unidades = presentaciones
    .map((presentacion) =>
      normalizarPeso(presentacion.peso).match(/(kg|g|lb|ml|mg)$/)?.[1]
    )
    .filter(Boolean);
  const unidadesUnicas = [...new Set(unidades)];
  const unidadInferible =
    unidades.length >= 2 && unidadesUnicas.length === 1
      ? unidadesUnicas[0]
      : null;
  if (!unidadInferible) return presentaciones;

  return presentaciones.map((presentacion) => {
    const pesoOriginal = normalizar(presentacion.peso);
    const valorSinUnidad = pesoOriginal.match(
      /^(?:x|por)\s*(\d+(?:\.\d+)?)$/
    )?.[1];
    if (!valorSinUnidad) return presentacion;
    return {
      ...presentacion,
      peso: `${valorSinUnidad}${unidadInferible}`,
      metadata: {
        ...(presentacion.metadata || {}),
        original_weight: presentacion.peso,
        inferred_unit: unidadInferible,
      },
    };
  });
}

function fusionarPresentaciones(referencias = []) {
  const todas = referencias.flatMap((referencia) =>
    (referencia.presentaciones || []).map((presentacion) => ({
      referencia,
      presentacion,
    }))
  );
  const inferidas = inferirUnidadesPresentaciones(
    todas.map(({ presentacion }) => presentacion)
  );
  const presentaciones = [];
  const vistas = new Set();
  todas.forEach(({ referencia, presentacion }, index) => {
      const presentacionInferida = inferidas[index];
      const peso = normalizarPeso(presentacionInferida.peso);
      const clave = peso || normalizar(presentacion.peso);
      if (!clave || vistas.has(clave)) return;
      vistas.add(clave);
      presentaciones.push({
        ...presentacionInferida,
        metadata: {
          ...(presentacionInferida.metadata || {}),
          source_reference:
            presentacion.metadata?.source_reference || referencia.nombre,
        },
      });
  });
  return presentaciones;
}

function fusionarReferencias(marcas = [], marcaCanonica) {
  const entradas = marcas.flatMap((marca) =>
    (marca.referencias || []).map((referencia) => ({ marca, referencia }))
  );
  entradas.sort((a, b) => {
    const aCanonica = a.marca === marcaCanonica ? 1 : 0;
    const bCanonica = b.marca === marcaCanonica ? 1 : 0;
    return bCanonica - aCanonica;
  });

  const grupos = [];
  entradas.forEach((entrada) => {
    const grupo = grupos.find((actual) =>
      actual.some((existente) =>
        referenciasCompatibles(
          existente.marca,
          existente.referencia,
          entrada.marca,
          entrada.referencia
        )
      )
    );
    if (grupo) grupo.push(entrada);
    else grupos.push([entrada]);
  });

  return grupos.map((grupo) => {
    const candidatasCanonicas = grupo.filter(
      (entrada) => entrada.marca === marcaCanonica
    );
    const principal = (
      candidatasCanonicas.length ? candidatasCanonicas : grupo
    ).sort(
      (a, b) =>
        (b.referencia.presentaciones?.length || 0) -
          (a.referencia.presentaciones?.length || 0) ||
        (b.referencia.metadata?.original_names?.length || 0) -
          (a.referencia.metadata?.original_names?.length || 0)
    )[0];
    const referencias = [
      principal.referencia,
      ...grupo
        .filter((entrada) => entrada !== principal)
        .map((entrada) => entrada.referencia),
    ];
    return {
      ...principal.referencia,
      metadata: fusionarMetadata(referencias),
      presentaciones: fusionarPresentaciones(referencias),
    };
  });
}

function tieneReferenciasEquivalentesInternas(marca = {}) {
  const referencias = marca.referencias || [];
  for (let i = 0; i < referencias.length; i += 1) {
    for (let j = i + 1; j < referencias.length; j += 1) {
      if (
        referenciasCompatibles(
          marca,
          referencias[i],
          marca,
          referencias[j]
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function consolidarCatalogo(catalogo = []) {
  if (!catalogo.length) return catalogo;

  const padres = catalogo.map((_, index) => index);
  const buscar = (index) => {
    if (padres[index] !== index) padres[index] = buscar(padres[index]);
    return padres[index];
  };
  const unir = (a, b) => {
    const raizA = buscar(a);
    const raizB = buscar(b);
    if (raizA !== raizB) padres[raizB] = raizA;
  };

  for (let i = 0; i < catalogo.length; i += 1) {
    for (let j = i + 1; j < catalogo.length; j += 1) {
      if (marcasRelacionadas(catalogo[i], catalogo[j])) unir(i, j);
    }
  }

  const grupos = new Map();
  catalogo.forEach((marca, index) => {
    const raiz = buscar(index);
    const grupo = grupos.get(raiz) || [];
    grupo.push({ marca, index });
    grupos.set(raiz, grupo);
  });

  return [...grupos.values()]
    .sort(
      (a, b) =>
        Math.min(...a.map((item) => item.index)) -
        Math.min(...b.map((item) => item.index))
    )
    .map((grupo) => {
      if (
        grupo.length === 1 &&
        !tieneReferenciasEquivalentesInternas(grupo[0].marca)
      ) {
        return {
          ...grupo[0].marca,
          referencias: (grupo[0].marca.referencias || []).map(
            (referencia) => ({
              ...referencia,
              presentaciones: inferirUnidadesPresentaciones(
                referencia.presentaciones || []
              ),
            })
          ),
        };
      }
      const ordenadas = [...grupo].sort(
        (a, b) =>
          (b.marca.referencias?.length || 0) -
            (a.marca.referencias?.length || 0) ||
          a.index - b.index
      );
      const marcaCanonica = ordenadas[0].marca;
      const marcas = ordenadas.map((item) => item.marca);
      return {
        ...marcaCanonica,
        metadata: {
          ...(marcaCanonica.metadata || {}),
          equivalent_brands: unirValoresUnicos(
            marcas.map((marca) => marca.marca)
          ),
        },
        referencias: fusionarReferencias(marcas, marcaCanonica),
      };
    });
}

module.exports = {
  consolidarCatalogo,
  _internals: {
    distanciaDamerauLevenshtein,
    identidadReferencia,
    marcasRelacionadas,
    referenciasCompatibles,
    similitudOrtografica,
  },
};
