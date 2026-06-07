const { normalizar } = require("../utils/text");
const {
  esSenalReferenciaProducto,
} = require("./pendingProductMatchService");

function contieneAlguno(texto, palabras = []) {
  return palabras.some((palabra) => texto.includes(normalizar(palabra)));
}

function tieneAudio(contenidos = []) {
  return contenidos.some((contenido) => contenido.metadata?.tipo === "audio");
}

function tieneImagen(imageUrls = []) {
  return imageUrls.length > 0;
}

function detectarIntencionBasica(mensaje = "", estado = {}, contenidos = [], imageUrls = []) {
  const texto = normalizar(mensaje);

  if (tieneImagen(imageUrls)) return "imagen";
  if (tieneAudio(contenidos)) return "audio";
  if (contieneAlguno(texto, ["comprobante", "recibo", "pago", "transferencia enviada", "te envie"])) {
    return "comprobante";
  }
  if (contieneAlguno(texto, ["hola", "buenos dias", "buenas tardes", "buenas noches"]) && texto.length <= 30) {
    return "saludo";
  }
  if (contieneAlguno(texto, ["direccion", "domicilio", "enviar", "recoger", "recogida", "sede"])) {
    return "domicilio";
  }
  if (contieneAlguno(texto, ["cuanto", "precio", "vale", "valor", "cotizar", "costo", "a como"])) {
    return "precio";
  }
  if (
    contieneAlguno(texto, [
      "comida",
      "concentrado",
      "purgante",
      "purgantes",
      "desparasitante",
      "pulgas",
      "garrapatas",
      "snacks",
      "juguetes",
      "arena",
      "medicamento",
      "pastilla",
    ])
  ) {
    return "busqueda_producto";
  }
  if (contieneAlguno(texto, ["tiene", "tienes", "manejan", "venden", "hay", "busco", "necesito", "quiero"])) {
    return "busqueda_producto";
  }
  if (esSenalReferenciaProducto(mensaje)) {
    return "referencia_producto";
  }
  if (
    estado.ultimaSeleccion ||
    estado.referenciasPendientes ||
    estado.coincidenciasProductoPendientes ||
    estado.productosConsultados?.length
  ) {
    return "continuacion";
  }
  return "general";
}

function detectarComplejidad(mensaje = "", estado = {}, intencion = "general") {
  const lineas = mensaje.split("\n").filter((linea) => linea.trim()).length;
  const texto = normalizar(mensaje);
  const tieneMultiplesProductos = /\b(y|tambien|ademas|,)\b/.test(texto) && /\b\d/.test(texto);
  const hayPedidoActivo = Boolean(estado.carrito?.length || estado.productosPendientes?.length);
  const esperaDatos = Boolean(
    estado.esperandoDatosDomicilio ||
      estado.esperandoMetodoPago ||
      estado.esperandoConfirmacionPedido ||
      estado.esperandoConfirmacionDatosPrevios
  );

  if (["imagen", "audio", "comprobante"].includes(intencion)) return "avanzada";
  if (lineas > 2 || tieneMultiplesProductos || (hayPedidoActivo && esperaDatos)) return "compleja";
  if (
    ["precio", "busqueda_producto", "referencia_producto", "continuacion", "domicilio"].includes(
      intencion
    )
  ) {
    return "normal";
  }
  return "simple";
}

function requiereBusquedaProducto(intencion, mensaje = "", estado = {}) {
  if (
    ["imagen", "precio", "busqueda_producto", "referencia_producto", "audio"].includes(
      intencion
    )
  ) {
    return true;
  }
  if (intencion === "continuacion" && (estado.ultimaSeleccion || estado.referenciasPendientes)) return true;

  const texto = normalizar(mensaje);
  return contieneAlguno(texto, [
    "comida",
    "concentrado",
    "purgante",
    "purgantes",
    "desparasitante",
    "pulgas",
    "garrapatas",
    "snacks",
    "juguetes",
    "arena",
    "medicamento",
  ]);
}

function tieneContextoActivo(estado = {}) {
  return Boolean(
    (estado.carrito?.length && !estado.pedidoConfirmado) ||
      estado.ultimaSeleccion ||
      estado.referenciasPendientes ||
      estado.coincidenciasProductoPendientes ||
      estado.productosConsultados?.length ||
      estado.esperandoDatosDomicilio ||
      estado.esperandoMetodoPago ||
      estado.esperandoConfirmacionPedido ||
      estado.esperandoConfirmacionDatosPrevios ||
      estado.esperandoConfirmacionRepetirPedido
  );
}

function perfilContexto({ intencion, complejidad, estado = {}, requiereVision, requiereAudio }) {
  if (requiereVision || requiereAudio) return "multimedia";
  if (
    tieneContextoActivo(estado) ||
    ["continuacion", "domicilio", "comprobante"].includes(intencion)
  ) {
    return "pedido";
  }
  if (complejidad === "compleja" || complejidad === "avanzada") return "complejo";
  if (["precio", "busqueda_producto", "referencia_producto"].includes(intencion)) {
    return "producto";
  }
  return "simple";
}

function limiteHistorial(complejidad, perfil, fallbackProducto = false) {
  if (perfil === "producto" && fallbackProducto) {
    return Number(process.env.OPENAI_HISTORY_PRODUCT_FALLBACK_LIMIT || 2);
  }
  if (perfil === "simple" || perfil === "producto") return 0;
  if (perfil === "pedido") return Number(process.env.OPENAI_HISTORY_ORDER_LIMIT || 3);
  if (complejidad === "simple") return Number(process.env.OPENAI_HISTORY_SIMPLE_LIMIT || 2);
  if (complejidad === "normal") return Number(process.env.OPENAI_HISTORY_NORMAL_LIMIT || 4);
  return Number(process.env.OPENAI_HISTORY_COMPLEX_LIMIT || 8);
}

function limiteEjemplos(complejidad, perfil) {
  if (perfil === "simple" || perfil === "producto") return 0;
  if (perfil === "pedido") return Number(process.env.TRAINING_EXAMPLES_ORDER_LIMIT || 2);
  if (complejidad === "simple") return Number(process.env.TRAINING_EXAMPLES_SIMPLE_LIMIT || 2);
  if (complejidad === "normal") return Number(process.env.TRAINING_EXAMPLES_NORMAL_LIMIT || 4);
  return Number(process.env.TRAINING_EXAMPLES_COMPLEX_LIMIT || 6);
}

function clasificarInteraccion({ mensaje = "", estado = {}, contenidos = [], imageUrls = [] } = {}) {
  const intencion = detectarIntencionBasica(mensaje, estado, contenidos, imageUrls);
  const complejidad = detectarComplejidad(mensaje, estado, intencion);
  const requiereVision = tieneImagen(imageUrls);
  const requiereAudio = tieneAudio(contenidos);
  const perfil = perfilContexto({ intencion, complejidad, estado, requiereVision, requiereAudio });
  const fallbackHistorialProductoCandidato = Boolean(
    perfil === "producto" && esSenalReferenciaProducto(mensaje)
  );
  const requiereOpenAI = !(
    complejidad === "simple" &&
    ["saludo", "general"].includes(intencion) &&
    !estado.carrito?.length &&
    !estado.ultimaSeleccion &&
    !estado.referenciasPendientes &&
    !estado.coincidenciasProductoPendientes
  );

  return {
    intencion,
    complejidad,
    requiereVision,
    requiereAudio,
    requiereOpenAI,
    requiereBusquedaProducto: requiereBusquedaProducto(intencion, mensaje, estado),
    perfilContexto: perfil,
    limiteHistorial: requiereVision
      ? 0
      : limiteHistorial(
          complejidad,
          perfil,
          fallbackHistorialProductoCandidato
        ),
    limiteEjemplos: requiereVision ? 0 : limiteEjemplos(complejidad, perfil),
    fallbackHistorialProductoCandidato,
    fallbackHistorialProductoActivo: false,
  };
}

module.exports = {
  clasificarInteraccion,
  detectarIntencionBasica,
};
