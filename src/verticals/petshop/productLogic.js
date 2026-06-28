const { formatearPrecio, normalizar, normalizarPeso } = require("../../utils/text");

function contieneFrase(textoNormalizado, frase) {
  const fraseNormalizada = normalizar(frase);
  if (!fraseNormalizada) return false;

  return ` ${textoNormalizado} `.includes(` ${fraseNormalizada} `);
}

function extraerPresentacionSolicitada(mensaje = "", interpretacion = null) {
  const texto = normalizar(mensaje);
  const unidad = "(kg|kl|kilo|kilos|kilogramo|kilogramos|gramo|gramos|gr|g|lb|libra|libras)";
  const conUnidad = texto.match(new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*${unidad}\\b`));
  if (conUnidad) return normalizarPeso(`${conUnidad[1]}${conUnidad[2]}`);

  const por = texto.match(new RegExp(`\\bx\\s*(\\d+(?:[.,]\\d+)?)\\s*${unidad}\\b`));
  if (por) return normalizarPeso(`${por[1]}${por[2]}`);

  if (interpretacion?.producto?.presentacion) {
    return normalizarPeso(interpretacion.producto.presentacion);
  }

  return null;
}

function marcaApareceEnTexto(marca, textoNormalizado = "") {
  const marcaNormalizada = normalizar(marca.marca);
  const marcaCompacta = marcaNormalizada.replace(/\s+/g, "");
  const marcaCompuesta = /\s/.test(marcaNormalizada);

  return contieneFrase(textoNormalizado, marcaNormalizada) || (marcaCompuesta && textoNormalizado.replace(/\s+/g, "").includes(marcaCompacta));
}

function mensajeSoportaMarca(marca, mensaje = "", respuesta = "") {
  const texto = normalizar([mensaje, respuesta].filter(Boolean).join(" "));
  return marcaApareceEnTexto(marca, texto);
}

function interpretacionSoportaMarca(marca, interpretacion = null, respuesta = "") {
  if (!marca) return false;

  const texto = normalizar(respuesta);

  return (
    marcaApareceEnTexto(marca, texto) ||
    (marca.referencias || []).some((referencia) => contieneFrase(texto, referencia.nombre))
  );
}

function buscarMarca(catalogo, mensaje, interpretacion, respuesta = "") {
  const marcaInterpretada = interpretacion?.producto?.marca;
  if (marcaInterpretada) {
    const nombre = normalizar(marcaInterpretada);
    const encontrada = catalogo.find((marca) => normalizar(marca.marca) === nombre);
    if (
      encontrada &&
      (mensajeSoportaMarca(encontrada, mensaje, respuesta) ||
        interpretacionSoportaMarca(encontrada, interpretacion, respuesta))
    ) {
      return encontrada;
    }
  }

  const texto = normalizar(mensaje);
  return catalogo.find((marca) => {
    return marcaApareceEnTexto(marca, texto);
  });
}

function criteriosProducto(mensaje, interpretacion) {
  const texto = normalizar(mensaje);
  const producto = interpretacion?.producto || {};
  const criterios = {};

  if (["perro", "gato", "ave", "roedor", "pez", "equino", "bovino", "otro"].includes(producto.especie)) {
    criterios.especie = producto.especie;
  }
  if (["adulto", "cachorro", "senior", "todas"].includes(producto.etapa)) criterios.etapa = producto.etapa;
  if (["pequeno", "grande", "todas"].includes(producto.tamano)) criterios.tamano = producto.tamano;
  if (producto.categoria) criterios.categoria = producto.categoria;
  if (producto.subcategoria) criterios.subcategoria = producto.subcategoria;

  if (!criterios.etapa && /\b(adulto|adultos)\b/.test(texto)) criterios.etapa = "adulto";
  if (!criterios.etapa && /\b(cachorro|cachorros|cach)\b/.test(texto)) criterios.etapa = "cachorro";
  if (!criterios.etapa && /\b(senior|mayor|mayores)\b/.test(texto)) criterios.etapa = "senior";
  if (!criterios.tamano && /\b(pequeno|pequena|pequenos|pequenas|mini)\b/.test(texto)) criterios.tamano = "pequeno";
  if (!criterios.tamano && /\b(grande|grandes|mediano|mediana|medianos|medianas)\b/.test(texto)) {
    criterios.tamano = "grande";
  }
  if (!criterios.categoria && /\b(medicamento|medicamentos|medicina|antipulgas|desparasitante)\b/.test(texto)) {
    criterios.categoria = "medicamento";
  }
  if (!criterios.subcategoria && /\b(antipulgas|pulga|pulgas|garrapata)\b/.test(texto)) {
    criterios.subcategoria = "antipulgas";
  }

  return criterios;
}

function referenciaCoincide(referencia, criterios) {
  const texto = normalizar(`${referencia.nombre} ${referencia.descripcion || ""}`);

  if (criterios.especie && (referencia.especie || "perro") !== criterios.especie) return false;
  if (criterios.categoria && referencia.categoria !== criterios.categoria) return false;
  if (criterios.subcategoria && referencia.subcategoria !== criterios.subcategoria) return false;
  if (criterios.etapa && criterios.etapa !== "todas" && referencia.etapa && referencia.etapa !== criterios.etapa) return false;
  if (criterios.etapa && criterios.etapa !== "todas" && !referencia.etapa && !texto.includes(criterios.etapa === "cachorro" ? "cachorro" : criterios.etapa)) return false;
  if (criterios.tamano === "pequeno" && !/\b(pequeno|pequena|pequenos|pequenas|mini)\b/.test(texto)) return false;
  if (criterios.tamano === "grande" && !/\b(grande|grandes|mediano|mediana|medianos|medianas)\b/.test(texto)) {
    return false;
  }

  return true;
}

function referenciasCandidatas(marca, mensaje, interpretacion) {
  const nombreReferencia = interpretacion?.producto?.referencia;
  if (nombreReferencia) {
    const buscada = normalizar(nombreReferencia);
    const exacta = marca.referencias.find((referencia) => normalizar(referencia.nombre) === buscada);
    if (exacta) return [exacta];
  }

  const criterios = criteriosProducto(mensaje, interpretacion);
  const filtradas = marca.referencias.filter((referencia) => referenciaCoincide(referencia, criterios));
  return filtradas.length ? filtradas : marca.referencias;
}

function respuestaAfirmaAgregado(respuesta = "") {
  return (
    /(agreg|añad|inclu|dej|separ|reserv)/i.test(respuesta) &&
    /(pedido|paquete|producto|bolsa|bulto)/i.test(respuesta)
  );
}

function respuestaNoDisponible(marca, referencias, presentacionSolicitada) {
  const lineas = referencias
    .map((referencia) => {
      const presentaciones = referencia.presentaciones
        .map((presentacion) => `${presentacion.peso}: ${formatearPrecio(presentacion.precio)}`)
        .join(", ");
      return `- ${referencia.nombre}: ${presentaciones}`;
    })
    .join("\n");

  return `En ${marca.marca} no tengo presentación de ${presentacionSolicitada} en este momento.\n\nPresentaciones disponibles:\n${lineas}\n\nSi te sirve alguna de esas, te ayudo a dejarla en el pedido.`;
}

function asegurarRespuestaCatalogo(mensaje, respuesta, { catalogo = [], interpretacionIA = null } = {}) {
  const presentacionSolicitada = extraerPresentacionSolicitada(mensaje, interpretacionIA);
  if (!presentacionSolicitada || !respuestaAfirmaAgregado(respuesta)) return respuesta;

  const marca = buscarMarca(catalogo, mensaje, interpretacionIA, respuesta);
  if (!marca) return respuesta;

  const referencias = referenciasCandidatas(marca, mensaje, interpretacionIA);
  const existePresentacion = referencias.some((referencia) =>
    referencia.presentaciones.some((presentacion) => normalizarPeso(presentacion.peso) === presentacionSolicitada)
  );

  if (existePresentacion) return respuesta;

  return respuestaNoDisponible(marca, referencias, presentacionSolicitada);
}

module.exports = {
  asegurarRespuestaCatalogo,
};
