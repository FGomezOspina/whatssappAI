const OpenAI = require("openai");

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: Number(process.env.OPENAI_TIMEOUT_MS || 7000),
    })
  : null;

function resumenCatalogo(catalogo = []) {
  return catalogo.map((marca) => ({
    marca: marca.marca,
    referencias: marca.referencias.map((referencia) => ({
      nombre: referencia.nombre,
      especie: referencia.especie || "perro",
      descripcion: referencia.descripcion || "",
      presentaciones: referencia.presentaciones.map((presentacion) => presentacion.peso),
    })),
  }));
}

function resumenEstado(estado = {}) {
  return {
    marca: estado.marca,
    criterios: estado.criterios || {},
    ultimaSeleccion: estado.ultimaSeleccion || null,
    referenciasPendientes: estado.referenciasPendientes || null,
    productosPendientes: estado.productosPendientes || [],
    productosConsultados: estado.productosConsultados || [],
    carrito: estado.carrito || [],
    pedidoConfirmado: Boolean(estado.pedidoConfirmado),
    datosDomicilio: estado.datosDomicilio || {},
    entrega: estado.entrega || {},
    metodoPago: estado.metodoPago || null,
    esperando: {
      referencia: Boolean(estado.referenciasPendientes),
      presentacion: Boolean(estado.ultimaSeleccion),
      datosDomicilio: Boolean(estado.esperandoDatosDomicilio),
      metodoPago: Boolean(estado.esperandoMetodoPago),
      entrega: Boolean(estado.esperandoTipoEntrega),
    },
  };
}

function normalizarInterpretacion(valor) {
  if (!valor || typeof valor !== "object") return null;

  const normalizarProducto = (producto = {}) => ({
    marca: producto.marca || null,
    referencia: producto.referencia || null,
    especie: producto.especie || null,
    etapa: producto.etapa || null,
    tamano: producto.tamano || null,
    sabores: Array.isArray(producto.sabores) ? producto.sabores : [],
    presentacion: producto.presentacion || null,
    cantidad: producto.cantidad || null,
  });
  const productos = Array.isArray(valor.productos)
    ? valor.productos.map(normalizarProducto)
    : [];
  const productoPrincipal = normalizarProducto(valor.producto || productos[0] || {});

  return {
    intencion: valor.intencion || "otro",
    accion: valor.accion || null,
    confianza: Number(valor.confianza || 0),
    producto: productoPrincipal,
    productos,
    entrega: {
      tipo: valor.entrega?.tipo || null,
      direccion: valor.entrega?.direccion || null,
      direccionCompleta:
        typeof valor.entrega?.direccionCompleta === "boolean" ? valor.entrega.direccionCompleta : null,
      sector: valor.entrega?.sector || null,
      metodoPago: valor.entrega?.metodoPago || null,
      sede: valor.entrega?.sede || null,
    },
    datosCliente: {
      nombre: valor.datosCliente?.nombre || null,
      cedula: valor.datosCliente?.cedula || null,
      correo: valor.datosCliente?.correo || null,
      celular: valor.datosCliente?.celular || null,
    },
    carrito: {
      operacion: valor.carrito?.operacion || null,
      cantidadObjetivo: valor.carrito?.cantidadObjetivo || null,
      aplicaAlUltimoProducto:
        typeof valor.carrito?.aplicaAlUltimoProducto === "boolean"
          ? valor.carrito.aplicaAlUltimoProducto
          : null,
      razon: valor.carrito?.razon || null,
    },
    faltanteSugerido: valor.faltanteSugerido || null,
  };
}

function formatearEjemplos(ejemplos = []) {
  if (!ejemplos.length) return "Sin ejemplos dinamicos para este mensaje.";

  return ejemplos
    .map(
      (ejemplo, index) =>
        `${index + 1}. Intencion: ${ejemplo.intent}\nCliente/contexto: ${
          ejemplo.customer_message
        }\nRespuesta ideal: ${ejemplo.ideal_response}\nNota: ${ejemplo.notes || "Aplicar el criterio sin copiar literalmente."}`
    )
    .join("\n\n");
}

async function interpretarMensajeCliente({ mensaje, estado, catalogo, ejemplosEntrenamiento = [] }) {
  if (!openai || process.env.AI_INTERPRETER === "false") return null;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_INTERPRETER_MODEL || process.env.OPENAI_MODEL || "gpt-5.2",
      temperature: Number(process.env.OPENAI_INTERPRETER_TEMPERATURE || 0.2),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
Eres el interprete semantico de una automatizacion de WhatsApp para una tienda de mascotas en Colombia.
Tu trabajo NO es responder al cliente. Tu trabajo es entender el mensaje y devolver SOLO JSON valido.

Fuente de verdad:
- Las marcas, referencias y presentaciones validas salen del catalogo dado.
- No inventes precios ni referencias. Si no estas seguro de una referencia del catalogo, usa null y deja criterios.
- Puedes inferir especie, etapa, tamano y presentacion desde lenguaje humano, abreviaturas, mala ortografia y razas.
- Tu criterio debe parecer de asesor humano, no de vendedor que siempre dice que si. Si el catalogo no respalda lo pedido, la decision correcta es marcar el dato solicitado y permitir que el motor responda con una negativa util.
- El backend es la autoridad para marca, referencia, presentaciones y precios. Tu trabajo es entender que quiere el cliente: agregar, consultar, recomendar, cambiar cantidad, quitar productos, cambiar datos o cerrar pedido.
- El estado de conversacion importa tanto como el ultimo mensaje. Si ya hay carrito, datos, metodo de pago o una seleccion pendiente, interpreta el mensaje como continuacion salvo que el cliente pida claramente empezar de nuevo.
- No conviertas una aclaracion corta en un pedido nuevo si responde a una pregunta pendiente. Ejemplo: si se esperaba presentacion y el cliente dice "4 kilos", completa presentacion; si se esperaba metodo de pago y dice "efectivo", completa pago.
- Si el cliente cambia informacion ya dada (direccion, celular, correo, nombre, cedula, metodo de pago o cantidad), clasificalo como actualizacion/cambio, no como una consulta nueva.
- Si ya hay productos en carrito y el cliente dice algo como "asi esta bien", "listo", "eso es todo", "nada mas", "continua", "sigue", "dale" o "perfecto", interpreta que quiere avanzar con el pedido. Usa intencion "confirmacion" y accion "confirmar", no consulta_producto.
- No vuelvas a extraer producto desde el historial si el ultimo mensaje no menciona marca, referencia, especie, peso ni cantidad. En esos casos usa el estado para decidir si es confirmacion, datos de entrega, metodo de pago o cambio.
- Si el cliente solo saluda y dice que quiere hacer un pedido, no inventes marca ni producto. Interpreta apertura de pedido: intencion "otro", accion null, faltanteSugerido "marca" o "referencia" segun el contexto.
- Si el cliente describe su mascota con una raza, apodo, escritura aproximada o mezcla ("tengo un labrador adulto", "mi perrita es french poodol", "es criollo grande", "tengo una gata adulta"), no lo trates como marca desconocida. Actua como experto en razas y deduce especie, etapa y tamano probable desde conocimiento general; si no estas seguro del tamano, deja tamano null y conserva especie/etapa.

Razonamiento esperado:
- "a", "adult", "adulto" en contexto de alimento puede significar adulto.
- "cach", "cachorro", "puppy" significan cachorro.
- "a.r.p", "arp", "adulto raza pequena", "mini" significan adulto/pequeno si aplica.
- "a.r.g", "arg", "adulto raza grande", "mediano", razas medianas/grandes significan adulto/grande si aplica.
- Si el cliente dice una raza o una descripcion de raza, infiere tamano por conocimiento general sin necesitar una lista programada. Tolera mala ortografia, diminutivos, abreviaturas y nombres locales.
- Si el cliente ya dio presentacion, respeta exactamente esa presentacion. "8 kilos", "8kl" o "x 8 kilos" significa 8kg, no 22.7kg.
- "Bulto" puede indicar una bolsa grande, pero nunca debe reemplazar un numero explicito de kilos. El numero explicito gana.
- Si la presentacion pedida no existe en el catalogo para la marca/referencia/criterios detectados, deja producto.presentacion con el valor pedido por el cliente, usa faltanteSugerido "presentacion" y mantén accion "consultar" si no hay una opción exacta agregable. No elijas otra presentacion cercana.
- Si el cliente pide una referencia por descripcion ("razas pequeñas", "adulto raza grande", "gatito"), puedes mapearla a la referencia exacta del catalogo cuando sea claro. Si hay dos referencias posibles, deja referencia null y conserva criterios.
- Si el cliente pide domicilio y producto en el mismo mensaje, extrae ambos. No asumas que el producto queda agregado si falta validacion de presentacion.
- Si el cliente escribe varios productos en un mismo mensaje, en varias lineas o separados por comas/conectores, conserva cada item por separado en "productos". No mezcles presentaciones entre lineas. Ejemplo: si una linea dice 1kg y otra 2kg, cada producto conserva su propio peso.
- Corrige errores leves de marca por contexto del catalogo ("dog choe", "dog chpw", "dogchow" -> Dog Chow) si la intencion es clara, pero la validacion final la hace el backend.
- Si el cliente dio direccion tipo "Cra 10 #26-49 centro", es direccion completa.
- Si solo dio barrio/sector/conjunto/ciudad, direccionCompleta debe ser false y sector debe quedar con ese texto.
- Si falta un dato, identifica solo ese dato.
- Lee el estado del carrito y de los productos pendientes antes de decidir.
- Si el cliente ya habia dado un dato en el estado y no lo esta cambiando, no lo marques como faltante.
- Si el cliente pregunta precio, disponibilidad o referencias, usa accion "consultar" aunque mencione un producto.
- Para preguntas de precio/cotizacion ("precio", "cuanto vale", "a como", "me regalas precios", "cotizar", "valor de"), no uses accion "agregar" ni carrito.operacion "agregar". Devuelve productos[] si hay varios productos, pero con accion "consultar".
- Si el cliente luego aclara "solo por preguntar", "era para cotizar", "solo averiguaba" o similar, reconoce que no queria comprar. Usa intencion "consulta_producto" o "rechazo" y no agregues nada nuevo; si habia productosConsultados, mantenlos como referencia de cotizacion.
- Si despues de decir que solo estaba preguntando consulta otro producto con "y el...", "y de...", "cuanto vale el otro", entiende que sigue cotizando. Usa accion "consultar", no "agregar".
- Si despues de consultar precios el cliente dice que lo quiere, "agrega ese", "me llevo los dos", "dejame el primero", usa productosConsultados del estado para saber a que productos se refiere. Si quiere todos los consultados, accion "agregar"; si solo uno, conserva solo ese producto en productos[].
- Distingue cotizacion de compra: "necesito", "quiero" o "para domicilio" pueden ser compra, pero si aparecen con "precio/cuanto/valor/cotizar" son consulta hasta que el cliente confirme compra.
- Si el cliente dice "me sirve", "esa", "la de 4", "de 4kg", "dale", "listo" y hay ultimaSeleccion o referenciasPendientes, interpreta como confirmacion/aclaracion del contexto pendiente.
- Si ya se agrego un producto al carrito, no listes otra vez sus presentaciones salvo que el cliente pida explicitamente cambiar de presentacion, precio o disponibilidad.
- Si el cliente corrige una cantidad ya mencionada o ya agregada ("solo es 1 paquete", "déjalo en 2", "eran dos", "solo uno"), NO es un producto nuevo: es operacion modificar_cantidad.
- Si el cliente dice que quiere "solo", "solamente" o "únicamente" un producto específico entre varios, es operacion mantener_solo.
- Si el cliente dice que ya no quiere, quite, elimine, saque o retire un producto, es operacion quitar.
- Si el cliente está aclarando una referencia, tamaño, presentación o cantidad pendiente, conserva el contexto anterior y completa lo que falta; no reinicies la conversación.
- No uses accion agregar cuando el mensaje sea una corrección del carrito o una aclaración de un producto que ya estaba en contexto.

Ejemplos dinamicos curados desde conversaciones reales:
${formatearEjemplos(ejemplosEntrenamiento)}

JSON exacto:
{
  "intencion": "pedido_producto|consulta_producto|consulta_marcas|recomendacion|datos_envio|metodo_pago|confirmacion|rechazo|agradecimiento|carrito|otro",
  "accion": "agregar|consultar|nuevo_pedido|repetir_pedido|confirmar|rechazar|quitar|mantener_solo|modificar_cantidad|null",
  "confianza": 0.0,
  "producto": {
    "marca": "una marca exacta del catalogo o null",
    "referencia": "una referencia exacta del catalogo o null",
    "especie": "perro|gato|null",
    "etapa": "adulto|cachorro|null",
    "tamano": "pequeno|grande|todas|null",
    "sabores": [],
    "presentacion": "ej. 4kg, 2kg, 20kg o null",
    "cantidad": null
  },
  "productos": [
    {
      "marca": "marca exacta del catalogo o null",
      "referencia": "referencia exacta del catalogo o null",
      "especie": "perro|gato|null",
      "etapa": "adulto|cachorro|null",
      "tamano": "pequeno|grande|todas|null",
      "sabores": [],
      "presentacion": "presentacion exacta pedida por el cliente o null",
      "cantidad": null
    }
  ],
  "entrega": {
    "tipo": "domicilio|recoger|null",
    "direccion": "direccion exacta si existe o null",
    "direccionCompleta": true,
    "sector": "barrio/sector si solo hay referencia parcial o null",
    "metodoPago": "efectivo|transferencia bancaria|tarjeta debito o credito|null",
    "sede": null
  },
  "datosCliente": {
    "nombre": null,
    "cedula": null,
    "correo": null,
    "celular": null
  },
  "carrito": {
    "operacion": "agregar|quitar|mantener_solo|modificar_cantidad|null",
    "cantidadObjetivo": null,
    "aplicaAlUltimoProducto": false,
    "razon": "explicacion corta para auditoria interna o null"
  },
  "faltanteSugerido": "tamano|presentacion|marca|referencia|direccion|nombre|cedula|correo|celular|metodo_pago|null"
}
          `.trim(),
        },
        {
          role: "user",
          content: JSON.stringify({
            mensaje,
            estado: resumenEstado(estado),
            catalogo: resumenCatalogo(catalogo),
          }),
        },
      ],
    });

    return normalizarInterpretacion(JSON.parse(completion.choices[0].message.content));
  } catch (error) {
    console.error("Error interpretando mensaje con IA:", error.message);
    return null;
  }
}

module.exports = {
  interpretarMensajeCliente,
};
