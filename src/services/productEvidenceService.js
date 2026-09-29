const { normalizarPeso } = require("../utils/text");

// Evidence is extracted semantically before retrieval; catalog candidates must
// never fill a missing requested size. Quantity counts packages, not net weight.
const INSTRUCCIONES_EVIDENCIA = `Si hay imagen, separa lo observado de lo solicitado en cada producto.
Amplia cada producto con observado: {nombre: string|null, presentacion: string|null, confianzaIdentidad: number, confianzaPresentacion: number} y solicitud: {presentacionTexto: string|null, presentacionContexto: string|null, contextoVigente: boolean, cantidadTexto: number|null, cantidadContexto: number|null}.
observado.nombre contiene solo el nombre y variante legibles, incluidos sabor/proteina y condicion (por ejemplo esterilizado) cuando esten visibles, sin claims ni peso; conserva literalmente todo codigo comercial impreso, incluidas siglas cortas y barras, aunque tambien aparezca su descripcion larga. Codigo y descripcion son atributos distintos: no expandas ni sustituyas el codigo por su significado. Una referencia descriptiva sin el codigo no equivale a la referencia codificada. observado.presentacion contiene el contenido neto visible o null. Puntua por separado confianzaIdentidad y confianzaPresentacion entre 0 y 1; no deduzcas peso del tamano de la bolsa ni del catalogo.
Lee el contenido neto ampliando la zona de la etiqueta y conserva su separador decimal: 1,5 kg y 1.5 kg equivalen; ninguno significa 15 kg. Distingue el peso neto de porcentajes nutricionales, dosis y peso del animal. Si el punto o la coma no son legibles, observado.presentacion=null y confianzaPresentacion baja; no elijas un peso por parecerse a una presentacion del catalogo. Un peso leido en la foto pertenece a observado, nunca a solicitud.presentacionTexto.
solicitud.presentacionTexto y cantidadTexto contienen solo lo que pide explicitamente el cliente en este turno; distingue contenido del empaque, numero de paquetes, peso de la mascota y dosis. Una mencion negada o descriptiva del empaque no es una solicitud.
solicitud.presentacionContexto y cantidadContexto solo conservan una intencion previa del cliente aplicable al producto actual; contextoVigente=true requiere continuidad real, no basta tener carrito o una foto anterior. No reutilices cantidades de productos distintos ni opciones ofrecidas por el asistente.
Prioridad por atributo: texto explicito del cliente > intencion conversacional previa vigente > datos visibles confiables > inferencias. La identidad visual puede completar el producto sin reemplazar la presentacion solicitada. producto.presentacion es la solicitada, no necesariamente la fotografiada. Si falta, deja null incluso si solo existe una presentacion en candidatos.
Conserva variantes conocidas; si el nombre y variante identifican una referencia exacta, no amplíes a nombres con palabras adicionales. Si la identidad es parcial, deja referencia null y conserva solo atributos conocidos. No conviertas semejanza lexical en identidad confirmada.`;

function resolverEvidenciaProducto(producto) {
  if (!producto?.observado) return producto;
  const solicitud = producto.solicitud || {};
  const observado = producto.observado;
  const texto = solicitud.presentacionTexto;
  const contexto = solicitud.contextoVigente === true && solicitud.presentacionContexto;
  const imagen = Number(observado.confianzaPresentacion) >= 0.85 && observado.presentacion;
  const presentacion = texto || contexto || imagen || null;
  return {
    ...producto,
    presentacion: presentacion ? normalizarPeso(presentacion) : null,
    cantidad: solicitud.cantidadTexto ||
      (solicitud.contextoVigente === true && solicitud.cantidadContexto) || null,
    fuentePresentacion: texto ? "texto" : contexto ? "contexto" : imagen ? "imagen" : null,
    requierePresentacion: !presentacion,
  };
}

function resolverEvidenciaInterpretacion(interpretacion, evidenciaPrevia = null) {
  if (!interpretacion) return interpretacion;
  const resolver = (producto, previo) => resolverEvidenciaProducto(producto && {
    ...producto,
    // El mapeo puede completar el nombre comercial, pero no borrar los
    // atributos y cantidades que ya extrajo el router del pedido vigente.
    ...Object.fromEntries(["marca", "linea", "especie", "etapa", "tamano", "presentacion"]
      .filter(campo => !producto[campo] && previo?.[campo])
      .map(campo => [campo, previo[campo]])),
    ...(previo?.cantidad != null ? { cantidad: previo.cantidad } : {}),
    // The catalog-mapping pass may refine identity, but not rewrite intent.
    ...(previo?.observado ? {
      observado: {
        ...previo.observado,
        ...(Number(producto?.observado?.confianzaIdentidad) > Number(previo.observado.confianzaIdentidad)
          ? { nombre: producto.observado.nombre, confianzaIdentidad: producto.observado.confianzaIdentidad } : {}),
        ...(Number(producto?.observado?.confianzaPresentacion) > Number(previo.observado.confianzaPresentacion)
          ? { presentacion: producto.observado.presentacion, confianzaPresentacion: producto.observado.confianzaPresentacion } : {}),
      },
      solicitud: previo.solicitud,
    } : {}),
  });
  const resultado = {
    ...interpretacion,
    // Catalog mapping refines product identity, not the customer's purchasing
    // decision or delivery/payment details extracted before retrieval.
    ...(evidenciaPrevia ? {
      ...(evidenciaPrevia.intencion ? { intencion: evidenciaPrevia.intencion } : {}),
      ...(evidenciaPrevia.accion ? { accion: evidenciaPrevia.accion } : {}),
      carrito: { ...interpretacion.carrito, ...Object.fromEntries(
        Object.entries(evidenciaPrevia.carrito || {}).filter(([, valor]) => valor != null)) },
      entrega: { ...interpretacion.entrega, ...Object.fromEntries(
        Object.entries(evidenciaPrevia.entrega || {}).filter(([, valor]) => valor != null)) },
      datosCliente: { ...interpretacion.datosCliente, ...Object.fromEntries(
        Object.entries(evidenciaPrevia.datosCliente || {}).filter(([, valor]) => valor != null)) },
    } : {}),
    producto: resolver(interpretacion.producto, evidenciaPrevia?.producto),
    productos: (interpretacion.productos || []).map((producto, i) =>
      resolver(producto, evidenciaPrevia?.productos?.[i] ||
        (i === 0 ? evidenciaPrevia?.producto : null))),
  };
  if (interpretacion._meta) Object.defineProperty(resultado, "_meta", {
    value: interpretacion._meta, enumerable: false,
  });
  return resultado;
}

module.exports = { INSTRUCCIONES_EVIDENCIA, resolverEvidenciaProducto, resolverEvidenciaInterpretacion };
