const crypto = require("crypto");
const { cargarProductos } = require("../repositories/productRepository");
const { formatearPrecio, normalizar, normalizarPeso } = require("../utils/text");

const ALIAS_MARCAS_EXTRA = {
  "dog chow": ["dogchow", "dog show", "chow"],
};

const SEDES_RECOGIDA = [
  "calle 18 # 10 - 40",
  "carrera 10 # 17-28",
];

const PALABRAS_CRITERIO = [
  "adulto",
  "adultos",
  "cachorro",
  "cachorros",
  "bebe",
  "senior",
  "mayor",
  "mayores",
  "viejo",
  "viejito",
  "raza",
  "razas",
  "grande",
  "grandes",
  "mediano",
  "mediana",
  "medianos",
  "medianas",
  "pequeno",
  "pequena",
  "pequenos",
  "pequenas",
  "mini",
  "pollo",
  "salmon",
  "cordero",
  "perro",
  "perros",
  "perrito",
  "perrita",
  "canino",
  "gato",
  "gatos",
  "gatito",
  "gatita",
  "gatitos",
  "gatitas",
  "felino",
  "felinos",
  "todas",
  "cualquier",
  "tamano",
  "referencia",
  "referencias",
  "presentacion",
  "presentaciones",
  "sabor",
  "sabores",
  "kilo",
  "kilos",
  "kg",
  "kl",
  "gramos",
  "gr",
  "g",
];

function elegirVariante(llave, opciones) {
  const base = normalizar(llave);
  const suma = base.split("").reduce((total, caracter) => total + caracter.charCodeAt(0), 0);
  return opciones[suma % opciones.length];
}

function contieneFrase(textoNormalizado, frase) {
  const fraseNormalizada = normalizar(frase);
  if (!fraseNormalizada) return false;

  return ` ${textoNormalizado} `.includes(` ${fraseNormalizada} `);
}

function aliasesMarca(marca) {
  const marcaNormalizada = normalizar(marca);
  const compacta = marcaNormalizada.replace(/\s+/g, "");
  return [marcaNormalizada, compacta, ...(ALIAS_MARCAS_EXTRA[marcaNormalizada] || [])]
    .filter(Boolean)
    .filter((alias, index, aliases) => aliases.indexOf(alias) === index);
}

function buscarMarca(catalogo, mensaje) {
  const texto = normalizar(mensaje);
  const textoCompacto = texto.replace(/\s+/g, "");
  const marcasOrdenadas = [...catalogo].sort((a, b) => b.marca.length - a.marca.length);

  return marcasOrdenadas.find((producto) =>
    aliasesMarca(producto.marca).some((alias) => {
      const aliasNormalizado = normalizar(alias);
      const aliasCompacto = aliasNormalizado.replace(/\s+/g, "");

      return contieneFrase(texto, aliasNormalizado) || textoCompacto.includes(aliasCompacto);
    })
  );
}

function buscarMarcaPorNombre(catalogo, nombreMarca) {
  const nombreNormalizado = normalizar(nombreMarca);
  return catalogo.find((producto) => normalizar(producto.marca) === nombreNormalizado);
}

function escaparRegex(texto = "") {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mencionesMarcaEnMensaje(catalogo, mensaje) {
  const texto = normalizar(mensaje);
  const menciones = [];

  catalogo.forEach((marca) => {
    aliasesMarca(marca.marca).forEach((alias) => {
      const aliasNormalizado = normalizar(alias);
      if (!aliasNormalizado) return;

      const regex = new RegExp(`(^|\\s)${escaparRegex(aliasNormalizado)}(?=\\s|$)`, "g");
      let coincidencia;

      while ((coincidencia = regex.exec(texto))) {
        const inicio = coincidencia.index + coincidencia[1].length;
        menciones.push({
          marca,
          inicio,
          fin: inicio + aliasNormalizado.length,
          largo: aliasNormalizado.length,
        });
      }
    });
  });

  return menciones
    .sort((a, b) => a.inicio - b.inicio || b.largo - a.largo)
    .filter((mencion, index, lista) => {
      const anterior = lista.slice(0, index).find((item) => item.fin > mencion.inicio);
      return !anterior;
    });
}

function segmentosPorMarca(catalogo, mensaje) {
  const texto = normalizar(mensaje);
  const menciones = mencionesMarcaEnMensaje(catalogo, mensaje);

  return menciones.map((mencion, index) => {
    const siguiente = menciones[index + 1];
    const anterior = menciones[index - 1];
    let inicioSegmento = index === 0 ? 0 : mencion.inicio;

    if (anterior) {
      const entreMarcas = texto.slice(anterior.fin, mencion.inicio);
      const separadores = [" y ", " tambien ", " además ", " adicional ", ","];
      const separador = separadores
        .map((valor) => ({ valor, indice: entreMarcas.lastIndexOf(valor) }))
        .filter((item) => item.indice >= 0)
        .sort((a, b) => b.indice - a.indice)[0];

      if (separador) {
        inicioSegmento = anterior.fin + separador.indice + separador.valor.length;
      }
    }

    return {
      marca: mencion.marca,
      texto: texto.slice(inicioSegmento, siguiente ? siguiente.inicio : texto.length).trim(),
    };
  });
}

function contieneAlguno(textoNormalizado, palabras) {
  return palabras.some((palabra) => contieneFrase(textoNormalizado, palabra));
}

function normalizarEspecie(especie = "perro") {
  const texto = normalizar(especie);

  if (contieneAlguno(texto, ["gato", "gatos", "gatito", "gatita", "gatitos", "gatitas", "felino", "felinos"])) {
    return "gato";
  }

  return "perro";
}

function extraerCriterios(mensaje) {
  const texto = normalizar(mensaje);
  const criterios = {};

  if (contieneAlguno(texto, ["cachorro", "cachorros", "bebe", "puppy", "gatito", "gatita", "gatitos", "gatitas"])) {
    criterios.etapa = "cachorro";
  }

  if (contieneAlguno(texto, ["adulto", "adultos"])) {
    criterios.etapa = "adulto";
  }

  if (contieneAlguno(texto, ["senior", "mayor", "mayores", "viejo", "viejito"])) {
    criterios.etapa = "adulto";
    criterios.edadEspecial = "mayor";
  }

  if (contieneAlguno(texto, ["pequeno", "pequena", "pequenos", "pequenas", "mini"])) {
    criterios.tamano = "pequeno";
  }

  if (contieneAlguno(texto, ["grande", "grandes", "mediano", "mediana", "medianos", "medianas"])) {
    criterios.tamano = "grande";
  }

  if (contieneAlguno(texto, ["todas las razas", "cualquier tamano", "cualquier raza"])) {
    criterios.tamano = "todas";
  }

  const sabores = [];
  if (contieneFrase(texto, "pollo")) sabores.push("pollo");
  if (contieneFrase(texto, "salmon")) sabores.push("salmon");
  if (contieneFrase(texto, "cordero")) sabores.push("cordero");
  if (sabores.length) criterios.sabores = sabores;

  if (contieneAlguno(texto, ["perro", "perros", "perrito", "perrita", "canino"])) {
    criterios.especie = "perro";
  }

  if (contieneAlguno(texto, ["gato", "gatos", "gatito", "gatita", "gatitos", "gatitas", "felino", "felinos"])) {
    criterios.especie = "gato";
  }

  return criterios;
}

function mezclarCriterios(previos, nuevos) {
  const combinados = { ...previos, ...nuevos };

  if (previos.sabores || nuevos.sabores) {
    combinados.sabores = nuevos.sabores || previos.sabores;
  }

  return combinados;
}

function tieneCriterios(criterios = {}) {
  return Boolean(
    criterios.etapa ||
      criterios.especie ||
      criterios.tamano ||
      criterios.edadEspecial ||
      (criterios.sabores && criterios.sabores.length)
  );
}

function atributosReferencia(referencia) {
  const texto = normalizar(`${referencia.nombre} ${referencia.descripcion || ""}`);
  const atributos = {
    especie: normalizarEspecie(referencia.especie || "perro"),
    etapa: null,
    tamano: null,
    sabores: [],
    edadEspecial: null,
  };

  if (contieneAlguno(texto, ["cachorro", "cachorros", "bebe", "puppy", "gatito", "gatita", "gatitos", "gatitas"])) {
    atributos.etapa = "cachorro";
  }

  if (contieneAlguno(texto, ["adulto", "adultos"])) {
    atributos.etapa = "adulto";
  }

  if (contieneAlguno(texto, ["mayor", "mayores", "senior"])) {
    atributos.etapa = "adulto";
    atributos.edadEspecial = "mayor";
  }

  if (contieneAlguno(texto, ["pequeno", "pequena", "pequenos", "pequenas", "mini"])) {
    atributos.tamano = "pequeno";
  }

  if (contieneAlguno(texto, ["grande", "grandes", "mediano", "mediana", "medianos", "medianas"])) {
    atributos.tamano = "grande";
  }

  if (contieneAlguno(texto, ["todas las razas", "cualquier tamano", "cualquier raza"])) {
    atributos.tamano = "todas";
  }

  if (contieneFrase(texto, "pollo")) atributos.sabores.push("pollo");
  if (contieneFrase(texto, "salmon")) atributos.sabores.push("salmon");
  if (contieneFrase(texto, "cordero")) atributos.sabores.push("cordero");

  return atributos;
}

function referenciaCumple(referencia, criterios) {
  const atributos = atributosReferencia(referencia);

  if (criterios.especie && atributos.especie !== criterios.especie) {
    return false;
  }

  if (criterios.etapa && !atributos.etapa) {
    return false;
  }

  if (criterios.etapa && atributos.etapa !== criterios.etapa) {
    return false;
  }

  if (criterios.edadEspecial && atributos.edadEspecial !== criterios.edadEspecial) {
    return false;
  }

  if (!criterios.edadEspecial && atributos.edadEspecial) {
    return false;
  }

  if (criterios.tamano && atributos.tamano) {
    const coincideTamano =
      atributos.tamano === criterios.tamano ||
      atributos.tamano === "todas" ||
      criterios.tamano === "todas";

    if (!coincideTamano) return false;
  }

  if (criterios.sabores && criterios.sabores.length) {
    const coincideSabor = criterios.sabores.some((sabor) => atributos.sabores.includes(sabor));
    if (!coincideSabor) return false;
  }

  return true;
}

function referenciasPorCriterios(marca, criterios) {
  if (!tieneCriterios(criterios)) return marca.referencias;
  return marca.referencias.filter((referencia) => referenciaCumple(referencia, criterios));
}

function criteriosDesdeReferencia(referencia) {
  const atributos = atributosReferencia(referencia);
  const criterios = {};

  if (atributos.especie) criterios.especie = atributos.especie;
  if (atributos.etapa) criterios.etapa = atributos.etapa;
  if (atributos.tamano) criterios.tamano = atributos.tamano;
  if (atributos.edadEspecial) criterios.edadEspecial = atributos.edadEspecial;
  if (atributos.sabores.length) criterios.sabores = atributos.sabores;

  return criterios;
}

function puntuarReferencia(referencia, criterios, mensaje) {
  const textoReferencia = normalizar(`${referencia.nombre} ${referencia.descripcion || ""}`);
  const textoMensaje = normalizar(mensaje);
  const atributos = atributosReferencia(referencia);
  let puntos = 0;

  if (contieneFrase(textoMensaje, referencia.nombre)) puntos += 20;
  if (criterios.especie && atributos.especie === criterios.especie) puntos += 6;
  if (criterios.etapa && atributos.etapa === criterios.etapa) puntos += 5;
  if (criterios.edadEspecial && atributos.edadEspecial === criterios.edadEspecial) puntos += 5;
  if (criterios.tamano && atributos.tamano === criterios.tamano) puntos += 5;
  if (criterios.tamano && atributos.tamano === "todas") puntos += 2;

  if (criterios.sabores && criterios.sabores.length) {
    criterios.sabores.forEach((sabor) => {
      if (atributos.sabores.includes(sabor)) puntos += 4;
    });
  }

  normalizar(referencia.nombre)
    .split(/\s+/)
    .filter((palabra) => palabra.length > 3)
    .forEach((palabra) => {
      if (contieneFrase(textoMensaje, palabra) && contieneFrase(textoReferencia, palabra)) puntos += 1;
    });

  return puntos;
}

function buscarReferenciaExacta(marca, mensaje, criterios = {}) {
  const texto = normalizar(mensaje);

  return marca.referencias.find(
    (referencia) => contieneFrase(texto, referencia.nombre) && referenciaCumple(referencia, criterios)
  );
}

function elegirMejorReferencia(referencias, criterios, mensaje) {
  const ordenadas = referencias
    .map((referencia) => ({
      referencia,
      puntos: puntuarReferencia(referencia, criterios, mensaje),
    }))
    .sort((a, b) => b.puntos - a.puntos);

  if (!ordenadas.length) return null;
  if (ordenadas.length === 1) return ordenadas[0].referencia;

  const [primera, segunda] = ordenadas;
  const haySuficienteDetalle =
    Boolean(criterios.etapa && criterios.tamano) ||
    Boolean(criterios.etapa && criterios.sabores && criterios.sabores.length) ||
    Boolean(criterios.edadEspecial);

  if (haySuficienteDetalle && primera.puntos >= segunda.puntos + 2) {
    return primera.referencia;
  }

  return null;
}

function extraerPresentacionSolicitada(mensaje = "") {
  const texto = normalizar(mensaje);
  const unidad = "(kg|kl|kilo|kilos|gramo|gramos|gr|g|lb|libra|libras)";
  const conUnidad = texto.match(new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*${unidad}\\b`));
  if (conUnidad) return normalizarPeso(`${conUnidad[1]}${conUnidad[2]}`);

  const porConUnidad = texto.match(new RegExp(`\\bx\\s*(\\d+(?:[.,]\\d+)?)\\s*${unidad}\\b`));
  if (porConUnidad) return normalizarPeso(`${porConUnidad[1]}${porConUnidad[2]}`);

  return null;
}

function buscarPresentacion(referencia, mensaje) {
  const textoPeso = normalizarPeso(mensaje);
  const texto = normalizar(mensaje);

  const porPeso = referencia.presentaciones.find((presentacion) => {
    const peso = normalizarPeso(presentacion.peso);
    return textoPeso.includes(peso);
  });

  if (porPeso) return porPeso;

  const numero = texto.match(/(?:la\s+de|presentacion\s+de|bolsa\s+de|bulto\s+de|bulto\s+.*?\bx)\s+(\d+(?:[.,]\d+)?)/);
  const numeroPor = texto.match(/\bx\s*(\d+(?:[.,]\d+)?)\b/);
  const numeroSuelto = texto.match(/^(\d+(?:[.,]\d+)?)$/);
  if (!numero && !numeroPor && !numeroSuelto) return null;

  const valor = (numero ? numero[1] : numeroPor ? numeroPor[1] : numeroSuelto[1]).replace(",", ".");
  const coincidencias = referencia.presentaciones.filter((presentacion) =>
    normalizarPeso(presentacion.peso).startsWith(valor)
  );

  return coincidencias.length === 1 ? coincidencias[0] : null;
}

function presentacionDisponible(referencia, presentacionSolicitada) {
  if (!presentacionSolicitada) return true;

  return referencia.presentaciones.some(
    (presentacion) => normalizarPeso(presentacion.peso) === presentacionSolicitada
  );
}

function respuestaPresentacionNoDisponible(marca, referencia, presentacionSolicitada) {
  const disponibles = presentacionesReferencia(referencia);

  return `En ${marca.marca} ${referencia.nombre} no tengo presentación de ${presentacionSolicitada} en este momento.\n\nPresentaciones disponibles:\n${disponibles}\n\nSi te sirve alguna de esas, te ayudo a dejarla en el pedido.`;
}

function respuestaPresentacionNoDisponibleParaReferencias(marca, referencias, criterios, presentacionSolicitada) {
  const descripcion = tieneCriterios(criterios)
    ? `${marca.marca} para ${describirCriterios(criterios)}`
    : marca.marca;
  const disponibles = referencias
    .map((referencia) => {
      const presentaciones = referencia.presentaciones
        .map((presentacion) => `${presentacion.peso}: ${formatearPrecio(presentacion.precio)}`)
        .join(", ");
      return `- ${referencia.nombre}: ${presentaciones}`;
    })
    .join("\n");

  return `En ${descripcion} no tengo presentación de ${presentacionSolicitada} en este momento.\n\nPresentaciones disponibles:\n${disponibles}\n\nSi te sirve alguna de esas, te ayudo a dejarla en el pedido.`;
}

function respuestaSiPresentacionSolicitadaNoDisponible(marca, referencia, mensaje) {
  const presentacionSolicitada = extraerPresentacionSolicitada(mensaje);
  if (!presentacionSolicitada || presentacionDisponible(referencia, presentacionSolicitada)) return null;

  return respuestaPresentacionNoDisponible(marca, referencia, presentacionSolicitada);
}

function respuestaSiPresentacionSolicitadaNoDisponibleEnReferencias(marca, referencias, criterios, mensaje) {
  const presentacionSolicitada = extraerPresentacionSolicitada(mensaje);
  if (!presentacionSolicitada || !referencias.length) return null;

  const algunaReferenciaLaTiene = referencias.some((referencia) =>
    presentacionDisponible(referencia, presentacionSolicitada)
  );

  if (algunaReferenciaLaTiene) return null;

  return respuestaPresentacionNoDisponibleParaReferencias(marca, referencias, criterios, presentacionSolicitada);
}

function emojiMascota(referencia) {
  return atributosReferencia(referencia).especie === "gato" ? "🐱" : "🐶";
}

function formatearReferencia(marca, referencia, apertura = "¿Qué presentación te interesa?") {
  const intro = elegirVariante(`${marca.marca}-${referencia.nombre}`, [
    `¡Claro! Te encontré esta opción: ${marca.marca} ${referencia.nombre} ${emojiMascota(referencia)}`,
    `Perfecto, para eso te puede servir ${marca.marca} ${referencia.nombre} ${emojiMascota(referencia)}`,
    `Sí, la referencia que encaja es ${marca.marca} ${referencia.nombre} ${emojiMascota(referencia)}`,
  ]);
  const lineas = [intro];

  if (referencia.descripcion) {
    lineas.push("", referencia.descripcion);
  }

  lineas.push("", "Presentaciones:");
  referencia.presentaciones.forEach((presentacion) => {
    lineas.push(`- ${presentacion.peso}: ${formatearPrecio(presentacion.precio)}`);
  });

  lineas.push("", apertura);
  return lineas.join("\n");
}

function formatearProductoExacto(marca, referencia, presentacion) {
  return [
    `Listo, esta es la opción exacta: ${marca.marca} ${referencia.nombre} ${presentacion.peso} ${emojiMascota(referencia)}`,
    referencia.descripcion ? `\n${referencia.descripcion}` : "",
    `\nPrecio: ${formatearPrecio(presentacion.precio)}`,
  ].join("");
}

function listarMarcas(catalogo, marcas = catalogo, criterios = null) {
  const nombres = marcas.map((producto) => `- ${producto.marca}`).join("\n");
  const intro = tieneCriterios(criterios || {})
    ? `Con gusto. Para ${describirCriterios(criterios)}, estas son las marcas que tengo disponibles en este momento:`
    : "Claro, por ahora manejamos estas marcas:";

  return `${intro}\n${nombres}\n\n¿Cuál te llama más la atención?`;
}

function listarReferencias(marca, referencias = marca.referencias) {
  const lista = referencias.map((referencia) => `- ${referencia.nombre}`).join("\n");
  const especies = valoresUnicos(referencias.map((referencia) => atributosReferencia(referencia).especie));
  const mascota = especies.length === 1 ? etiquetaMascotaSingular(especies[0]) : "mascota";
  return `Súper. En ${marca.marca} tengo estas referencias disponibles:\n${lista}\n\nCuéntame cuál te interesa o dime cómo es tu ${mascota} y te ayudo a escoger.`;
}

function describirCriterios(criterios = {}) {
  const partes = [];

  if (criterios.especie && criterios.etapa) {
    if (criterios.especie === "gato" && criterios.etapa === "cachorro") {
      partes.push("gatitos o gatos bebés");
    } else {
      partes.push(`${etiquetaEspecie(criterios.especie)} ${criterios.etapa === "adulto" ? "adultos" : "cachorros"}`);
    }
  } else {
    if (criterios.especie) partes.push(etiquetaEspecie(criterios.especie));
    if (criterios.etapa === "adulto") partes.push("adulto");
    if (criterios.etapa === "cachorro") partes.push("cachorro");
  }
  if (criterios.tamano === "grande") partes.push("raza grande o mediana");
  if (criterios.tamano === "pequeno") partes.push("raza pequeña o mini");
  if (criterios.tamano === "todas") partes.push("todas las razas");
  if (criterios.edadEspecial === "mayor") partes.push("senior o mayor");
  if (criterios.sabores && criterios.sabores.length) {
    partes.push(`sabor ${unirNatural(criterios.sabores.map(etiquetaSabor))}`);
  }

  return partes.join(", ") || "perros";
}

function marcasConOpciones(catalogo, criterios) {
  return catalogo.filter((marca) => referenciasPorCriterios(marca, criterios).length > 0);
}

function referenciasPorEspecie(catalogo, especie) {
  return catalogo
    .map((marca) => ({
      marca,
      referencias: marca.referencias.filter(
        (referencia) => atributosReferencia(referencia).especie === normalizarEspecie(especie)
      ),
    }))
    .filter((grupo) => grupo.referencias.length);
}

function listarReferenciasPorEspecie(catalogo, especie) {
  const grupos = referenciasPorEspecie(catalogo, especie);
  if (!grupos.length) return "";

  return grupos
    .map((grupo) => {
      const referencias = grupo.referencias.map((referencia) => referencia.nombre).join(", ");
      return `- ${grupo.marca.marca}: ${referencias}`;
    })
    .join("\n");
}

function crearAlternativaPendiente(estado, gruposPorEspecie) {
  const opciones = gruposPorEspecie.flatMap((grupo) =>
    grupo.referencias.map((referencia) => ({
      marca: grupo.marca.marca,
      referencia: referencia.nombre,
    }))
  );

  estado.alternativaPendiente = opciones.length
    ? {
        opciones,
        indice: 0,
      }
    : null;
}

function respuestaSinOpciones(catalogo, criterios, marca = null, estado = null) {
  const marcasCompatibles = marcasConOpciones(catalogo, criterios);

  if (criterios.especie && !marcasCompatibles.length) {
    const gruposPorEspecie = referenciasPorEspecie(catalogo, criterios.especie);

    if (gruposPorEspecie.length) {
      if (estado) crearAlternativaPendiente(estado, gruposPorEspecie);
      return `Para ${describirCriterios(criterios)} no tengo una referencia exacta en este momento.\n\nLo que sí tengo para ${etiquetaEspecie(criterios.especie)} es:\n${listarReferenciasPorEspecie(catalogo, criterios.especie)}\n\nSi te sirve alguna de esas, te muestro presentaciones y precio.`;
    }

    if (estado) estado.alternativaPendiente = null;
    const especiesDisponibles = valoresUnicos(
      catalogo.flatMap((marcaCatalogo) =>
        marcaCatalogo.referencias.map((referencia) =>
          etiquetaEspecie(atributosReferencia(referencia).especie)
        )
      )
    );
    const disponibilidad = especiesDisponibles.length
      ? `En este momento tengo referencias para ${unirNatural(especiesDisponibles)}.`
      : "En este momento no tengo referencias activas en el catálogo.";

    return `Por ahora no tengo referencias para ${etiquetaEspecie(criterios.especie)} en el catálogo.\n\n${disponibilidad}`;
  }

  if (marca && criterios.especie) {
    if (estado) estado.alternativaPendiente = null;
    return `En ${marca.marca} no tengo referencias para ${etiquetaEspecie(criterios.especie)} por ahora.\n\n${listarMarcas(catalogo, marcasCompatibles, criterios)}`;
  }

  if (estado) estado.alternativaPendiente = null;
  return `Por ahora no encuentro una opción exacta para ${describirCriterios(criterios)}, pero revisemos otra alternativa.\n\n${listarMarcas(catalogo, marcasCompatibles.length ? marcasCompatibles : catalogo, criterios)}`;
}

function limpiarCandidatoMarca(candidato) {
  let limpio = normalizar(candidato)
    .replace(/\b(la|el|los|las|un|una|unos|unas|de|del|para|por|favor|marca|alimento|comida|cuido|concentrado|algo|y|mi|mis|su|sus|es|esta|estan)\b/g, " ")
    .replace(/\b(hola|buenas|buenos|dias|tardes|noches|hacer|pedido|comprar|cotizar|encargar|pedir)\b/g, " ")
    .replace(/\b(que|cual|cuales|tengo|tienes|tiene|manejan|maneja|venden|vende|hay|quiero|quisiera|necesito|busco|dame|deme|me|gustaria|gusta|interesa)\b/g, " ")
    .replace(/\b(mil|pesos|peso|barato|economico|economica|recomiende|recomiendas|recomienda|recomiendame|recomendar|recomendarme)\b/g, " ");

  PALABRAS_CRITERIO.forEach((palabra) => {
    limpio = limpio.replace(new RegExp(`\\b${palabra}\\b`, "g"), " ");
  });

  return limpio.replace(/\b\d+(?:[.,]\d+)?\b/g, " ").replace(/\s+/g, " ").trim();
}

function extraerMarcaDesconocida(mensaje, catalogo, opciones = {}) {
  if (buscarMarca(catalogo, mensaje)) return null;

  const texto = normalizar(mensaje);
  const pareceDescripcionMascota =
    /\b(tengo|mi|para mi|es un|es una)\b/.test(texto) &&
    tieneCriterios(extraerCriterios(texto)) &&
    !solicitaMarcas(texto) &&
    !solicitaReferencias(texto);

  if (pareceDescripcionMascota) return null;

  const esAperturaSinProducto =
    esSaludo(texto) &&
    contieneAlguno(texto, ["pedido", "hacer pedido", "comprar", "cotizar", "encargar"]) &&
    !tieneCriterios(extraerCriterios(texto)) &&
    !mensajeTienePresentacionExplicita(texto);

  if (esAperturaSinProducto) return null;

  const patrones = [
    /\bmarca\s+([a-z0-9. ]{2,50})/,
    /\b(?:tienen|tiene|manejan|maneja|venden|vende|hay|busco|quiero|necesito|dame|deme)\s+([a-z0-9. ]{2,60})/,
    /\b(?:me gustaria|me interesa|quisiera)\s+(?:de\s+)?([a-z0-9. ]{2,60})/,
  ];

  for (const patron of patrones) {
    const coincidencia = texto.match(patron);
    if (!coincidencia) continue;

    const candidato = limpiarCandidatoMarca(coincidencia[1]);
    if (candidato && candidato.length >= 3 && candidato.split(" ").length <= 4) return candidato;
  }

  const candidatoSolo = limpiarCandidatoMarca(texto);
  if (
    opciones.permitirCandidatoSolo &&
    candidatoSolo &&
    candidatoSolo.length >= 3 &&
    candidatoSolo.split(" ").length <= 4 &&
    !solicitaMarcas(texto) &&
    !solicitaReferencias(texto) &&
    !solicitaRecomendacion(texto) &&
    !extraerPresupuesto(texto)
  ) {
    return candidatoSolo;
  }

  return null;
}

function solicitaMarcas(mensaje) {
  const texto = normalizar(mensaje);
  return contieneAlguno(texto, [
    "marca",
    "marcas",
    "que tienes",
    "que manejas",
    "que vende",
    "opciones",
  ]);
}

function solicitaReferencias(mensaje) {
  const texto = normalizar(mensaje);
  return contieneAlguno(texto, ["referencia", "referencias", "linea", "lineas", "tipo", "tipos"]);
}

function solicitaRecomendacion(mensaje) {
  const texto = normalizar(mensaje);
  return contieneAlguno(texto, [
    "recomienda",
    "recomiendame",
    "recomiende",
    "recomiendas",
    "recomendar",
    "recomendarme",
    "recomendacion",
    "cual me sirve",
    "cual es mejor",
    "barato",
    "economico",
    "economica",
    "presupuesto",
  ]);
}

function solicitaCierre(mensaje) {
  const texto = normalizar(mensaje);
  return contieneAlguno(texto, [
    "lo quiero",
    "me lo llevo",
    "comprar",
    "pedido",
    "domicilio",
    "enviar",
    "envio",
    "confirmar",
    "finalizar",
    "listo",
    "asi esta bien",
    "esta bien",
    "eso es todo",
    "nada mas",
    "no mas",
    "continua",
    "continuar",
    "perfecto",
    "sigue",
    "proceder",
  ]);
}

function esCambioDeMarca(mensaje) {
  const texto = normalizar(mensaje);
  return contieneAlguno(texto, ["otra marca", "otras marcas", "cambiar marca", "ver marcas"]);
}

function esSaludo(mensaje) {
  const texto = normalizar(mensaje);
  return /(^|\s)(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|hello)(\s|$)/.test(texto);
}

function esAgradecimiento(mensaje) {
  const texto = normalizar(mensaje);
  return contieneAlguno(texto, ["gracias", "muchas gracias", "listo gracias"]);
}

function esCierreFinal(mensaje) {
  const texto = normalizar(mensaje);
  return contieneAlguno(texto, [
    "eso es todo",
    "nada mas",
    "no mas",
    "asi esta bien",
    "esta bien",
    "muchas gracias",
    "gracias",
    "listo gracias",
    "hasta ahi",
    "solo eso",
  ]);
}

function esAfirmacion(mensaje) {
  const texto = normalizar(mensaje);
  return contieneAlguno(texto, [
    "si",
    "si por favor",
    "si porfa",
    "de una",
    "por favor",
    "claro",
    "dale",
    "ok",
    "okay",
    "bueno",
    "me sirve",
    "sirve",
    "quiero",
    "muestrame",
    "muestre",
    "pasame",
    "paseme",
  ]);
}

function parsearNumeroMoneda(valor, sufijo = "") {
  let limpio = valor.replace(/\s/g, "");

  if (/^\d+[.,]\d{3}$/.test(limpio) || /^\d{1,3}([.,]\d{3})+$/.test(limpio)) {
    limpio = limpio.replace(/[.,]/g, "");
  } else {
    limpio = limpio.replace(",", ".");
  }

  let numero = Number(limpio);
  if (!Number.isFinite(numero)) return null;

  if ((sufijo === "mil" || sufijo === "k") && numero < 1000) {
    numero *= 1000;
  }

  return Math.round(numero);
}

function extraerPresupuesto(mensaje) {
  const texto = normalizar(mensaje);
  const regex = /(?:\$|\b(?:hasta|maximo|presupuesto|tengo|menos de|de)\s+)?(\d[\d.,]*)(?:\s*(mil|k))?/g;
  const valores = [];
  let coincidencia;

  while ((coincidencia = regex.exec(texto))) {
    const despues = texto.slice(regex.lastIndex, regex.lastIndex + 8);
    if (coincidencia[2] === "k" && /^[gil]/.test(texto.slice(regex.lastIndex, regex.lastIndex + 1))) {
      continue;
    }
    if (/^\s*(kg|kl|kilo|kilos|g|gr|lb)/.test(despues)) continue;

    const numero = parsearNumeroMoneda(coincidencia[1], coincidencia[2]);
    if (numero && numero >= 1000) valores.push(numero);
  }

  return valores.length ? Math.max(...valores) : null;
}

function quiereEconomico(mensaje) {
  const texto = normalizar(mensaje);
  return contieneAlguno(texto, ["barato", "economico", "economica", "bajo precio"]);
}

function solicitaOpinionMarca(mensaje) {
  const texto = normalizar(mensaje);
  return contieneAlguno(texto, [
    "que tal",
    "es buena",
    "es bueno",
    "opinion",
    "opiniones",
    "vale la pena",
    "como sale",
    "como es",
    "beneficios",
    "hablame",
    "cuentame",
  ]);
}

function valoresUnicos(valores) {
  return valores.filter(Boolean).filter((valor, index, lista) => lista.indexOf(valor) === index);
}

function unirNatural(valores) {
  const unicos = valoresUnicos(valores);
  if (!unicos.length) return "";
  if (unicos.length === 1) return unicos[0];
  return `${unicos.slice(0, -1).join(", ")} y ${unicos[unicos.length - 1]}`;
}

function etiquetaSabor(sabor) {
  const etiquetas = {
    salmon: "salmón",
    pollo: "pollo",
    cordero: "cordero",
  };

  return etiquetas[sabor] || sabor;
}

function etiquetaEspecie(especie) {
  return normalizarEspecie(especie) === "gato" ? "gatos" : "perros";
}

function etiquetaMascotaSingular(especie) {
  return normalizarEspecie(especie) === "gato" ? "gato" : "perro";
}

function resumenMarca(marca, referencias = marca.referencias) {
  const atributos = referencias.map(atributosReferencia);
  const especies = valoresUnicos(atributos.map((atributo) => etiquetaEspecie(atributo.especie)));
  const etapas = valoresUnicos(
    atributos
      .map((atributo) => {
        const mascota = etiquetaEspecie(atributo.especie);
        if (atributo.edadEspecial === "mayor") return `${mascota} mayores`;
        if (atributo.etapa === "adulto") return "adultos";
        if (atributo.etapa === "cachorro") return "cachorros";
        return null;
      })
      .filter(Boolean)
  );
  const tamanos = valoresUnicos(
    atributos
      .map((atributo) => {
        if (atributo.tamano === "pequeno") return "razas pequeñas";
        if (atributo.tamano === "grande") return "razas medianas o grandes";
        if (atributo.tamano === "todas") return "todas las razas";
        return null;
      })
      .filter(Boolean)
  );
  const sabores = valoresUnicos(atributos.flatMap((atributo) => atributo.sabores));
  const presentaciones = valoresUnicos(
    referencias.flatMap((referencia) => referencia.presentaciones.map((presentacion) => presentacion.peso))
  );
  const precios = referencias.flatMap((referencia) =>
    referencia.presentaciones.map((presentacion) => presentacion.precio)
  );

  return {
    especies,
    etapas,
    tamanos,
    sabores,
    presentaciones,
    precioMinimo: Math.min(...precios),
    precioMaximo: Math.max(...precios),
  };
}

function resenarMarca(marca, referencias = marca.referencias) {
  const resumen = resumenMarca(marca, referencias);
  const lineas = [
    `Sí, ${marca.marca} es una opción interesante dentro de lo que manejamos.`,
  ];

  if (resumen.especies.length || resumen.etapas.length || resumen.tamanos.length) {
    lineas.push(
      `Tiene alternativas para ${unirNatural([...resumen.especies, ...resumen.etapas, ...resumen.tamanos])}.`
    );
  }

  if (resumen.sabores.length) {
    lineas.push(`También cuenta con opciones de ${unirNatural(resumen.sabores.map(etiquetaSabor))}.`);
  }

  if (resumen.presentaciones.length) {
    if (resumen.presentaciones.length === 1) {
      lineas.push(
        `La tenemos en presentación de ${resumen.presentaciones[0]} por ${formatearPrecio(resumen.precioMinimo)}.`
      );
    } else {
      const rangoPrecios =
        resumen.precioMinimo === resumen.precioMaximo
          ? `a ${formatearPrecio(resumen.precioMinimo)}`
          : `entre ${formatearPrecio(resumen.precioMinimo)} y ${formatearPrecio(resumen.precioMaximo)}`;

      lineas.push(
        `La manejamos en varias presentaciones, desde ${resumen.presentaciones[0]} hasta ${
          resumen.presentaciones[resumen.presentaciones.length - 1]
        }, con precios ${rangoPrecios}.`
      );
    }
  }

  const referenciasLista = referencias.map((referencia) => `- ${referencia.nombre}`).join("\n");
  const mascota =
    resumen.especies.length === 1 ? etiquetaMascotaSingular(resumen.especies[0]) : "mascota";

  return `${lineas.join(" ")}\n\nReferencias disponibles:\n${referenciasLista}\n\nSi me dices edad, tamaño y presupuesto, te ayudo a escoger la mejor para tu ${mascota}.`;
}

function resenarReferencia(marca, referencia) {
  const mascota = etiquetaMascotaSingular(atributosReferencia(referencia).especie);
  const presentaciones = referencia.presentaciones
    .map((presentacion) => `${presentacion.peso}: ${formatearPrecio(presentacion.precio)}`)
    .join("\n- ");
  const descripcion = referencia.descripcion
    ? `${referencia.descripcion}. `
    : "";

  return `Sí, esa referencia te puede servir: ${marca.marca} ${referencia.nombre}.\n\n${descripcion}Es una opción para revisar si buscas algo acorde a esa necesidad del ${mascota}.\n\nPresentaciones:\n- ${presentaciones}\n\n¿Cuál presentación quieres que agregue al pedido?`;
}

function opcionesDisponibles(catalogo, criterios = {}, marcaPreferida = null) {
  const marcas = marcaPreferida ? [marcaPreferida] : catalogo;
  const opciones = [];

  marcas.forEach((marca) => {
    referenciasPorCriterios(marca, criterios).forEach((referencia) => {
      referencia.presentaciones.forEach((presentacion) => {
        opciones.push({ marca, referencia, presentacion });
      });
    });
  });

  return opciones;
}

function recomendarOpciones(catalogo, criterios, presupuesto, marcaPreferida = null, economico = false) {
  const opciones = opcionesDisponibles(catalogo, criterios, marcaPreferida);
  if (!opciones.length) {
    return respuestaSinOpciones(catalogo, criterios, marcaPreferida);
  }

  let candidatas = opciones;
  let intro = "";

  if (presupuesto) {
    candidatas = opciones.filter((opcion) => opcion.presentacion.precio <= presupuesto);

    if (!candidatas.length) {
      candidatas = [...opciones].sort((a, b) => a.presentacion.precio - b.presentacion.precio).slice(0, 3);
      intro = `Con ese presupuesto de ${formatearPrecio(presupuesto)} no me aparece una opción exacta, pero estas son las más cercanas que veo:`;
    } else {
      intro = `Con presupuesto de ${formatearPrecio(presupuesto)}, yo miraría estas opciones:`;
      candidatas = candidatas.sort((a, b) => b.presentacion.precio - a.presentacion.precio);
    }
  } else {
    intro = economico
      ? "Si buscas algo más económico, estas opciones pueden funcionar bien:"
      : "Te recomiendo empezar mirando estas opciones:";
    candidatas = [...opciones].sort((a, b) => a.presentacion.precio - b.presentacion.precio);
  }

  const usadas = new Set();
  const seleccionadas = [];

  for (const opcion of candidatas) {
    const clave = `${opcion.marca.marca}|${opcion.referencia.nombre}`;
    if (usadas.has(clave)) continue;

    usadas.add(clave);
    seleccionadas.push(opcion);
    if (seleccionadas.length === 3) break;
  }

  const lineas = seleccionadas.map(
    (opcion) =>
      `- ${opcion.marca.marca} ${opcion.referencia.nombre} ${opcion.presentacion.peso}: ${formatearPrecio(opcion.presentacion.precio)}`
  );

  return `${intro}\n${lineas.join("\n")}\n\nDime cuál te gusta y te ayudo a dejarla lista en el pedido.`;
}

function agregarAlCarrito(estado, marca, referencia, presentacion, cantidad = 1) {
  estado.pedidoConfirmado = false;
  estado.confirmacionPedidoId = null;
  estado.ultimoPedidoGuardadoKey = null;
  estado.ultimoPedidoGuardadoAt = null;
  estado.pedidoConfirmadoPendienteGuardar = false;

  const existente = estado.carrito.find(
    (item) =>
      item.marca === marca.marca &&
      item.referencia === referencia.nombre &&
      item.peso === presentacion.peso &&
      item.precio === presentacion.precio
  );

  if (existente) {
    existente.cantidad += cantidad;
  } else {
    estado.carrito.push({
      marca: marca.marca,
      referencia: referencia.nombre,
      peso: presentacion.peso,
      precio: presentacion.precio,
      cantidad,
    });
  }
}

function resumenCarrito(estado) {
  if (!estado.carrito.length) return "Tu pedido está vacío.";

  const lineas = estado.carrito.map((item) => {
    const subtotal = item.precio * item.cantidad;
    return `- ${item.cantidad} x ${item.marca} ${item.referencia} ${item.peso}: ${formatearPrecio(subtotal)}`;
  });
  const total = estado.carrito.reduce((suma, item) => suma + item.precio * item.cantidad, 0);

  return `Pedido:\n${lineas.join("\n")}\nTotal: ${formatearPrecio(total)}`;
}

function referenciaCatalogoParaItem(catalogo, itemCarrito) {
  const marca = buscarMarcaPorNombre(catalogo, itemCarrito.marca);
  if (!marca) return null;

  return marca.referencias.find((referencia) => referencia.nombre === itemCarrito.referencia) || null;
}

function itemCarritoCoincide(catalogo, itemCarrito, mensaje) {
  const texto = normalizar(mensaje);
  const marcaDetectada = buscarMarca(catalogo, mensaje);
  const criterios = extraerCriterios(mensaje);
  const referencia = referenciaCatalogoParaItem(catalogo, itemCarrito);
  const presentacionDetectada = referencia ? buscarPresentacion(referencia, mensaje) : null;
  const textoItem = normalizar(`${itemCarrito.marca} ${itemCarrito.referencia} ${itemCarrito.peso}`);
  let tieneDetalle = false;

  if (marcaDetectada) {
    tieneDetalle = true;
    if (normalizar(marcaDetectada.marca) !== normalizar(itemCarrito.marca)) return false;
  }

  if (mensajeTienePresentacionExplicita(mensaje)) {
    tieneDetalle = true;
    if (!presentacionDetectada || normalizarPeso(itemCarrito.peso) !== normalizarPeso(presentacionDetectada.peso)) {
      return false;
    }
  }

  if (tieneCriterios(criterios)) {
    tieneDetalle = true;
    if (!referencia || !referenciaCumple(referencia, criterios)) return false;
  }

  const palabrasProducto = texto
    .split(/\s+/)
    .filter((palabra) => palabra.length > 3)
    .filter(
      (palabra) =>
        ![
          "solo",
          "solamente",
          "unicamente",
          "elimina",
          "eliminar",
          "quita",
          "quitar",
          "saca",
          "sacar",
          "borra",
          "borrar",
          "producto",
          "pedido",
          "quiero",
          "deseo",
          "dejar",
          "deja",
          "con",
          "del",
          "sin",
          "ese",
          "este",
          "paquete",
          "paquetes",
          "bolsa",
          "bolsas",
        ].includes(palabra)
    );

  const coincidePalabraProducto = palabrasProducto.some((palabra) => contieneFrase(textoItem, palabra));
  if (coincidePalabraProducto) tieneDetalle = true;

  return tieneDetalle && (coincidePalabraProducto || Boolean(marcaDetectada) || tieneCriterios(criterios));
}

function operacionCarritoInterpretada(interpretacion = {}) {
  return interpretacion.carrito?.operacion || interpretacion.accion || null;
}

function cantidadObjetivoCarrito(interpretacion = {}, mensaje = "") {
  const cantidadCarrito = Number(interpretacion.carrito?.cantidadObjetivo);
  if (Number.isInteger(cantidadCarrito) && cantidadCarrito > 0 && cantidadCarrito < 100) {
    return cantidadCarrito;
  }

  const cantidadProducto = Number(interpretacion.producto?.cantidad);
  if (Number.isInteger(cantidadProducto) && cantidadProducto > 0 && cantidadProducto < 100) {
    return cantidadProducto;
  }

  return extraerCantidad(mensaje);
}

function tieneDetalleProductoInterpretado(interpretacion = {}) {
  const producto = interpretacion.producto || {};
  return Boolean(
    producto.marca ||
      producto.referencia ||
      producto.presentacion ||
      producto.especie ||
      producto.etapa ||
      producto.tamano ||
      (Array.isArray(producto.sabores) && producto.sabores.length)
  );
}

function itemCarritoCoincideInterpretacion(catalogo, itemCarrito, interpretacion = {}, mensaje = "") {
  if (!tieneDetalleProductoInterpretado(interpretacion)) return false;

  const producto = interpretacion.producto || {};
  const criterios = criteriosDesdeInterpretacion(interpretacion);
  const referenciaCatalogo = referenciaCatalogoParaItem(catalogo, itemCarrito);
  let tieneDetalle = false;

  if (producto.marca) {
    tieneDetalle = true;
    const marca = buscarMarcaPorNombre(catalogo, producto.marca) || buscarMarca(catalogo, producto.marca);
    if (!marca || normalizar(marca.marca) !== normalizar(itemCarrito.marca)) return false;
  }

  if (producto.referencia) {
    tieneDetalle = true;
    const referenciaTexto = normalizar(producto.referencia);
    const itemTexto = normalizar(itemCarrito.referencia);
    const coincideReferencia =
      itemTexto === referenciaTexto ||
      contieneFrase(itemTexto, referenciaTexto) ||
      contieneFrase(referenciaTexto, itemTexto);

    if (!coincideReferencia) return false;
  }

  if (producto.presentacion) {
    tieneDetalle = true;
    if (normalizarPeso(producto.presentacion) !== normalizarPeso(itemCarrito.peso)) return false;
  }

  if (mensajeTienePresentacionExplicita(mensaje)) {
    tieneDetalle = true;
    if (!referenciaCatalogo) return false;
    const presentacion = buscarPresentacion(referenciaCatalogo, mensaje);
    if (!presentacion || normalizarPeso(presentacion.peso) !== normalizarPeso(itemCarrito.peso)) return false;
  }

  if (tieneCriterios(criterios)) {
    tieneDetalle = true;
    if (!referenciaCatalogo || !referenciaCumple(referenciaCatalogo, criterios)) return false;
  }

  return tieneDetalle;
}

function productosCarritoPorInterpretacion(catalogo, estado, interpretacion = {}, mensaje = "", operacion = null) {
  const coincidencias = estado.carrito.filter((item) =>
    itemCarritoCoincideInterpretacion(catalogo, item, interpretacion, mensaje)
  );

  if (coincidencias.length) return coincidencias;

  const aplicaAlUltimo = interpretacion.carrito?.aplicaAlUltimoProducto === true;
  const sinDetalle = !tieneDetalleProductoInterpretado(interpretacion);

  if (
    estado.carrito.length &&
    (aplicaAlUltimo || (operacion === "modificar_cantidad" && sinDetalle && estado.carrito.length === 1))
  ) {
    return [estado.carrito[estado.carrito.length - 1]];
  }

  return [];
}

function actualizarCantidadUltimoContexto(estado, cantidad) {
  if (!cantidad) return false;

  if (estado.ultimaSeleccion) {
    estado.ultimaSeleccion.cantidad = cantidad;
    return true;
  }

  if (estado.referenciasPendientes) {
    estado.referenciasPendientes.cantidad = cantidad;
    return true;
  }

  return false;
}

function resolverOperacionCarritoIA(mensaje, estado, catalogo, interpretacion = null) {
  if (!interpretacion || interpretacion.confianza < 0.55) return null;

  let operacion = operacionCarritoInterpretada(interpretacion);
  const cantidadObjetivo = cantidadObjetivoCarrito(interpretacion, mensaje);
  const tieneDetalleProducto = tieneDetalleProductoInterpretado(interpretacion);

  if (operacion === "mantener_solo" && cantidadObjetivo && !tieneDetalleProducto) {
    operacion = "modificar_cantidad";
  }

  if (!["quitar", "mantener_solo", "modificar_cantidad"].includes(operacion)) return null;

  aplicarDatosInterpretados(estado, interpretacion);

  if (operacion === "modificar_cantidad" && !estado.carrito.length) {
    if (actualizarCantidadUltimoContexto(estado, cantidadObjetivo)) {
      return `Listo, lo dejo en ${cantidadObjetivo} ${cantidadObjetivo === 1 ? "paquete" : "paquetes"}.\n\nSigamos con el producto que veníamos revisando.`;
    }

    return null;
  }

  if (!estado.carrito.length) return null;

  const coincidencias = productosCarritoPorInterpretacion(catalogo, estado, interpretacion, mensaje, operacion);

  if (!coincidencias.length) {
    if (operacion === "modificar_cantidad" && estado.carrito.length > 1 && !tieneDetalleProducto) {
      return `${resumenCarrito(estado)}\n\n¿A cuál producto le ajusto la cantidad?`;
    }

    return `Revisé tu pedido, pero no encontré ese producto en el carrito.\n\n${resumenCarrito(estado)}\n\nDime cuál quieres ajustar y lo dejo bien.`;
  }

  if (operacion === "modificar_cantidad") {
    if (!cantidadObjetivo) return `${resumenCarrito(estado)}\n\n¿Cuántos paquetes quieres dejar?`;

    coincidencias.forEach((item) => {
      item.cantidad = cantidadObjetivo;
    });
    limpiarFlujoVentaDespuesCambioCarrito(estado);

    return `Listo, ajusté la cantidad.\n\n${resumenCarrito(estado)}\n\n¿Seguimos con la entrega o quieres cambiar algo más?`;
  }

  if (operacion === "mantener_solo") {
    estado.carrito = coincidencias;
    if (cantidadObjetivo) {
      estado.carrito.forEach((item) => {
        item.cantidad = cantidadObjetivo;
      });
    }
    limpiarFlujoVentaDespuesCambioCarrito(estado);

    return `Listo, dejé el pedido solamente con eso.\n\n${resumenCarrito(estado)}\n\n¿Seguimos con la entrega o quieres cambiar algo más?`;
  }

  const clavesEliminar = new Set(
    coincidencias.map((item) => `${item.marca}|${item.referencia}|${item.peso}|${item.precio}`)
  );
  estado.carrito = estado.carrito.filter(
    (item) => !clavesEliminar.has(`${item.marca}|${item.referencia}|${item.peso}|${item.precio}`)
  );
  limpiarFlujoVentaDespuesCambioCarrito(estado);

  if (!estado.carrito.length) {
    return "Listo, retiré ese producto y el pedido quedó vacío. Dime qué producto quieres pedir y lo armamos de nuevo.";
  }

  return `Listo, retiré ese producto del pedido.\n\n${resumenCarrito(estado)}\n\n¿Seguimos con la entrega o quieres cambiar algo más?`;
}

function detectarCambioCarrito(mensaje) {
  const texto = normalizar(mensaje);

  if (contieneAlguno(texto, ["solamente", "solo", "unicamente", "unicamente con", "solo con", "solamente con"])) {
    return "mantener";
  }

  if (
    contieneAlguno(texto, [
      "ya no",
      "no quiero",
      "quita",
      "quitar",
      "elimina",
      "eliminar",
      "saca",
      "sacar",
      "borra",
      "borrar",
      "sin",
    ])
  ) {
    return "eliminar";
  }

  return null;
}

function limpiarFlujoVentaDespuesCambioCarrito(estado) {
  estado.pedidoConfirmado = false;
  estado.confirmacionPedidoId = null;
  estado.ultimoPedidoGuardadoKey = null;
  estado.ultimoPedidoGuardadoAt = null;
  estado.pedidoConfirmadoPendienteGuardar = false;
  estado.esperandoConfirmacionDomicilio = Boolean(estado.carrito.length);
  estado.esperandoConfirmacionPedido = false;
  estado.esperandoDatosDomicilio = false;
  estado.esperandoTipoEntrega = false;
  estado.esperandoMetodoPago = false;
  estado.esperandoSedeRecogida = false;
}

function resolverCambioCarrito(mensaje, estado, catalogo) {
  if (!estado.carrito.length) return null;

  const accion = detectarCambioCarrito(mensaje);
  if (!accion) return null;

  const coincidencias = estado.carrito.filter((item) => itemCarritoCoincide(catalogo, item, mensaje));
  if (!coincidencias.length) {
    const cantidad = extraerCantidad(mensaje);

    if (accion === "mantener" && cantidad) {
      if (estado.carrito.length === 1) {
        estado.carrito[0].cantidad = cantidad;
        limpiarFlujoVentaDespuesCambioCarrito(estado);
        return `Listo, ajusté la cantidad.\n\n${resumenCarrito(estado)}\n\n¿Quieres agregar algo más o avanzamos con la entrega?`;
      }

      return `${resumenCarrito(estado)}\n\n¿A cuál producto le ajusto la cantidad?`;
    }

    return `Revisé tu pedido, pero no encontré ese producto en el carrito.\n\n${resumenCarrito(estado)}\n\nDime cuál quieres dejar o retirar y lo ajusto.`;
  }

  const antes = estado.carrito.length;

  if (accion === "mantener") {
    estado.carrito = coincidencias;
  } else {
    const clavesEliminar = new Set(
      coincidencias.map((item) => `${item.marca}|${item.referencia}|${item.peso}|${item.precio}`)
    );
    estado.carrito = estado.carrito.filter(
      (item) => !clavesEliminar.has(`${item.marca}|${item.referencia}|${item.peso}|${item.precio}`)
    );
  }

  limpiarFlujoVentaDespuesCambioCarrito(estado);

  if (!estado.carrito.length) {
    return "Listo, retiré ese producto y el pedido quedó vacío. Dime qué producto quieres pedir y lo armamos de nuevo.";
  }

  const cambio =
    accion === "mantener"
      ? antes === estado.carrito.length
        ? "Listo, dejamos el pedido solamente con ese producto."
        : "Listo, dejé el pedido solo con ese producto."
      : "Listo, retiré ese producto del pedido.";

  return `${cambio}\n\n${resumenCarrito(estado)}\n\n¿Quieres agregar algo más o avanzamos con la entrega?`;
}

function productoAgregadoRespuesta(estado) {
  estado.esperandoConfirmacionDomicilio = true;
  return `${resumenCarrito(estado)}\n\n¿Quieres agregar algo más o avanzamos con la entrega?`;
}

function respuestaProductoAgregado(estado, marca, referencia, presentacion, opciones = {}) {
  const accion = opciones.accion || "Te lo agrego al pedido.";
  let siguientePaso = opciones.siguientePaso;

  if (!siguientePaso) {
    if (opciones.pedirDireccionCompleta) {
      siguientePaso = solicitarDireccionCompleta(estado);
    } else if (opciones.pedirDatosDomicilio) {
      siguientePaso = solicitarDatosDomicilio(estado);
    } else {
      siguientePaso = productoAgregadoRespuesta(estado);
    }
  }

  return `${formatearProductoExacto(marca, referencia, presentacion)}\n\n${accion}\n\n${siguientePaso}`;
}

function tieneDireccionIncompleta(estado) {
  return Boolean(!estado.datosDomicilio?.direccion && (estado.datosDomicilio?.sector || estado.datosDomicilio?.direccionParcial));
}

function solicitarDireccionCompleta(estado) {
  estado.esperandoDatosDomicilio = true;
  estado.esperandoConfirmacionDomicilio = false;

  const referencia = estado.datosDomicilio.sector
    ? `el sector ${estado.datosDomicilio.sector}`
    : `la dirección parcial ${estado.datosDomicilio.direccionParcial}`;

  return `${resumenCarrito(estado)}\n\nTengo como referencia ${referencia}. Para enviarlo sin enredos, regálame la dirección completa, por favor.`;
}

function mensajeTienePresentacionExplicita(mensaje) {
  const texto = normalizar(mensaje);
  return (
    /\b\d+(?:[.,]\d+)?\s*(kg|kl|kilo|kilos|gramo|gramos|gr|g|lb|libra|libras)\b/.test(texto) ||
    /\bx\s*\d+(?:[.,]\d+)?\b/.test(texto)
  );
}

function numeroCantidad(valor = "") {
  const texto = normalizar(valor);
  const palabras = {
    un: 1,
    una: 1,
    uno: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
  };

  if (palabras[texto]) return palabras[texto];

  const numero = Number(texto.replace(",", "."));
  if (!Number.isInteger(numero) || numero < 1 || numero > 99) return null;
  return numero;
}

function extraerCantidad(mensaje) {
  const texto = normalizar(mensaje);
  const numero = "(\\d{1,2}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)";
  const unidades = "(?:paquetes?|bolsas?|bultos?|sacos?|unidades?|pacas?)";
  const patrones = [
    new RegExp(`\\b${numero}\\s+${unidades}\\b`),
    new RegExp(`\\b${unidades}\\s+(?:de\\s+)?${numero}\\b`),
    new RegExp(`\\b(?:dame|deme|quiero|necesito|agrega|agregue|agregar|sumale|suma|llevo|llevame)\\s+${numero}\\b(?!\\s*(?:kg|kl|kilo|kilos|gramo|gramos|gr|g|lb|libra|libras))`),
  ];

  for (const patron of patrones) {
    const coincidencia = texto.match(patron);
    if (!coincidencia) continue;

    const cantidad = numeroCantidad(coincidencia[1]);
    if (cantidad) return cantidad;
  }

  return null;
}

function tieneIntencionAgregarProducto(mensaje) {
  const texto = normalizar(mensaje);
  return contieneAlguno(texto, [
    "necesito",
    "quiero",
    "agrega",
    "agregue",
    "agregar",
    "anade",
    "sumale",
    "suma",
    "deme",
    "dame",
    "pedir",
    "pedido",
    "domicilio",
    "lo quiero",
    "me lo llevo",
    "me llevo",
  ]);
}

function solicitaExplorarMarca(mensaje, opciones = {}) {
  const texto = normalizar(mensaje);
  return Boolean(
    opciones.pidioReferencias ||
      (opciones.pidioMarcas && !tieneIntencionAgregarProducto(mensaje)) ||
      contieneAlguno(texto, ["que mas tienes", "que otras referencias", "otras referencias", "que referencias"])
  );
}

function lineasItems(items) {
  return items
    .map(
      (item) =>
        `- ${item.cantidad || 1} x ${item.marca.marca} ${item.referencia.nombre} ${
          item.presentacion.peso
        }: ${formatearPrecio(
          item.presentacion.precio * (item.cantidad || 1)
        )}`
    )
    .join("\n");
}

function presentacionesReferencia(referencia) {
  return referencia.presentaciones
    .map((presentacion) => `- ${presentacion.peso}: ${formatearPrecio(presentacion.precio)}`)
    .join("\n");
}

function guardarProductosConsultados(estado, items) {
  estado.productosConsultados = items.map((item) => ({
    marca: item.marca.marca,
    referencia: item.referencia.nombre,
    peso: item.presentacion.peso,
    precio: item.presentacion.precio,
    cantidad: item.cantidad || 1,
  }));
}

function lineasItemsConsultados(items) {
  return items
    .map(
      (item) =>
        `- ${item.marca.marca} ${item.referencia.nombre} ${item.presentacion.peso}: ${formatearPrecio(
          item.presentacion.precio
        )}`
    )
    .join("\n");
}

function guardarReferenciasPendientes(estado, marca, referencias, contexto = {}) {
  estado.referenciasPendientes = {
    marca: marca.marca,
    referencias: referencias.map((referencia) => referencia.nombre),
    texto: contexto.texto || "",
    criterios: contexto.criterios || {},
    cantidad: contexto.cantidad || 1,
    quiereDomicilio: Boolean(contexto.quiereDomicilio),
    datosDomicilio: contexto.datosDomicilio || {},
  };
}

function criteriosDesdeProducto(producto = {}) {
  const criterios = {};

  if (["perro", "gato"].includes(producto.especie)) criterios.especie = producto.especie;
  if (["adulto", "cachorro"].includes(producto.etapa)) criterios.etapa = producto.etapa;
  if (["pequeno", "grande", "todas"].includes(producto.tamano)) criterios.tamano = producto.tamano;
  if (Array.isArray(producto.sabores) && producto.sabores.length) criterios.sabores = producto.sabores;

  return criterios;
}

function criteriosDesdeInterpretacion(interpretacion = {}) {
  return criteriosDesdeProducto(interpretacion?.producto || {});
}

function buscarMarcaInterpretada(catalogo, interpretacion) {
  const nombre = interpretacion?.producto?.marca;
  if (!nombre) return null;

  return buscarMarcaPorNombre(catalogo, nombre) || buscarMarca(catalogo, nombre);
}

function buscarReferenciaInterpretada(marca, interpretacion, criterios) {
  const nombre = interpretacion?.producto?.referencia;
  if (!nombre) return null;

  const texto = normalizar(nombre);
  return (
    marca.referencias.find(
      (referencia) =>
        normalizar(referencia.nombre) === texto ||
        contieneFrase(normalizar(referencia.nombre), texto) ||
        contieneFrase(texto, referencia.nombre)
    ) || buscarReferenciaExacta(marca, nombre, criterios)
  );
}

function buscarPresentacionInterpretada(referencia, interpretacion, mensaje) {
  const presentacionSolicitada = extraerPresentacionSolicitada(mensaje);
  if (presentacionSolicitada) {
    return (
      referencia.presentaciones.find(
        (presentacion) => normalizarPeso(presentacion.peso) === presentacionSolicitada
      ) || null
    );
  }

  const presentacion = interpretacion?.producto?.presentacion;
  if (presentacion) {
    const encontrada = buscarPresentacion(referencia, presentacion);
    if (encontrada) return encontrada;
  }

  return buscarPresentacion(referencia, mensaje);
}

function cantidadInterpretada(interpretacion, mensaje) {
  const cantidad = Number(interpretacion?.producto?.cantidad);
  if (Number.isInteger(cantidad) && cantidad > 0 && cantidad < 100) return cantidad;
  return extraerCantidad(mensaje) || 1;
}

function productosInterpretados(interpretacion = {}) {
  if (Array.isArray(interpretacion.productos) && interpretacion.productos.length > 1) {
    return interpretacion.productos;
  }

  return [];
}

function resolverAgregarConsultadosIA(estado, catalogo, interpretacion) {
  const consultados = estado.productosConsultados || [];
  if (!consultados.length) return null;
  if (!["agregar", "nuevo_pedido"].includes(interpretacion?.accion)) return null;

  const productos = Array.isArray(interpretacion.productos) && interpretacion.productos.length
    ? interpretacion.productos
    : interpretacion.producto
      ? [interpretacion.producto]
      : [];
  const pideTodos = !productos.length || productos.every((producto) => !producto.marca && !producto.referencia && !producto.presentacion);
  const seleccionados = pideTodos
    ? consultados
    : consultados.filter((item) =>
        productos.some((producto) => {
          const coincideMarca = !producto.marca || normalizar(producto.marca) === normalizar(item.marca);
          const coincideReferencia =
            !producto.referencia ||
            normalizar(producto.referencia) === normalizar(item.referencia) ||
            contieneFrase(normalizar(item.referencia), producto.referencia);
          const coincidePeso = !producto.presentacion || normalizarPeso(producto.presentacion) === normalizarPeso(item.peso);
          return coincideMarca && coincideReferencia && coincidePeso;
        })
      );

  if (!seleccionados.length) return null;

  const agregados = [];
  seleccionados.forEach((item) => {
    const marca = buscarMarcaPorNombre(catalogo, item.marca);
    const referencia = marca?.referencias.find((referencia) => referencia.nombre === item.referencia);
    const presentacion = referencia?.presentaciones.find((presentacion) => normalizarPeso(presentacion.peso) === normalizarPeso(item.peso));
    if (!marca || !referencia || !presentacion) return;

    agregarAlCarrito(estado, marca, referencia, presentacion, item.cantidad || 1);
    agregados.push({ marca, referencia, presentacion, cantidad: item.cantidad || 1 });
  });

  if (!agregados.length) return null;

  estado.productosConsultados = [];
  return `Listo, agregué al pedido:\n${lineasItems(agregados)}\n\n${productoAgregadoRespuesta(estado)}`;
}

function aplicarDatosInterpretados(estado, interpretacion = {}) {
  const entrega = interpretacion.entrega || {};
  const datosCliente = interpretacion.datosCliente || {};

  if (entrega.tipo) {
    estado.entrega = {
      ...(estado.entrega || {}),
      tipo: entrega.tipo,
      sede: entrega.sede || estado.entrega?.sede || null,
    };
  }

  if (entrega.metodoPago) estado.metodoPago = entrega.metodoPago;

  const datos = {};
  if (datosCliente.nombre) datos.nombre = datosCliente.nombre;
  if (datosCliente.cedula) datos.cedula = datosCliente.cedula;
  if (datosCliente.correo) datos.correo = datosCliente.correo;
  if (datosCliente.celular) datos.celular = datosCliente.celular;

  if (entrega.direccion) {
    if (entrega.direccionCompleta === false) {
      datos.direccionParcial = entrega.direccion;
    } else {
      datos.direccion = entrega.direccion;
    }
  }

  if (!datos.direccion && entrega.sector) datos.sector = entrega.sector;

  if (Object.keys(datos).length) {
    estado.datosDomicilio = { ...estado.datosDomicilio, ...datos };
  }
}

function preguntaReferenciaFaltante(marca, referencias, interpretacion = {}) {
  const faltante = interpretacion.faltanteSugerido;
  const lista = referencias.map((referencia) => `- ${referencia.nombre}`).join("\n");

  if (faltante === "tamano") {
    return `Perfecto, ya tengo claro que es ${interpretacion.producto?.etapa || "para tu mascota"}. Solo me falta el tamaño para escoger bien:\n${lista}`;
  }

  return `Para escoger bien en ${marca.marca}, dime cuál de estas opciones necesitas:\n${lista}`;
}

function buscarPresentacionProducto(referencia, producto = {}) {
  if (!producto.presentacion) return null;
  const solicitada = normalizarPeso(producto.presentacion);
  return (
    referencia.presentaciones.find((presentacion) => normalizarPeso(presentacion.peso) === solicitada) || null
  );
}

function respuestaPresentacionProductoNoDisponible(marca, referencia, producto = {}) {
  if (!producto.presentacion) return null;
  const solicitada = normalizarPeso(producto.presentacion);
  if (!solicitada || presentacionDisponible(referencia, solicitada)) return null;
  return respuestaPresentacionNoDisponible(marca, referencia, solicitada);
}

function resolverProductosInterpretadosIA(mensaje, estado, catalogo, interpretacion) {
  const productos = productosInterpretados(interpretacion);
  if (!productos.length) return null;
  const esConsulta = interpretacion.accion === "consultar" || interpretacion.intencion === "consulta_producto";

  const agregados = [];
  const consultados = [];
  const pendientes = [];
  const noDisponibles = [];

  productos.forEach((producto) => {
    const marca = buscarMarcaPorNombre(catalogo, producto.marca) || buscarMarca(catalogo, producto.marca || "");
    if (!marca) {
      pendientes.push({ producto, razon: "marca" });
      return;
    }

    const criterios = mezclarCriterios(extraerCriterios(mensaje), criteriosDesdeProducto(producto));
    const referencias = referenciasPorCriterios(marca, criterios);
    const referencia =
      buscarReferenciaInterpretada(marca, { producto }, criterios) ||
      elegirMejorReferencia(referencias, criterios, producto.referencia || mensaje);
    const cantidad = Number.isInteger(Number(producto.cantidad)) && Number(producto.cantidad) > 0
      ? Number(producto.cantidad)
      : 1;

    if (!referencia) {
      pendientes.push({ marca, referencias, producto, criterios, cantidad });
      return;
    }

    const presentacionNoDisponible = respuestaPresentacionProductoNoDisponible(marca, referencia, producto);
    if (presentacionNoDisponible) {
      noDisponibles.push(presentacionNoDisponible);
      estado.ultimaSeleccion = {
        marca: marca.marca,
        referencia: referencia.nombre,
        presentacion: null,
        cantidad,
      };
      return;
    }

    const presentacion = buscarPresentacionProducto(referencia, producto);
    if (!presentacion) {
      pendientes.push({ marca, referencias: [referencia], referencia, producto, criterios, cantidad });
      return;
    }

    if (esConsulta) {
      consultados.push({ marca, referencia, presentacion, cantidad });
      return;
    }

    agregarAlCarrito(estado, marca, referencia, presentacion, cantidad);
    agregados.push({ marca, referencia, presentacion, cantidad });
  });

  if (!agregados.length && !consultados.length && !pendientes.length && !noDisponibles.length) return null;

  if (agregados.length || consultados.length) {
    const ultimo = (agregados.length ? agregados : consultados)[(agregados.length ? agregados : consultados).length - 1];
    estado.marca = ultimo.marca.marca;
    estado.criterios = criteriosDesdeReferencia(ultimo.referencia);
    estado.ultimaSeleccion = null;
    estado.referenciasPendientes = null;
  }

  const partes = [];
  if (consultados.length) {
    guardarProductosConsultados(estado, consultados);
    partes.push(`Estos son los precios:\n${lineasItemsConsultados(consultados)}\n\nSi te sirve alguno, dime cuál quieres agregar al pedido.`);
  }

  if (agregados.length) {
    partes.push(`Listo, agregué al pedido:\n${lineasItems(agregados)}\n\n${resumenCarrito(estado)}`);
  }

  if (noDisponibles.length) partes.push(noDisponibles[0]);

  if (pendientes.length) {
    const pendiente = pendientes[0];
    if (pendiente.marca && pendiente.referencias?.length) {
      guardarReferenciasPendientes(estado, pendiente.marca, pendiente.referencias, {
        texto: mensaje,
        criterios: pendiente.criterios,
        cantidad: pendiente.cantidad,
        quiereDomicilio: interpretacion.entrega?.tipo === "domicilio",
        datosDomicilio: estado.datosDomicilio,
      });
      const lista = pendiente.referencias.map((referencia) => `- ${referencia.nombre}`).join("\n");
      partes.push(`Para completar otro producto, dime cuál referencia necesitas:\n${lista}`);
    } else {
      partes.push("Me quedó un producto sin marca clara. Dime la marca y lo agrego al pedido.");
    }
  }

  if (agregados.length && !pendientes.length && !noDisponibles.length) {
    if (estado.entrega?.tipo === "domicilio" && tieneDireccionIncompleta(estado)) {
      partes.push(solicitarDireccionCompleta(estado));
    } else if (interpretacion.entrega?.tipo === "domicilio" || tieneDatosDomicilioUtiles(estado.datosDomicilio)) {
      partes.push(solicitarDatosDomicilio(estado));
    } else {
      partes.push(productoAgregadoRespuesta(estado));
    }
  }

  return partes.join("\n\n");
}

function resolverConInterpretacionIA(mensaje, estado, catalogo, interpretacion) {
  if (!interpretacion || interpretacion.confianza < 0.55) return null;

  aplicarDatosInterpretados(estado, interpretacion);

  if (interpretacion.accion === "nuevo_pedido" && estado.pedidoConfirmado && estado.carrito.length) {
    iniciarNuevoPedido(estado);
    aplicarDatosInterpretados(estado, interpretacion);
  }

  if (!["pedido_producto", "consulta_producto"].includes(interpretacion.intencion)) return null;
  if (!["agregar", "consultar", "nuevo_pedido", null].includes(interpretacion.accion)) return null;

  const respuestaConsultados = resolverAgregarConsultadosIA(estado, catalogo, interpretacion);
  if (respuestaConsultados) return respuestaConsultados;

  const respuestaProductos = resolverProductosInterpretadosIA(mensaje, estado, catalogo, interpretacion);
  if (respuestaProductos) return respuestaProductos;

  const marca = buscarMarcaInterpretada(catalogo, interpretacion) || buscarMarca(catalogo, mensaje);
  if (!marca) return null;

  const criteriosIA = criteriosDesdeInterpretacion(interpretacion);
  const criteriosBase = estado.referenciasPendientes?.marca === marca.marca ? estado.referenciasPendientes.criterios || {} : estado.criterios;
  const criterios = mezclarCriterios(criteriosBase || {}, mezclarCriterios(extraerCriterios(mensaje), criteriosIA));
  const referencias = referenciasPorCriterios(marca, criterios);
  if (!referencias.length) return null;

  let referencia =
    buscarReferenciaInterpretada(marca, interpretacion, criterios) ||
    buscarReferenciaExacta(marca, mensaje, criterios) ||
    elegirMejorReferencia(referencias, criterios, mensaje);

  if (referencia && !referencias.some((item) => item.nombre === referencia.nombre)) {
    referencia = null;
  }

  const cantidad = cantidadInterpretada(interpretacion, mensaje);

  if (!referencia) {
    const presentacionNoDisponibleEnReferencias = respuestaSiPresentacionSolicitadaNoDisponibleEnReferencias(
      marca,
      referencias,
      criterios,
      mensaje
    );
    if (presentacionNoDisponibleEnReferencias) {
      estado.marca = marca.marca;
      estado.criterios = criterios;
      guardarReferenciasPendientes(estado, marca, referencias, {
        texto: mensaje,
        criterios,
        cantidad,
        quiereDomicilio: interpretacion.entrega?.tipo === "domicilio" || detectarTipoEntrega(mensaje) === "domicilio",
        datosDomicilio: estado.datosDomicilio,
      });
      return presentacionNoDisponibleEnReferencias;
    }

    guardarReferenciasPendientes(estado, marca, referencias, {
      texto: mensaje,
      criterios,
      cantidad,
      quiereDomicilio: interpretacion.entrega?.tipo === "domicilio" || detectarTipoEntrega(mensaje) === "domicilio",
      datosDomicilio: estado.datosDomicilio,
    });
    estado.marca = marca.marca;
    estado.criterios = criterios;
    return preguntaReferenciaFaltante(marca, referencias, interpretacion);
  }

  const presentacionNoDisponible = respuestaSiPresentacionSolicitadaNoDisponible(marca, referencia, mensaje);
  if (presentacionNoDisponible) {
    estado.marca = marca.marca;
    estado.criterios = { ...criteriosDesdeReferencia(referencia), ...criterios };
    estado.ultimaSeleccion = {
      marca: marca.marca,
      referencia: referencia.nombre,
      presentacion: null,
      cantidad,
    };
    return presentacionNoDisponible;
  }

  const presentacion = buscarPresentacionInterpretada(referencia, interpretacion, mensaje);
  estado.marca = marca.marca;
  estado.criterios = { ...criteriosDesdeReferencia(referencia), ...criterios };
  estado.referenciasPendientes = null;
  estado.ultimaSeleccion = {
    marca: marca.marca,
    referencia: referencia.nombre,
    presentacion: presentacion?.peso || null,
    cantidad,
  };

  if (!presentacion) {
    return formatearReferencia(marca, referencia, "¿Cuál presentación quieres agregar al pedido?");
  }

  if (interpretacion.accion === "consultar" || interpretacion.intencion === "consulta_producto") {
    const consultado = { marca, referencia, presentacion, cantidad };
    guardarProductosConsultados(estado, [consultado]);
    estado.ultimaSeleccion = null;
    return `Estos son los precios:\n${lineasItemsConsultados([consultado])}\n\nSi te sirve, dime si quieres agregarlo al pedido.`;
  }

  agregarAlCarrito(estado, marca, referencia, presentacion, cantidad);
  estado.ultimaSeleccion = null;

  if (estado.entrega?.tipo === "domicilio" && tieneDireccionIncompleta(estado)) {
    return respuestaProductoAgregado(estado, marca, referencia, presentacion, { pedirDireccionCompleta: true });
  }

  if (interpretacion.entrega?.tipo === "domicilio" || tieneDatosDomicilioUtiles(estado.datosDomicilio)) {
    return respuestaProductoAgregado(estado, marca, referencia, presentacion, { pedirDatosDomicilio: true });
  }

  return respuestaProductoAgregado(estado, marca, referencia, presentacion);
}

function elegirReferenciaPendiente(referencias, criterios, mensaje) {
  if (!referencias.length) return null;
  if (referencias.length === 1) return referencias[0];

  const ordenadas = referencias
    .map((referencia) => ({
      referencia,
      puntos: puntuarReferencia(referencia, criterios, mensaje),
    }))
    .sort((a, b) => b.puntos - a.puntos);

  const [primera, segunda] = ordenadas;
  if (primera.puntos > 0 && primera.puntos >= segunda.puntos + 1) {
    return primera.referencia;
  }

  return null;
}

function necesitaMasDetalleParaReferencia(referencias, criterios, mensaje) {
  if (referencias.length <= 1) return false;

  const texto = normalizar(mensaje);
  const soloRepiteEtapa =
    Boolean(criterios.etapa) &&
    contieneFrase(texto, criterios.etapa) &&
    !criterios.tamano &&
    !contieneAlguno(texto, ["grande", "grandes", "mediano", "mediana", "medianos", "medianas", "pequeno", "pequena", "pequenos", "pequenas", "mini"]);

  if (!soloRepiteEtapa) return false;

  const tamanos = valoresUnicos(referencias.map((referencia) => atributosReferencia(referencia).tamano).filter(Boolean));
  return tamanos.length > 1;
}

function resolverProductosExplicitos(mensaje, estado, catalogo, opciones = {}) {
  const segmentos = segmentosPorMarca(catalogo, mensaje);
  if (!segmentos.length) return null;

  const tienePresentacion = segmentos.some((segmento) => mensajeTienePresentacionExplicita(segmento.texto));
  const quiereAgregar = tieneIntencionAgregarProducto(mensaje);
  const esConsultaInformativa =
    opciones.pidioMarcas || opciones.pidioReferencias || opciones.pidioOpinion || opciones.pidioRecomendacion;

  if (esConsultaInformativa && !quiereAgregar && !tienePresentacion) return null;
  if (segmentos.length === 1 && !quiereAgregar && !tienePresentacion) return null;

  const agregados = [];
  const pendientesPresentacion = [];
  const pendientesReferencia = [];
  const presentacionesNoDisponibles = [];

  segmentos.forEach((segmento) => {
    const criterios = extraerCriterios(segmento.texto);
    const cantidad = extraerCantidad(segmento.texto) || 1;
    const datosDomicilio = extraerDatosDomicilio(mensaje);
    const tipoEntrega = detectarTipoEntrega(mensaje) || (datosDomicilio.direccion ? "domicilio" : null);
    if (tipoEntrega) {
      estado.entrega = {
        ...(estado.entrega || {}),
        tipo: tipoEntrega,
        sede: tipoEntrega === "recoger" ? detectarSedeRecogida(segmento.texto) : estado.entrega?.sede || null,
      };
    }
    const metodoPago = detectarMetodoPago(mensaje);
    if (metodoPago) estado.metodoPago = metodoPago;

    const referencias = referenciasPorCriterios(segmento.marca, criterios);
    const referencia =
      buscarReferenciaExacta(segmento.marca, segmento.texto, criterios) ||
      elegirMejorReferencia(referencias, criterios, segmento.texto);

    if (!referencia) {
      const presentacionNoDisponible = respuestaSiPresentacionSolicitadaNoDisponibleEnReferencias(
        segmento.marca,
        referencias,
        criterios,
        segmento.texto
      );
      if (presentacionNoDisponible) {
        presentacionesNoDisponibles.push({
          respuesta: presentacionNoDisponible,
          marca: segmento.marca,
          referencias,
          texto: segmento.texto,
          criterios,
          cantidad,
          quiereDomicilio: tipoEntrega === "domicilio",
          datosDomicilio,
        });
        return;
      }

      if (quiereAgregar || tieneCriterios(criterios) || segmentos.length > 1) {
        pendientesReferencia.push({
          marca: segmento.marca,
          referencias,
          texto: segmento.texto,
          criterios,
          cantidad,
          quiereDomicilio: solicitaCierre(mensaje),
          datosDomicilio,
        });
      }
      return;
    }

    const presentacionNoDisponible = respuestaSiPresentacionSolicitadaNoDisponible(
      segmento.marca,
      referencia,
      segmento.texto
    );
    if (presentacionNoDisponible) {
      presentacionesNoDisponibles.push({
        respuesta: presentacionNoDisponible,
        marca: segmento.marca,
        referencia,
        referencias: [referencia],
        texto: segmento.texto,
        criterios: criteriosDesdeReferencia(referencia),
        cantidad,
        quiereDomicilio: tipoEntrega === "domicilio",
        datosDomicilio,
      });
      return;
    }

    const presentacion = buscarPresentacion(referencia, segmento.texto);

    if (presentacion) {
      if (tieneDatosDomicilioUtiles(datosDomicilio)) {
        estado.datosDomicilio = { ...estado.datosDomicilio, ...datosDomicilio };
      }

      agregarAlCarrito(estado, segmento.marca, referencia, presentacion, cantidad);
      agregados.push({ marca: segmento.marca, referencia, presentacion, cantidad });
      return;
    }

    pendientesPresentacion.push({ marca: segmento.marca, referencia, cantidad });
  });

  if (
    !agregados.length &&
    !pendientesPresentacion.length &&
    !pendientesReferencia.length &&
    !presentacionesNoDisponibles.length
  ) return null;

  estado.alternativaPendiente = null;
  estado.esperandoMarca = false;
  estado.esperandoPresupuesto = false;
  estado.pendienteRecomendacion = false;
  estado.esperandoConfirmacionDomicilio = false;
  estado.referenciasPendientes = null;

  if (agregados.length) {
    const ultimo = agregados[agregados.length - 1];
    estado.marca = ultimo.marca.marca;
    estado.criterios = criteriosDesdeReferencia(ultimo.referencia);
    estado.ultimaSeleccion = null;
  }

  if (presentacionesNoDisponibles.length) {
    const pendiente = presentacionesNoDisponibles[0];
    estado.marca = pendiente.marca.marca;
    estado.criterios = pendiente.criterios || {};
    estado.ultimaSeleccion =
      pendiente.referencia
        ? {
            marca: pendiente.marca.marca,
            referencia: pendiente.referencia.nombre,
            presentacion: null,
            cantidad: pendiente.cantidad,
          }
        : null;

    if (!pendiente.referencia) {
      guardarReferenciasPendientes(estado, pendiente.marca, pendiente.referencias, {
        texto: pendiente.texto,
        criterios: pendiente.criterios,
        cantidad: pendiente.cantidad,
        quiereDomicilio: pendiente.quiereDomicilio,
        datosDomicilio: pendiente.datosDomicilio,
      });
    }

    const intro = agregados.length
      ? `Listo, ya agregué al pedido:\n${lineasItems(agregados)}\n\n${resumenCarrito(estado)}\n\n`
      : "";

    return `${intro}${pendiente.respuesta}`;
  }

  if (pendientesPresentacion.length) {
    const pendiente = pendientesPresentacion[0];
    estado.productosPendientes = pendientesPresentacion.map((item) => ({
      marca: item.marca.marca,
      referencia: item.referencia.nombre,
      cantidad: item.cantidad,
    }));
    estado.marca = pendiente.marca.marca;
    estado.criterios = criteriosDesdeReferencia(pendiente.referencia);
    estado.ultimaSeleccion = {
      marca: pendiente.marca.marca,
      referencia: pendiente.referencia.nombre,
      presentacion: null,
      cantidad: pendiente.cantidad,
    };

    const intro = agregados.length
      ? `Listo, ya agregué al pedido:\n${lineasItems(agregados)}\n\n${resumenCarrito(estado)}`
      : "Sí, te ayudo con ese pedido.";

    return `${intro}\n\nPara completar ${pendiente.marca.marca} ${pendiente.referencia.nombre}, dime qué presentación quieres:\n${presentacionesReferencia(pendiente.referencia)}`;
  }

  if (pendientesReferencia.length) {
    const pendiente = pendientesReferencia[0];
    estado.marca = pendiente.marca.marca;
    estado.ultimaSeleccion = null;

    const referencias = (pendiente.referencias.length ? pendiente.referencias : pendiente.marca.referencias)
      .map((referencia) => `- ${referencia.nombre}`)
      .join("\n");
    guardarReferenciasPendientes(
      estado,
      pendiente.marca,
      pendiente.referencias.length ? pendiente.referencias : pendiente.marca.referencias,
      {
        texto: pendiente.texto,
        criterios: pendiente.criterios,
        cantidad: pendiente.cantidad,
        quiereDomicilio: pendiente.quiereDomicilio,
        datosDomicilio: pendiente.datosDomicilio,
      }
    );
    const intro = agregados.length
      ? `Listo, ya agregué al pedido:\n${lineasItems(agregados)}\n\n${resumenCarrito(estado)}`
      : `Claro, revisemos ${pendiente.marca.marca}.`;

    return `${intro}\n\nPara estar seguro, ¿cuál referencia de ${pendiente.marca.marca} necesitas?\n${referencias}`;
  }

  estado.productosPendientes = [];
  estado.referenciasPendientes = null;

  if (estado.entrega?.tipo === "domicilio" && tieneDireccionIncompleta(estado)) {
    return `Listo, agregué al pedido:\n${lineasItems(agregados)}\n\n${solicitarDireccionCompleta(estado)}`;
  }

  return `Listo, agregué al pedido:\n${lineasItems(agregados)}\n\n${productoAgregadoRespuesta(estado)}`;
}

function extraerDatosDomicilio(mensaje) {
  const datos = {};
  const texto = mensaje
    .toString()
    .replace(/,\s*\./g, ".")
    .replace(/@\s+/g, "@")
    .replace(/\s+\./g, ".");
  const textoNormalizado = normalizar(mensaje);
  const etiquetas = "nombre|cedula|c[eé]dula|cc|c\\.c\\.|correo|email|e-mail|celular|telefono|tel[eé]fono|tel|direccion|direcci[oó]n|dir";

  const limpiarCampo = (valor) =>
    valor
      .replace(/^[\s,:;-]+|[\s,:;-]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const campoEtiquetado = (labels) => {
    const regex = new RegExp(
      `(?:${labels})\\s*:?\\s*([\\s\\S]*?)(?=(?:\\s*[,\\n;]\\s*)?(?:${etiquetas})\\s*:?|$)`,
      "i"
    );
    const match = texto.match(regex);
    return match ? limpiarCampo(match[1]) : null;
  };

  const correo = texto.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (correo) datos.correo = correo[0];

  const cedula = campoEtiquetado("cedula|c[eé]dula|cc|c\\.c\\.");
  if (cedula) {
    const numeroCedula = cedula.match(/\d{6,12}/);
    if (numeroCedula) datos.cedula = numeroCedula[0];
  }

  const celular = campoEtiquetado("celular|telefono|tel[eé]fono|tel");
  if (celular) {
    const numeroCelular = celular.match(/\+?\d[\d\s-]{7,16}/);
    if (numeroCelular) datos.celular = numeroCelular[0].replace(/\D/g, "");
  }

  const direccion = campoEtiquetado("direccion|direcci[oó]n|dir");
  if (direccion) asignarDireccionDetectada(datos, direccion);

  const nombre = campoEtiquetado("nombre|me llamo|soy");
  if (nombre) datos.nombre = nombre.replace(/\d+/g, "").trim();

  if (!datos.direccion) {
    const direccionCompleta = extraerDireccionCompleta(texto);
    if (direccionCompleta) asignarDireccionDetectada(datos, direccionCompleta);
  }

  if (!datos.direccion) {
    const direccionInline = texto.match(
      /\b(?:para\s+(?:la|el)?\s*)?((?:cll|calle|cra|carrera|kr|cr|av|avenida|diag|diagonal|transversal|tv|mz|manzana|apto|apartamento)\s+[a-z0-9#.\-\s]{3,60}?)(?=\s+(?:nombre|cedula|c[eé]dula|cc|correo|email|celular|telefono|tel|por favor)\b|[,;\n]|$)/i
    );

    if (direccionInline) {
      asignarDireccionDetectada(datos, limpiarCampo(direccionInline[1]));
    }
  }

  if (!datos.direccion) {
    const sector = extraerSectorDomicilio(texto);
    if (sector) datos.sector = sector;
  }

  if (!datos.celular) {
    const posibleCelular = textoNormalizado.match(/\b3\d{9}\b/);
    if (posibleCelular) datos.celular = posibleCelular[0];
  }

  if (!datos.cedula) {
    const numeros = textoNormalizado.match(/\b\d{6,12}\b/g) || [];
    const posibleCedula = numeros.find((numero) => numero !== datos.celular);
    if (posibleCedula) datos.cedula = posibleCedula;
  }

  const lineas = texto
    .split(/\n|;/)
    .map((linea) => limpiarCampo(linea))
    .filter(Boolean);

  for (const linea of lineas) {
    const lineaNormalizada = normalizar(linea);

    if (!datos.correo) {
      const emailLinea = linea.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (emailLinea) {
        datos.correo = emailLinea[0];
        continue;
      }
    }

    if (!datos.celular) {
      const celularLinea = lineaNormalizada.match(/\b3\d{9}\b/);
      if (celularLinea) {
        datos.celular = celularLinea[0];
        continue;
      }
    }

    if (!datos.cedula) {
      const cedulaLinea = lineaNormalizada.match(/^\d{6,12}$/);
      if (cedulaLinea && cedulaLinea[0] !== datos.celular) {
        datos.cedula = cedulaLinea[0];
        continue;
      }
    }

    if (!datos.direccion && pareceDireccion(linea)) {
      asignarDireccionDetectada(datos, linea);
      continue;
    }

    if (!datos.nombre && pareceNombre(linea)) {
      datos.nombre = linea;
    }
  }

  if (lineas.length > 1) {
    asignarDatosPorOrden(lineas, datos);
  }

  return datos;
}

function pareceDireccion(valor = "") {
  const texto = normalizar(valor);
  return (
    valor.includes("#") ||
    /^(cll|calle|cra|carrera|kr|cr|av|avenida|diag|diagonal|transversal|tv|mz|manzana|apto|apartamento)\b/.test(texto)
  );
}

function extraerDireccionCompleta(texto = "") {
  const patrones = [
    /\b((?:cll|calle|cra|carrera|kr|cr|av|avenida|diag|diagonal|transversal|tv)\s+\d+[a-z]?\s*#\s*\d+[a-z]?\s*[- ]\s*\d+[a-z]?(?:\s+[a-z0-9áéíóúñ ]{2,30})?)/i,
    /\b((?:mz|manzana)\s*[a-z0-9-]+\s+(?:casa|apto|apartamento)\s*[a-z0-9-]+(?:\s+[a-z0-9áéíóúñ ]{2,30})?)/i,
    /\b((?:torre|bloque|blq)\s*[a-z0-9-]+\s+(?:apto|apartamento|casa)\s*[a-z0-9-]+(?:\s+[a-z0-9áéíóúñ ]{2,30})?)/i,
  ];

  for (const patron of patrones) {
    const match = texto.match(patron);
    if (match) return match[1].trim();
  }

  return null;
}

function direccionEsCompleta(valor = "") {
  const texto = normalizar(valor);

  if (/#\s*\d+[a-z]?\s*[- ]\s*\d+/i.test(valor)) return true;
  if (/\b(?:casa|apto|apartamento|torre|interior|int|bloque|blq)\s*[a-z0-9-]+\b/i.test(valor)) return true;
  if (/\b(?:mz|manzana)\s*[a-z0-9-]+.*\b(?:casa|apto|apartamento)\s*[a-z0-9-]+\b/i.test(valor)) return true;
  if (/^(?:cll|calle|cra|carrera|kr|cr|av|avenida|diag|diagonal|transversal|tv)\b/.test(texto)) {
    return false;
  }

  return false;
}

function asignarDireccionDetectada(datos, valor) {
  const direccion = valor
    .replace(/\b(?:porfa|por favor|mil gracias|muchas gracias|gracias|datafono|datáfono)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!direccion) return;

  if (direccionEsCompleta(direccion)) {
    datos.direccion = direccion;
    delete datos.direccionParcial;
    return;
  }

  datos.direccionParcial = direccion;
}

function extraerSectorDomicilio(texto = "") {
  const limpio = texto.replace(/\s+/g, " ");
  const match = limpio.match(
    /\b(?:domicilio|env[ií]o|enviar|llevar|llevarlo)\b[\s,.:;-]*(?:(?:para|a|al|a la|ala|en|hacia)\s+)?([^.,;\n]{3,50})/i
  );

  if (!match) {
    const directo = limpio.match(/\b(?:a la|ala|al|en el|en la|para el|para la)\s+([^.,;\n]{3,40})/i);
    if (!directo) return null;
    return limpiarSector(directo[1]);
  }

  return limpiarSector(match[1]);
}

function limpiarSector(valor = "") {
  const sector = valor
    .replace(
      /\b(?:bulto|bolsa|paquete|saco|dog|chow|chunky|adulto|cachorro|para|por favor|x\s*\d+|\d+\s*(kg|kl|kilos?))\b.*$/i,
      ""
    )
    .replace(/^[\s,:;-]+|[\s,:;-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!sector || sector.length < 3 || pareceDireccion(sector)) return null;
  return sector;
}

function pareceNombre(valor = "") {
  const texto = normalizar(valor);
  return (
    /^[a-zA-ZÁÉÍÓÚÜÑáéíóúüñ ]{3,50}$/.test(valor) &&
    !texto.includes("gmail") &&
    !texto.includes("hotmail") &&
    !contieneAlguno(texto, PALABRAS_CRITERIO) &&
    !contieneAlguno(texto, [
      "gracias",
      "listo",
      "asi esta bien",
      "esta bien",
      "eso es todo",
      "nada mas",
      "perfecto",
      "tiene",
      "tengo",
      "podrias",
      "podria",
      "enviar",
      "cambie",
      "cambio",
      "direccion",
      "porfa",
      "datafono",
      "datáfono",
      "mascota",
    ])
  );
}

function asignarDatosPorOrden(lineas, datos) {
  const pendientes = lineas.filter((linea) => {
    const texto = normalizar(linea);
    if (datos.cedula && texto === datos.cedula) return false;
    if (datos.correo && linea.includes(datos.correo)) return false;
    if (datos.celular && texto.includes(datos.celular)) return false;
    if (datos.direccion && linea === datos.direccion) return false;
    if (datos.nombre && linea === datos.nombre) return false;
    return true;
  });

  const orden = ["cedula", "correo", "celular", "direccion", "nombre"];

  for (const campo of orden) {
    if (datos[campo]) continue;
    const siguiente = pendientes.shift();
    if (!siguiente) break;

    if (campo === "correo") {
      const correo = siguiente.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (correo) datos.correo = correo[0];
      continue;
    }

    if (campo === "celular") {
      const celular = normalizar(siguiente).match(/\b3\d{9}\b/);
      if (celular) datos.celular = celular[0];
      continue;
    }

    if (campo === "cedula") {
      const cedula = normalizar(siguiente).match(/\b\d{6,12}\b/);
      if (cedula) datos.cedula = cedula[0];
      continue;
    }

    if (campo === "direccion") {
      if (pareceDireccion(siguiente)) asignarDireccionDetectada(datos, siguiente);
      continue;
    }

    if (campo === "nombre" && pareceNombre(siguiente)) {
      datos.nombre = siguiente;
    }
  }
}

function detectarTipoEntrega(mensaje) {
  const texto = normalizar(mensaje);

  if (
    contieneAlguno(texto, [
      "recoger",
      "recojer",
      "recogida",
      "recgoer",
      "recojo",
      "paso por",
      "pasar por",
      "en sede",
      "en la sede",
      "en tienda",
    ])
  ) {
    return "recoger";
  }

  if (contieneAlguno(texto, ["domicilio", "direccion", "enviar", "envio", "llevar", "llevarlo"])) {
    return "domicilio";
  }

  return null;
}

function aplicarTipoEntrega(mensaje, estado) {
  const tipo = detectarTipoEntrega(mensaje);
  if (!tipo) return null;

  estado.entrega = {
    ...(estado.entrega || {}),
    tipo,
  };
  estado.esperandoTipoEntrega = false;
  return tipo;
}

function detectarSedeRecogida(mensaje) {
  const texto = normalizar(mensaje);

  if (texto.includes("18") || contieneFrase(texto, "calle 18")) {
    return SEDES_RECOGIDA[0];
  }

  if (texto.includes("17") || contieneFrase(texto, "carrera 10") || contieneFrase(texto, "cra 10")) {
    return SEDES_RECOGIDA[1];
  }

  return null;
}

function solicitarTipoEntrega(estado) {
  estado.esperandoTipoEntrega = true;
  estado.esperandoConfirmacionDomicilio = false;

  return `${resumenCarrito(estado)}\n\nPerfecto, ¿lo quieres a domicilio o prefieres recogerlo en una sede?`;
}

function solicitarSedeRecogida(estado) {
  estado.esperandoSedeRecogida = true;
  estado.esperandoTipoEntrega = false;

  return `${resumenCarrito(estado)}\n\nClaro, ¿en cuál sede deseas recogerlo?\n${SEDES_RECOGIDA.map((sede) => `- ${sede}`).join("\n")}`;
}

function confirmarRecogida(estado) {
  estado.esperandoSedeRecogida = false;
  estado.esperandoTipoEntrega = false;
  estado.pedidoConfirmado = true;
  estado.confirmacionPedidoId = estado.confirmacionPedidoId || crypto.randomUUID();
  estado.pedidoConfirmadoPendienteGuardar = true;
  estado.pedidoNuevoConDatosPrevios = false;
  estado.datosPreviosConfirmados = true;

  return `${resumenCarrito(estado)}\n\nRecogida en sede:\n- ${estado.entrega.sede}\n\nListo, te lo dejamos separado para recoger en esa sede.`;
}

function detectarMetodoPago(mensaje) {
  const texto = normalizar(mensaje);

  if (contieneAlguno(texto, ["efectivo", "contraentrega", "contra entrega"])) return "efectivo";
  if (contieneAlguno(texto, ["transferencia", "bancolombia", "davivienda", "bre b", "bre-b", "llave"])) {
    return "transferencia bancaria";
  }
  if (contieneAlguno(texto, ["tarjeta", "debito", "credito", "datafono", "datáfono"])) {
    return "tarjeta debito o credito";
  }

  return null;
}

function solicitarMetodoPago(estado) {
  estado.esperandoMetodoPago = true;
  estado.esperandoTipoEntrega = false;
  estado.esperandoConfirmacionDomicilio = false;
  estado.esperandoConfirmacionPedido = false;

  return `${resumenCarrito(estado)}\n\nAntes de tomar los datos de domicilio, dime con qué método de pago deseas cancelar:\n- efectivo\n- transferencia bancaria Bancolombia y/o Davivienda\n- tarjeta débito o crédito\n- llave bre-B`;
}

function instruccionesTransferencia() {
  return `Datos para transferencia:

ahorros bancolombia:
luz merida gomez ospina
nr. 07300007105

ahorros davivienda
nr. 127200128222

llave bre-B: @luzg5604

Recuerde:
- estas son nuestras unicas cuentas autorizadas.
- Enviar el comprobante de pago, gracias.`;
}

function registrarMetodoPago(mensaje, estado) {
  const metodo = detectarMetodoPago(mensaje);
  if (!metodo) return null;

  estado.metodoPago = metodo;
  estado.esperandoMetodoPago = false;
  return metodo;
}

function camposDomicilioFaltantes(estado) {
  return ["cedula", "correo", "celular", "direccion", "nombre"].filter(
    (campo) => !estado.datosDomicilio[campo]
  );
}

function solicitarDatosDomicilio(estado) {
  const faltantes = camposDomicilioFaltantes(estado);
  if (!faltantes.length) {
    return estado.metodoPago ? solicitarConfirmacionPedido(estado) : solicitarMetodoPago(estado);
  }

  estado.esperandoDatosDomicilio = true;
  estado.esperandoConfirmacionDomicilio = false;
  estado.esperandoConfirmacionPedido = false;
  const detalleDireccion =
    !estado.datosDomicilio.direccion && (estado.datosDomicilio.sector || estado.datosDomicilio.direccionParcial)
      ? `\n\nTengo como referencia ${
          estado.datosDomicilio.sector
            ? `el sector ${estado.datosDomicilio.sector}`
            : `la dirección parcial ${estado.datosDomicilio.direccionParcial}`
        }, pero necesito la dirección completa para enviarlo bien.`
      : "";

  return `${resumenCarrito(estado)}${detalleDireccion}\n\nPerfecto, para dejar el domicilio bien tomado me faltan estos datos:\n${faltantes
    .map((campo) => `- ${campo === "direccion" ? "direccion completa" : campo}`)
    .join("\n")}`;
}

function resumenDatosFacturacionYDomicilio(estado) {
  const metodoPago = estado.metodoPago ? `\n- Método de pago: ${estado.metodoPago}` : "";

  return `Datos de facturación y domicilio:
- Nombre: ${estado.datosDomicilio.nombre}
- Cédula: ${estado.datosDomicilio.cedula}
- Celular: ${estado.datosDomicilio.celular}
- Correo: ${estado.datosDomicilio.correo}
- Dirección: ${estado.datosDomicilio.direccion}${metodoPago}`;
}

function solicitarConfirmacionPedido(estado) {
  estado.esperandoDatosDomicilio = false;
  estado.esperandoConfirmacionDomicilio = false;
  estado.esperandoConfirmacionPedido = true;

  return `${resumenCarrito(estado)}\n\n${resumenDatosFacturacionYDomicilio(
    estado
  )}\n\n¿Está todo correcto para confirmar el pedido?`;
}

function confirmarPedido(estado) {
  estado.esperandoDatosDomicilio = false;
  estado.esperandoConfirmacionDomicilio = false;
  estado.esperandoConfirmacionPedido = false;
  estado.esperandoConfirmacionDatosPrevios = false;
  estado.esperandoCambioDireccion = false;
  estado.esperandoConfirmacionDatosFacturacion = false;
  estado.esperandoActualizacionDatosCliente = false;
  estado.pedidoConfirmado = true;
  estado.confirmacionPedidoId = estado.confirmacionPedidoId || crypto.randomUUID();
  estado.pedidoConfirmadoPendienteGuardar = true;
  estado.pedidoNuevoConDatosPrevios = false;
  estado.datosPreviosConfirmados = true;

  return `${resumenCarrito(estado)}\n\n${resumenDatosFacturacionYDomicilio(
    estado
  )}\n\nListo, tu pedido queda confirmado con esos datos.`;
}

function resolverDomicilio(mensaje, estado) {
  const datos = extraerDatosDomicilio(mensaje);

  if (!estado.carrito.length) {
    return "Claro, primero dime qué producto quieres pedir y te ayudo a armar el pedido.";
  }

  if (!estado.esperandoDatosDomicilio && !tieneDatosDomicilioUtiles(datos)) {
    if (!camposDomicilioFaltantes(estado).length) {
      return solicitarConfirmacionPedido(estado);
    }

    return solicitarDatosDomicilio(estado);
  }

  estado.datosDomicilio = { ...datos, ...estado.datosDomicilio };

  if (camposDomicilioFaltantes(estado).length) {
    return solicitarDatosDomicilio(estado);
  }

  return solicitarConfirmacionPedido(estado);
}

function tieneDatosDomicilioUtiles(datos) {
  return Boolean(datos.cedula || datos.correo || datos.celular || datos.direccion || datos.sector || datos.direccionParcial);
}

function requiereConfirmarDatosPrevios(estado) {
  return Boolean(
    estado.pedidoNuevoConDatosPrevios &&
      !estado.datosPreviosConfirmados &&
      estado.entrega?.tipo === "domicilio" &&
      estado.datosDomicilio?.direccion
  );
}

function solicitarConfirmacionDatosPrevios(estado) {
  estado.esperandoConfirmacionDatosPrevios = true;
  estado.esperandoConfirmacionDomicilio = false;
  estado.esperandoDatosDomicilio = false;

  const metodo = estado.metodoPago ? `\n- Método de pago: ${estado.metodoPago}` : "";

  return `${resumenCarrito(estado)}\n\nTengo guardada esta información del pedido anterior:\n- Nombre: ${
    estado.datosDomicilio.nombre || "pendiente"
  }\n- Cédula: ${estado.datosDomicilio.cedula || "pendiente"}\n- Celular: ${
    estado.datosDomicilio.celular || "pendiente"
  }\n- Correo: ${estado.datosDomicilio.correo || "pendiente"}\n- Dirección: ${
    estado.datosDomicilio.direccion
  }${metodo}\n\n¿Lo enviamos a esa misma dirección con esos datos?`;
}

function solicitarNuevaDireccion(estado) {
  estado.entrega = { ...(estado.entrega || {}), tipo: "domicilio" };
  estado.esperandoCambioDireccion = true;
  estado.esperandoConfirmacionDatosPrevios = false;
  estado.esperandoConfirmacionDomicilio = false;
  estado.pedidoConfirmado = false;

  return `${resumenCarrito(estado)}\n\nClaro, dime la nueva dirección de envío y la actualizo.`;
}

function confirmarConDatosActuales(estado) {
  estado.esperandoConfirmacionDatosPrevios = false;
  estado.esperandoCambioDireccion = false;
  estado.esperandoConfirmacionDatosFacturacion = false;
  estado.esperandoActualizacionDatosCliente = false;
  estado.datosPreviosConfirmados = true;

  if (!estado.metodoPago) return solicitarMetodoPago(estado);
  if (camposDomicilioFaltantes(estado).length) return solicitarDatosDomicilio(estado);
  return solicitarConfirmacionPedido(estado);
}

function resolverConfirmacionPedido(mensaje, estado) {
  if (!estado.esperandoConfirmacionPedido) return null;

  const metodoPago = detectarMetodoPago(mensaje);
  if (metodoPago) {
    estado.metodoPago = metodoPago;
    return solicitarConfirmacionPedido(estado);
  }

  if (esAfirmacion(mensaje)) {
    return confirmarPedido(estado);
  }

  if (esNegacion(mensaje)) {
    estado.esperandoConfirmacionPedido = false;
    estado.esperandoActualizacionDatosCliente = true;
    return "Claro, dime qué dato debemos corregir: nombre, cédula, celular, correo o dirección.";
  }

  const datos = extraerDatosDomicilio(mensaje);
  if (Object.keys(datos).length) {
    estado.datosDomicilio = { ...estado.datosDomicilio, ...datos };
    return solicitarConfirmacionPedido(estado);
  }

  estado.esperandoConfirmacionPedido = false;
  return null;
}

function resolverDatosPrevios(mensaje, estado) {
  const datos = extraerDatosDomicilio(mensaje);

  if (estado.esperandoCambioDireccion) {
    if (datos.direccion) {
      estado.datosDomicilio = { ...estado.datosDomicilio, direccion: datos.direccion };
      estado.esperandoCambioDireccion = false;
      estado.esperandoConfirmacionDatosFacturacion = true;
      return `${resumenCarrito(estado)}\n\nListo, actualicé la dirección a: ${datos.direccion}\n\n¿Los datos de nombre, cédula, celular y correo siguen iguales?`;
    }

    return "Claro, pásame la nueva dirección de envío para actualizarla.";
  }

  if (estado.esperandoConfirmacionDatosFacturacion) {
    if (esAfirmacion(mensaje)) {
      return confirmarConDatosActuales(estado);
    }

    if (tieneDatosDomicilioUtiles(datos)) {
      estado.datosDomicilio = { ...estado.datosDomicilio, ...datos };
      return confirmarConDatosActuales(estado);
    }

    if (esNegacion(mensaje)) {
      estado.esperandoConfirmacionDatosFacturacion = false;
      estado.esperandoActualizacionDatosCliente = true;
      return "Listo, envíame los datos que debemos cambiar: nombre, cédula, celular o correo.";
    }
  }

  if (estado.esperandoActualizacionDatosCliente) {
    if (tieneDatosDomicilioUtiles(datos)) {
      estado.datosDomicilio = { ...estado.datosDomicilio, ...datos };
      estado.esperandoActualizacionDatosCliente = false;
      return confirmarConDatosActuales(estado);
    }

    return "Pásame los datos que cambian, por ejemplo nombre, cédula, celular o correo.";
  }

  if (estado.esperandoConfirmacionDatosPrevios) {
    if (solicitaCambioDireccion(mensaje) || esNegacion(mensaje)) {
      if (datos.direccion) {
        estado.datosDomicilio = { ...estado.datosDomicilio, direccion: datos.direccion };
        estado.esperandoConfirmacionDatosPrevios = false;
        estado.esperandoConfirmacionDatosFacturacion = true;
        return `${resumenCarrito(estado)}\n\nListo, actualicé la dirección a: ${datos.direccion}\n\n¿Los demás datos de facturación siguen iguales?`;
      }

      return solicitarNuevaDireccion(estado);
    }

    if (tieneDatosDomicilioUtiles(datos)) {
      estado.datosDomicilio = { ...estado.datosDomicilio, ...datos };
      return confirmarConDatosActuales(estado);
    }

    if (esAfirmacion(mensaje)) {
      return confirmarConDatosActuales(estado);
    }
  }

  return null;
}

function resolverEntregaYPago(mensaje, estado) {
  if (!estado.carrito.length) {
    return "Claro, primero dime qué producto quieres pedir y te ayudo a armar el pedido.";
  }

  const respuestaDatosPrevios = resolverDatosPrevios(mensaje, estado);
  if (respuestaDatosPrevios) return respuestaDatosPrevios;

  if (solicitaCambioDireccion(mensaje)) {
    return solicitarNuevaDireccion(estado);
  }

  aplicarTipoEntrega(mensaje, estado);

  if (estado.esperandoSedeRecogida || (estado.entrega && estado.entrega.tipo === "recoger")) {
    const sede = detectarSedeRecogida(mensaje) || estado.entrega.sede;
    if (sede) {
      estado.entrega = { tipo: "recoger", sede };
      return confirmarRecogida(estado);
    }

    return solicitarSedeRecogida(estado);
  }

  if (estado.esperandoTipoEntrega && !(estado.entrega && estado.entrega.tipo)) {
    return solicitarTipoEntrega(estado);
  }

  if (!(estado.entrega && estado.entrega.tipo)) {
    return solicitarTipoEntrega(estado);
  }

  if (estado.entrega.tipo === "domicilio") {
    const estabaEsperandoMetodoPago = estado.esperandoMetodoPago;
    const metodo = registrarMetodoPago(mensaje, estado);

    if (!estado.metodoPago) {
      return solicitarMetodoPago(estado);
    }

    if (requiereConfirmarDatosPrevios(estado)) {
      return solicitarConfirmacionDatosPrevios(estado);
    }

    if (metodo === "transferencia bancaria" && !estado.instruccionesPagoEnviadas) {
      estado.instruccionesPagoEnviadas = true;
      return `${instruccionesTransferencia()}\n\n${solicitarDatosDomicilio(estado)}`;
    }

    if (estabaEsperandoMetodoPago && metodo) {
      return camposDomicilioFaltantes(estado).length
        ? solicitarDatosDomicilio(estado)
        : solicitarConfirmacionPedido(estado);
    }

    return resolverDomicilio(mensaje, estado);
  }

  return solicitarTipoEntrega(estado);
}

function respuestaPedidoYaConfirmado(mensaje) {
  return elegirVariante(mensaje, [
    "Con muchísimo gusto, tu pedido ya quedó confirmado. Cuando necesites algo más, me escribes y te ayudo con gusto 😊",
    "Perfecto, gracias a ti. Tu pedido queda confirmado; si más adelante necesitas agregar algo, aquí estoy pendiente.",
    "Listo, quedamos atentos. Tu pedido ya está confirmado y cualquier otra cosita que necesites me puedes escribir.",
  ]);
}

function esNegacion(mensaje) {
  const texto = normalizar(mensaje);
  return contieneAlguno(texto, [
    "no",
    "no gracias",
    "otro producto",
    "otra cosa",
    "diferente",
    "algo diferente",
    "producto diferente",
  ]);
}

function solicitaNuevoPedido(mensaje) {
  const texto = normalizar(mensaje);
  return contieneAlguno(texto, [
    "otro pedido",
    "nuevo pedido",
    "pedido nuevo",
    "hacer otro pedido",
    "hacer un pedido nuevo",
    "otra compra",
  ]);
}

function solicitaCambioDireccion(mensaje) {
  const texto = normalizar(mensaje);
  return contieneAlguno(texto, [
    "otro lugar",
    "otro lugar de envio",
    "otra direccion",
    "direccion diferente",
    "cambiar direccion",
    "cambia la direccion",
    "nuevo lugar",
    "nueva direccion",
    "otro domicilio",
    "domicilio diferente",
  ]);
}

function deseaRepetirPedido(mensaje) {
  const texto = normalizar(mensaje);
  return esSaludo(mensaje) || contieneAlguno(texto, ["mismo pedido", "lo mismo", "igual", "repetir", "repite"]);
}

function descripcionEntregaAnterior(estado) {
  if (estado.entrega?.tipo === "recoger" && estado.entrega.sede) {
    return `la recogida en ${estado.entrega.sede}`;
  }

  if (estado.datosDomicilio?.direccion) {
    return `la dirección ${estado.datosDomicilio.direccion}`;
  }

  return "la misma entrega";
}

function preguntarRepetirPedido(estado) {
  estado.esperandoConfirmacionRepetirPedido = true;
  return `${resumenCarrito(estado)}\n\nVeo que ya tenías este pedido confirmado. ¿Quieres repetirlo con ${descripcionEntregaAnterior(
    estado
  )} o prefieres hacer uno diferente?`;
}

function reiniciarConfirmacionPedido(estado) {
  estado.confirmacionPedidoId = null;
  estado.ultimoPedidoGuardadoKey = null;
  estado.ultimoPedidoGuardadoAt = null;
  estado.pedidoConfirmadoPendienteGuardar = false;
}

function iniciarNuevoPedido(estado) {
  const tieneDatosPrevios = Boolean(
    tieneDatosDomicilioUtiles(estado.datosDomicilio || {}) ||
      estado.entrega?.tipo ||
      estado.metodoPago
  );

  estado.carrito = [];
  estado.pedidoConfirmado = false;
  estado.marca = null;
  estado.criterios = {};
  estado.ultimaSeleccion = null;
  estado.productosPendientes = [];
  estado.referenciasPendientes = null;
  estado.alternativaPendiente = null;
  estado.esperandoTipoEntrega = false;
  estado.esperandoSedeRecogida = false;
  estado.esperandoMetodoPago = false;
  estado.esperandoDatosDomicilio = false;
  estado.esperandoPresupuesto = false;
  estado.pendienteRecomendacion = false;
  estado.esperandoMarca = false;
  estado.esperandoConfirmacionDomicilio = false;
  estado.esperandoConfirmacionPedido = false;
  estado.esperandoConfirmacionRepetirPedido = false;
  estado.esperandoConfirmacionDatosPrevios = false;
  estado.esperandoCambioDireccion = false;
  estado.esperandoConfirmacionDatosFacturacion = false;
  estado.esperandoActualizacionDatosCliente = false;
  estado.pedidoNuevoConDatosPrevios = tieneDatosPrevios;
  estado.datosPreviosConfirmados = !tieneDatosPrevios;
  reiniciarConfirmacionPedido(estado);
}

function resolverConfirmacionRepetirPedido(mensaje, estado) {
  if (!estado.esperandoConfirmacionRepetirPedido) return null;

  if (esNegacion(mensaje)) {
    iniciarNuevoPedido(estado);
    return "Claro, hacemos uno diferente. Dime qué producto necesitas ahora y te ayudo a dejarlo listo.";
  }

  if (esAfirmacion(mensaje)) {
    estado.esperandoConfirmacionRepetirPedido = false;
    reiniciarConfirmacionPedido(estado);

    if (estado.entrega?.tipo === "recoger" && estado.entrega.sede) {
      return confirmarRecogida(estado);
    }

    if (estado.entrega?.tipo === "domicilio") {
      if (!estado.metodoPago) return solicitarMetodoPago(estado);
      if (camposDomicilioFaltantes(estado).length) return solicitarDatosDomicilio(estado);
      return solicitarConfirmacionPedido(estado);
    }

    return solicitarTipoEntrega(estado);
  }

  return null;
}

function resolverReferenciaPendiente(mensaje, estado, catalogo, interpretacion = null) {
  if (!estado.referenciasPendientes || estado.ultimaSeleccion || buscarMarca(catalogo, mensaje)) return null;

  const marca = buscarMarcaPorNombre(catalogo, estado.referenciasPendientes.marca);
  if (!marca) return null;

  const referencias = estado.referenciasPendientes.referencias
    .map((nombre) => marca.referencias.find((referencia) => referencia.nombre === nombre))
    .filter(Boolean);
  if (!referencias.length) return null;

  const contextoPendiente = estado.referenciasPendientes;
  const criteriosMensaje = mezclarCriterios(extraerCriterios(mensaje), criteriosDesdeInterpretacion(interpretacion));
  const criterios = mezclarCriterios(contextoPendiente.criterios || {}, criteriosMensaje);

  if (necesitaMasDetalleParaReferencia(referencias, criterios, mensaje)) {
    const opciones = referencias.map((referencia) => `- ${referencia.nombre}`).join("\n");
    return `Sí, sería para adulto. Solo me falta confirmar el tamaño para escoger bien:\n${opciones}`;
  }

  const referencia =
    buscarReferenciaExacta({ ...marca, referencias }, mensaje, criterios) ||
    elegirReferenciaPendiente(referencias, criterios, `${contextoPendiente.texto || ""} ${mensaje}`);

  if (!referencia) return null;

  const cantidad = extraerCantidad(mensaje) || contextoPendiente.cantidad || 1;
  const presentacionNoDisponible = respuestaSiPresentacionSolicitadaNoDisponible(
    marca,
    referencia,
    `${contextoPendiente.texto || ""} ${mensaje}`
  );
  if (presentacionNoDisponible) {
    estado.marca = marca.marca;
    estado.criterios = { ...estado.criterios, ...criteriosDesdeReferencia(referencia), ...criterios };
    estado.ultimaSeleccion = {
      marca: marca.marca,
      referencia: referencia.nombre,
      presentacion: null,
      cantidad,
    };
    estado.referenciasPendientes = null;
    return presentacionNoDisponible;
  }

  const presentacion =
    buscarPresentacionInterpretada(referencia, interpretacion, mensaje) ||
    buscarPresentacion(referencia, mensaje) ||
    buscarPresentacion(referencia, contextoPendiente.texto || "");
  estado.datosDomicilio = {
    ...estado.datosDomicilio,
    ...(contextoPendiente.datosDomicilio || {}),
    ...extraerDatosDomicilio(mensaje),
  };
  estado.marca = marca.marca;
  estado.criterios = { ...estado.criterios, ...criteriosDesdeReferencia(referencia), ...criterios };
  estado.ultimaSeleccion = {
    marca: marca.marca,
    referencia: referencia.nombre,
    presentacion: presentacion ? presentacion.peso : null,
    cantidad,
  };
  estado.referenciasPendientes = null;

  if (presentacion) {
    agregarAlCarrito(estado, marca, referencia, presentacion, cantidad);
    estado.ultimaSeleccion = null;

    if (contextoPendiente.quiereDomicilio || tieneDatosDomicilioUtiles(estado.datosDomicilio)) {
      return respuestaProductoAgregado(estado, marca, referencia, presentacion, { pedirDatosDomicilio: true });
    }

    return respuestaProductoAgregado(estado, marca, referencia, presentacion);
  }

  return formatearReferencia(marca, referencia, "¿Cuál presentación quieres agregar al pedido?");
}

function resolverDesdeUltimaSeleccion(mensaje, estado, catalogo) {
  if (!estado.ultimaSeleccion) return null;

  const marca = buscarMarcaPorNombre(catalogo, estado.ultimaSeleccion.marca);
  if (!marca) return null;

  const referencia = marca.referencias.find((item) => item.nombre === estado.ultimaSeleccion.referencia);
  if (!referencia) return null;

  const clienteConfirma = esAfirmacion(mensaje);
  const cantidad = extraerCantidad(mensaje) || estado.ultimaSeleccion.cantidad || 1;
  const presentacionNoDisponible = respuestaSiPresentacionSolicitadaNoDisponible(marca, referencia, mensaje);
  if (presentacionNoDisponible) {
    estado.ultimaSeleccion = {
      marca: marca.marca,
      referencia: referencia.nombre,
      presentacion: null,
      cantidad,
    };
    return presentacionNoDisponible;
  }

  let presentacion = buscarPresentacion(referencia, mensaje);

  if (!presentacion && clienteConfirma && estado.ultimaSeleccion.presentacion) {
    presentacion = referencia.presentaciones.find(
      (item) => normalizarPeso(item.peso) === normalizarPeso(estado.ultimaSeleccion.presentacion)
    );
  }

  if (!presentacion && clienteConfirma && referencia.presentaciones.length === 1) {
    presentacion = referencia.presentaciones[0];
  }

  if (!presentacion) {
    if (clienteConfirma && referencia.presentaciones.length > 1) {
      return formatearReferencia(marca, referencia, "Claro, ¿cuál presentación quieres que agregue al pedido?");
    }

    return null;
  }

  agregarAlCarrito(estado, marca, referencia, presentacion, cantidad);
  estado.referenciasPendientes = null;
  estado.productosPendientes = (estado.productosPendientes || []).filter(
    (item) => !(normalizar(item.marca) === normalizar(marca.marca) && item.referencia === referencia.nombre)
  );

  const siguientePendiente = (estado.productosPendientes || [])[0];
  if (siguientePendiente) {
    const siguienteMarca = buscarMarcaPorNombre(catalogo, siguientePendiente.marca);
    const siguienteReferencia = siguienteMarca
      ? siguienteMarca.referencias.find((item) => item.nombre === siguientePendiente.referencia)
      : null;

    if (siguienteMarca && siguienteReferencia) {
      estado.ultimaSeleccion = {
        marca: siguienteMarca.marca,
        referencia: siguienteReferencia.nombre,
        presentacion: null,
        cantidad: siguientePendiente.cantidad || 1,
      };

      return `${formatearProductoExacto(marca, referencia, presentacion)}\n\nTe lo agrego al pedido.\n\n${resumenCarrito(
        estado
      )}\n\nAhora dime qué presentación quieres para ${siguienteMarca.marca} ${
        siguienteReferencia.nombre
      }:\n${presentacionesReferencia(siguienteReferencia)}`;
    }
  }

  estado.ultimaSeleccion = null;

  if (clienteConfirma) {
    return respuestaProductoAgregado(estado, marca, referencia, presentacion, {
      accion: "Te lo dejo agregado al pedido.",
      pedirDatosDomicilio: true,
    });
  }

  return respuestaProductoAgregado(estado, marca, referencia, presentacion);
}

function resolverAlternativaPendiente(mensaje, estado, catalogo) {
  if (!estado.alternativaPendiente || !estado.alternativaPendiente.opciones.length) return null;

  const texto = normalizar(mensaje);
  const marcaDetectada = buscarMarca(catalogo, mensaje);
  const opcion =
    estado.alternativaPendiente.opciones.find((item) => {
      const coincideMarca = marcaDetectada
        ? normalizar(item.marca) === normalizar(marcaDetectada.marca)
        : contieneFrase(texto, item.marca);
      const coincideReferencia = contieneFrase(texto, item.referencia);
      return coincideMarca || coincideReferencia;
    }) || (esAfirmacion(mensaje) ? estado.alternativaPendiente.opciones[0] : null);

  if (!opcion) return null;

  const marca = buscarMarcaPorNombre(catalogo, opcion.marca);
  if (!marca) return null;

  const referencia = marca.referencias.find((item) => item.nombre === opcion.referencia);
  if (!referencia) return null;

  const cantidad = extraerCantidad(mensaje) || 1;
  const presentacionNoDisponible = respuestaSiPresentacionSolicitadaNoDisponible(marca, referencia, mensaje);
  if (presentacionNoDisponible) {
    estado.alternativaPendiente = null;
    estado.marca = marca.marca;
    estado.criterios = criteriosDesdeReferencia(referencia);
    estado.ultimaSeleccion = {
      marca: marca.marca,
      referencia: referencia.nombre,
      presentacion: null,
      cantidad,
    };
    return presentacionNoDisponible;
  }

  const presentacion = buscarPresentacion(referencia, mensaje);
  estado.alternativaPendiente = null;
  estado.marca = marca.marca;
  estado.criterios = criteriosDesdeReferencia(referencia);
  estado.ultimaSeleccion = {
    marca: marca.marca,
    referencia: referencia.nombre,
    presentacion: presentacion ? presentacion.peso : null,
    cantidad,
  };

  if (presentacion) {
    agregarAlCarrito(estado, marca, referencia, presentacion, cantidad);
    estado.ultimaSeleccion = null;
    estado.referenciasPendientes = null;
    return respuestaProductoAgregado(estado, marca, referencia, presentacion);
  }

  return formatearReferencia(marca, referencia, "¿Cuál presentación quieres agregar al pedido?");
}

function resolverConsultaCatalogo(mensaje, estado, catalogo = cargarProductos(), interpretacion = null) {
  const marcaEnMensaje = buscarMarca(catalogo, mensaje);
  const criteriosTextoMensaje = extraerCriterios(mensaje);
  const marcaDetectada = buscarMarcaInterpretada(catalogo, interpretacion) || marcaEnMensaje;
  const criteriosMensaje = mezclarCriterios(criteriosTextoMensaje, criteriosDesdeInterpretacion(interpretacion));
  const marcaDesconocida = extraerMarcaDesconocida(mensaje, catalogo, {
    permitirCandidatoSolo:
      estado.esperandoMarca || (!estado.marca && !tieneCriterios(criteriosMensaje)),
  });
  const pidioMarcas = solicitaMarcas(mensaje);
  const pidioReferencias = solicitaReferencias(mensaje);
  const pidioRecomendacion = solicitaRecomendacion(mensaje);
  const pidioOpinion = solicitaOpinionMarca(mensaje);
  const presupuesto = extraerPresupuesto(mensaje);

  if (esCambioDeMarca(mensaje)) {
    estado.marca = null;
    estado.criterios = {};
    estado.ultimaSeleccion = null;
    estado.alternativaPendiente = null;
    estado.esperandoMarca = true;
    return listarMarcas(catalogo);
  }

  const respuestaRepetirPedido = resolverConfirmacionRepetirPedido(mensaje, estado);
  if (respuestaRepetirPedido) return respuestaRepetirPedido;

  const respuestaConfirmacionPedido = resolverConfirmacionPedido(mensaje, estado);
  if (respuestaConfirmacionPedido) return respuestaConfirmacionPedido;

  if (
    estado.esperandoConfirmacionRepetirPedido &&
    (marcaDetectada || tieneCriterios(criteriosMensaje) || solicitaNuevoPedido(mensaje))
  ) {
    iniciarNuevoPedido(estado);
  }

  if (
    estado.carrito.length &&
    !marcaEnMensaje &&
    !tieneCriterios(criteriosTextoMensaje) &&
    !estado.ultimaSeleccion &&
    (solicitaCierre(mensaje) || esCierreFinal(mensaje))
  ) {
    return resolverEntregaYPago(mensaje, estado);
  }

  const respuestaIA = resolverConInterpretacionIA(mensaje, estado, catalogo, interpretacion);
  if (respuestaIA) return respuestaIA;

  const respuestaOperacionCarritoIA = resolverOperacionCarritoIA(mensaje, estado, catalogo, interpretacion);
  if (respuestaOperacionCarritoIA) return respuestaOperacionCarritoIA;

  if (estado.pedidoConfirmado && estado.carrito.length && solicitaNuevoPedido(mensaje)) {
    const traeProductoNuevo = Boolean(marcaDetectada) || tieneCriterios(criteriosMensaje);

    if (!traeProductoNuevo) {
      return preguntarRepetirPedido(estado);
    }

    iniciarNuevoPedido(estado);
  }

  if (
    estado.pedidoConfirmado &&
    estado.carrito.length &&
    !marcaDetectada &&
    !tieneCriterios(criteriosMensaje) &&
    deseaRepetirPedido(mensaje)
  ) {
    return preguntarRepetirPedido(estado);
  }

  const respuestaAlternativa = resolverAlternativaPendiente(mensaje, estado, catalogo);
  if (respuestaAlternativa) return respuestaAlternativa;

  const respuestaCambioCarrito = resolverCambioCarrito(mensaje, estado, catalogo);
  if (respuestaCambioCarrito) return respuestaCambioCarrito;

  const respuestaProductosExplicitos = resolverProductosExplicitos(mensaje, estado, catalogo, {
    pidioMarcas,
    pidioReferencias,
    pidioRecomendacion,
    pidioOpinion,
  });
  if (respuestaProductosExplicitos) return respuestaProductosExplicitos;

  if (estado.pedidoConfirmado && esCierreFinal(mensaje)) {
    return respuestaPedidoYaConfirmado(mensaje);
  }

  if (
    estado.esperandoTipoEntrega ||
    estado.esperandoSedeRecogida ||
    estado.esperandoMetodoPago ||
    estado.esperandoConfirmacionDatosPrevios ||
    estado.esperandoCambioDireccion ||
    estado.esperandoConfirmacionDatosFacturacion ||
    estado.esperandoActualizacionDatosCliente
  ) {
    return resolverEntregaYPago(mensaje, estado);
  }

  if (
    estado.esperandoConfirmacionDomicilio &&
    esAfirmacion(mensaje) &&
    estado.carrito.length &&
    !estado.ultimaSeleccion
  ) {
    return resolverEntregaYPago(mensaje, estado);
  }

  const respuestaReferenciaPendiente = resolverReferenciaPendiente(mensaje, estado, catalogo, interpretacion);
  if (respuestaReferenciaPendiente) return respuestaReferenciaPendiente;

  const respuestaDesdeUltima = resolverDesdeUltimaSeleccion(mensaje, estado, catalogo);
  if (respuestaDesdeUltima) return respuestaDesdeUltima;

  if (
    estado.esperandoDatosDomicilio ||
    solicitaCierre(mensaje) ||
    (estado.carrito.length && (detectarTipoEntrega(mensaje) || solicitaCambioDireccion(mensaje)))
  ) {
    if (estado.carrito.length || estado.esperandoDatosDomicilio) {
      return resolverEntregaYPago(mensaje, estado);
    }
  }

  if (marcaDesconocida) {
    estado.esperandoMarca = true;
    estado.esperandoPresupuesto = false;
    estado.pendienteRecomendacion = false;
    return `Por ahora no manejamos ${marcaDesconocida}.\n\n${listarMarcas(catalogo)}`;
  }

  if (estado.esperandoPresupuesto || pidioRecomendacion || pidioOpinion || presupuesto) {
    const criterios = mezclarCriterios(marcaDetectada ? {} : estado.criterios, criteriosMensaje);
    const marcaPreferida = marcaDetectada || (estado.marca ? buscarMarcaPorNombre(catalogo, estado.marca) : null);

    if (marcaPreferida && !presupuesto && !quiereEconomico(mensaje)) {
      const referencias = referenciasPorCriterios(marcaPreferida, criterios);
      const referencia = elegirMejorReferencia(referencias, criterios, mensaje);

      estado.esperandoPresupuesto = false;
      estado.pendienteRecomendacion = false;
      estado.marca = marcaPreferida.marca;
      estado.criterios = criterios;

      if (!referencias.length && tieneCriterios(criterios)) {
        return respuestaSinOpciones(catalogo, criterios, marcaPreferida, estado);
      }

      if (referencia && tieneCriterios(criterios)) {
        estado.ultimaSeleccion = { marca: marcaPreferida.marca, referencia: referencia.nombre, presentacion: null };
        return resenarReferencia(marcaPreferida, referencia);
      }

      return resenarMarca(marcaPreferida, referencias.length ? referencias : marcaPreferida.referencias);
    }

    if (presupuesto || quiereEconomico(mensaje)) {
      estado.esperandoPresupuesto = false;
      estado.pendienteRecomendacion = false;
      estado.criterios = criterios;
      if (marcaPreferida) estado.marca = marcaPreferida.marca;
      return recomendarOpciones(catalogo, criterios, presupuesto, marcaPreferida, quiereEconomico(mensaje));
    }

    estado.esperandoPresupuesto = true;
    estado.pendienteRecomendacion = true;
    estado.criterios = criterios;
    return "Claro, te recomiendo con gusto. ¿Qué presupuesto tienes más o menos? Así te muestro opciones reales que sí estén dentro de lo que quieres invertir.";
  }

  if (pidioMarcas && !marcaDetectada && !tieneCriterios(criteriosMensaje)) {
    estado.marca = null;
    estado.criterios = {};
    estado.ultimaSeleccion = null;
    estado.esperandoMarca = true;
    return listarMarcas(catalogo);
  }

  const debeUsarMarcaEnMemoria = !(pidioMarcas && !marcaDetectada && criteriosMensaje.especie);
  const marca =
    marcaDetectada || (debeUsarMarcaEnMemoria && estado.marca ? buscarMarcaPorNombre(catalogo, estado.marca) : null);
  const estaExplorandoMarca = solicitaExplorarMarca(mensaje, { pidioMarcas, pidioReferencias });
  const marcaExplicitaEnMensaje = Boolean(marcaDetectada);
  const debeIgnorarCriteriosPrevios = estaExplorandoMarca && !tieneCriterios(criteriosMensaje);
  const criteriosBase = marcaExplicitaEnMensaje ? {} : estado.criterios;
  const criterios = debeIgnorarCriteriosPrevios ? {} : mezclarCriterios(criteriosBase, criteriosMensaje);

  if (marcaDetectada) {
    estado.marca = marcaDetectada.marca;
    estado.esperandoMarca = false;
  }

  if (tieneCriterios(criteriosMensaje)) {
    estado.criterios = criterios;
  }

  if (!marca) {
    if (tieneCriterios(criterios)) {
      const marcas = marcasConOpciones(catalogo, criterios);
      estado.criterios = criterios;
      estado.esperandoMarca = true;

      if (marcas.length) {
        if (estado.esperandoMarca || !pidioMarcas) {
          estado.esperandoPresupuesto = false;
          estado.pendienteRecomendacion = true;
          return recomendarOpciones(catalogo, criterios, presupuesto, null, quiereEconomico(mensaje));
        }

        return `${listarMarcas(catalogo, marcas, criterios)}\n\nSi prefieres, también puedo recomendarte según tu presupuesto.`;
      }

      return respuestaSinOpciones(catalogo, criterios, null, estado);
    }

    estado.esperandoMarca = true;
    return listarMarcas(catalogo);
  }

  if (estaExplorandoMarca) {
    const referenciasFiltradas = tieneCriterios(criteriosMensaje)
      ? referenciasPorCriterios(marca, criterios)
      : marca.referencias;

    estado.marca = marca.marca;
    estado.criterios = tieneCriterios(criteriosMensaje) ? criterios : {};
    estado.ultimaSeleccion = null;
    estado.esperandoConfirmacionDomicilio = Boolean(estado.carrito.length);

    if (!referenciasFiltradas.length) {
      return respuestaSinOpciones(catalogo, criterios, marca, estado);
    }

    guardarReferenciasPendientes(estado, marca, referenciasFiltradas);
    const aperturaCarrito = estado.carrito.length
      ? "\n\nTu pedido sigue guardado. Si te interesa alguna, dime cuál referencia y presentación quieres sumar."
      : "";

    return `${listarReferencias(marca, referenciasFiltradas)}${aperturaCarrito}`;
  }

  const referenciaExacta = buscarReferenciaExacta(marca, mensaje, criterios);
  const referencias = referenciasPorCriterios(marca, criterios);
  const referencia = referenciaExacta || elegirMejorReferencia(referencias, criterios, mensaje);

  if (!referencia) {
    const presentacionNoDisponibleEnReferencias = respuestaSiPresentacionSolicitadaNoDisponibleEnReferencias(
      marca,
      referencias,
      criterios,
      mensaje
    );
    if (presentacionNoDisponibleEnReferencias) {
      estado.marca = marca.marca;
      estado.criterios = criterios;
      guardarReferenciasPendientes(estado, marca, referencias, {
        texto: mensaje,
        criterios,
        cantidad: extraerCantidad(mensaje) || 1,
        quiereDomicilio: detectarTipoEntrega(mensaje) === "domicilio",
        datosDomicilio: extraerDatosDomicilio(mensaje),
      });
      return presentacionNoDisponibleEnReferencias;
    }
  }

  if (referencia) {
    const cantidad = extraerCantidad(mensaje) || 1;
    const presentacionNoDisponible = respuestaSiPresentacionSolicitadaNoDisponible(marca, referencia, mensaje);
    const presentacion = presentacionNoDisponible ? null : buscarPresentacion(referencia, mensaje);

    estado.marca = marca.marca;
    estado.criterios = tieneCriterios(criterios) ? criterios : criteriosDesdeReferencia(referencia);
    estado.ultimaSeleccion = {
      marca: marca.marca,
      referencia: referencia.nombre,
      presentacion: presentacion ? presentacion.peso : null,
      cantidad,
    };
    estado.referenciasPendientes = null;

    if (presentacionNoDisponible) {
      return presentacionNoDisponible;
    }

    if (presentacion) {
      agregarAlCarrito(estado, marca, referencia, presentacion, cantidad);
      estado.ultimaSeleccion = null;
      return respuestaProductoAgregado(estado, marca, referencia, presentacion);
    }

    return formatearReferencia(
      marca,
      referencia,
      "¿Cuál presentación quieres agregar al pedido?"
    );
  }

  if (pidioReferencias) {
    const referenciasFiltradas = tieneCriterios(criteriosMensaje) ? referencias : marca.referencias;

    estado.marca = marca.marca;
    estado.criterios = tieneCriterios(criteriosMensaje) ? criterios : {};
    if (!referenciasFiltradas.length) {
      return respuestaSinOpciones(catalogo, criterios, marca, estado);
    }

    guardarReferenciasPendientes(estado, marca, referenciasFiltradas);
    return listarReferencias(marca, referenciasFiltradas);
  }

  if (!tieneCriterios(criterios)) {
    estado.marca = marca.marca;
    guardarReferenciasPendientes(estado, marca, marca.referencias);
    return listarReferencias(marca);
  }

  if (!referencias.length) {
    estado.marca = marca.marca;
    return respuestaSinOpciones(catalogo, criterios, marca, estado);
  }

  estado.marca = marca.marca;
  estado.criterios = criterios;
  guardarReferenciasPendientes(estado, marca, referencias);
  return listarReferencias(marca, referencias);
}

module.exports = {
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
};
