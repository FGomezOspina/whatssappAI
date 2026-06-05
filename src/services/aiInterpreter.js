const OpenAI = require("openai");

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: Number(process.env.OPENAI_TIMEOUT_MS || 7000),
    })
  : null;

function timeoutInterpretacion(urlsImagen = []) {
  if (urlsImagen.length) {
    return Number(process.env.OPENAI_VISION_TIMEOUT_MS || 20000);
  }

  return Number(process.env.OPENAI_TIMEOUT_MS || 7000);
}

function normalizarTexto(valor = "") {
  return valor
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function contiene(texto, palabras = []) {
  return palabras.some((palabra) => texto.includes(palabra));
}

function atributosReferenciaCatalogo(referencia = {}) {
  const texto = normalizarTexto(`${referencia.nombre || ""} ${referencia.descripcion || ""}`);
  const sabores = [];
  const condiciones = [];
  if (texto.includes("pollo")) sabores.push("pollo");
  if (texto.includes("salmon")) sabores.push("salmon");
  if (texto.includes("cordero")) sabores.push("cordero");
  if (texto.includes("carne")) sabores.push("carne");
  if (/\b(castr|esteriliz)/.test(texto)) condiciones.push("castrado");
  if (/\b(urin|uro|urinary|urology)/.test(texto)) condiciones.push("urinario");
  if (/\brenal|kidney/.test(texto)) condiciones.push("renal");
  if (/\bgastro|digestive/.test(texto)) condiciones.push("gastrointestinal");
  if (/\bpiel|skin|derm/.test(texto)) condiciones.push("piel");
  if (/\bbola de pelo|hairball/.test(texto)) condiciones.push("bola_pelo");
  if (/\bobes|weight|sobrepeso/.test(texto)) condiciones.push("control_peso");

  let etapa = null;
  if (referencia.etapa) etapa = referencia.etapa;
  if (!etapa && contiene(texto, ["cachorro", "cachorros", "puppy", "gatito"])) etapa = "cachorro";
  if (!etapa && contiene(texto, ["adulto", "adultos"])) etapa = "adulto";
  if (!etapa && contiene(texto, ["senior", "mayor", "mayores"])) etapa = "senior";

  let tamano = null;
  if (contiene(texto, ["pequeno", "pequena", "pequenos", "pequenas", "mini"])) tamano = "pequeno";
  if (contiene(texto, ["mediano", "mediana", "grande", "grandes"])) tamano = "grande";
  if (contiene(texto, ["todas las razas", "cualquier tamano", "cualquier raza"])) tamano = "todas";

  return {
    etapa,
    tamano,
    sabores,
    condiciones,
  };
}

function resumenCatalogo(catalogo = []) {
  return catalogo.map((marca) => ({
    marca: marca.marca,
    referencias: marca.referencias.map((referencia) => ({
      nombre: referencia.nombre,
      especie: referencia.especie || "perro",
      categoria: referencia.categoria || null,
      subcategoria: referencia.subcategoria || null,
      descripcion: referencia.descripcion || "",
      nombresOriginales: Array.isArray(referencia.metadata?.original_names)
        ? referencia.metadata.original_names.slice(0, 3)
        : [],
      requiereConfirmacion: Boolean(referencia.requiereConfirmacion),
      atributos: atributosReferenciaCatalogo(referencia),
      presentaciones: referencia.presentaciones.map((presentacion) => ({
        peso: presentacion.peso,
        stock: presentacion.stock,
      })),
    })),
  }));
}

function resumenCatalogoVision(catalogo = []) {
  return {
    modo: "vision_compacta",
    nota:
      "Indice compacto para vision: contiene marcas y pares marca|referencia exactos. Las presentaciones, precios y stock se validan despues contra el catalogo completo del backend.",
    marcas: catalogo.map((marca) => marca.marca),
    referencias: catalogo.flatMap((marca) =>
      marca.referencias.map((referencia) => `${marca.marca} | ${referencia.nombre}`)
    ),
  };
}

function resumenCatalogoParaPrompt(catalogo = [], opciones = {}) {
  return opciones.vision ? resumenCatalogoVision(catalogo) : resumenCatalogo(catalogo);
}

function detalleVision() {
  const valor = (process.env.OPENAI_VISION_DETAIL || "auto").toLowerCase();
  return ["auto", "low", "high"].includes(valor) ? valor : "auto";
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
    ultimoPedidoConfirmado: estado.ultimoPedidoConfirmado || null,
    datosDomicilio: estado.datosDomicilio || {},
    entrega: estado.entrega || {},
    metodoPago: estado.metodoPago || null,
    esperando: {
      referencia: Boolean(estado.referenciasPendientes),
      presentacion: Boolean(estado.ultimaSeleccion),
      datosDomicilio: Boolean(estado.esperandoDatosDomicilio),
      metodoPago: Boolean(estado.esperandoMetodoPago),
      entrega: Boolean(estado.esperandoTipoEntrega),
      repetirPedido: Boolean(estado.esperandoConfirmacionRepetirPedido),
      confirmacionPedido: Boolean(estado.esperandoConfirmacionPedido),
      confirmacionDatosPrevios: Boolean(estado.esperandoConfirmacionDatosPrevios),
      actualizacionDatosCliente: Boolean(estado.esperandoActualizacionDatosCliente),
    },
  };
}

function normalizarInterpretacion(valor) {
  if (!valor || typeof valor !== "object") return null;

  const normalizarProducto = (producto = {}) => ({
    marca: producto.marca || null,
    referencia: producto.referencia || null,
    categoria: producto.categoria || null,
    subcategoria: producto.subcategoria || null,
    especie: producto.especie || null,
    etapa: producto.etapa || null,
    tamano: producto.tamano || null,
    sabores: Array.isArray(producto.sabores) ? producto.sabores : [],
    presentacion: producto.presentacion || null,
    condiciones: Array.isArray(producto.condiciones) ? producto.condiciones : [],
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

function resumenHistorial(historial = []) {
  return historial.map((mensaje) => ({
    rol: mensaje.direction === "outbound" ? "asistente" : "cliente",
    contenido: mensaje.body,
  }));
}

function contextoCliente(cliente = {}) {
  return {
    slug: cliente.slug || null,
    nombre: cliente.name || null,
    vertical: cliente.vertical || null,
    settings: cliente.settings || {},
    deliveryRules: cliente.deliveryRules || [],
  };
}

function promptCliente(cliente = {}) {
  const prompt = cliente.prompts?.interpreter || cliente.prompts?.interprete || null;
  return prompt ? `\n\nInstrucciones especificas del cliente AIVANCE:\n${prompt}` : "";
}

function promptVertical(vertical = {}) {
  const prompt = vertical.prompts?.interpreterContext || null;
  return prompt ? `\n\nInstrucciones de la vertical ${vertical.key}:\n${prompt}` : "";
}

async function interpretarMensajeCliente({
  mensaje,
  estado,
  catalogo,
  ejemplosEntrenamiento = [],
  historialReciente = [],
  imageUrl = null,
  imageUrls = [],
  cliente = null,
  vertical = null,
}) {
  if (!openai || process.env.AI_INTERPRETER === "false") return null;

  try {
    const urlsImagen = [...imageUrls, imageUrl].filter(Boolean);
    const usaVision = urlsImagen.length > 0;
    const catalogoPrompt = resumenCatalogoParaPrompt(catalogo, { vision: usaVision });
    const model = urlsImagen.length
      ? process.env.OPENAI_VISION_MODEL ||
        process.env.OPENAI_INTERPRETER_MODEL ||
        process.env.OPENAI_MODEL ||
        "gpt-4.1"
      : process.env.OPENAI_INTERPRETER_MODEL || process.env.OPENAI_MODEL || "gpt-5.2";
    const parametrosModelo = {
      model,
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
- El cliente escribe en español colombiano y lenguaje comercial local. Entiende expresiones como "cuido", "concentrado", "comida", "purina", "referencia", "manejan esta referencia", "la de la foto", "la bolsa", "bulto", "paquete", "kilo", "kl", "libra", "raza pequeña", "todas las razas" y variantes coloquiales.
- El cliente puede escribir con errores normales de WhatsApp: letras cambiadas, tildes omitidas, palabras pegadas, números metidos accidentalmente entre letras, abreviaturas, duplicación de letras, frases incompletas y autocorrector raro. Corrige mentalmente esos errores antes de decidir intención.
- No conviertas una palabra deformada por error de dedo en marca o producto si el contexto dice apertura de pedido, saludo, entrega, pago o datos. Si no hay una pista razonable del catálogo, deja producto vacío y conserva la intención humana.
- En Colombia, frases como "necesito hacer un pedido", "necesito un pedido", "para un pedido", "quiero pedir" o variantes mal escritas son apertura de compra, no consulta de producto ni marca desconocida si no mencionan marca, referencia, especie, peso o categoría.
- El catalogo petshop puede traer categoria, subcategoria, especie, etapa, stock, metadata y requiereConfirmacion. Usa esos campos para entender consultas como "medicamentos", "antipulgas", "desparasitante", "snacks", "accesorios", "champu", "juguetes", "arena para gato" o "suplementos".
- Actua como un asesor experto de petshop/veterinaria: entiendes cuidos/concentrados, comidas humedas, snacks, juguetes, higiene, arenas/sustratos, suplementos, medicamentos, antipulgas, desparasitantes y vacunas. Usa ese conocimiento solo para identificar disponibilidad en catalogo, no para diagnosticar ni formular tratamientos.
- Muchas referencias del catalogo pueden estar abreviadas o resumidas. Si el cliente escribe una referencia incompleta, mal escrita o con palabras adicionales, compara por contexto veterinario y comercial: marca, linea, especie, etapa, tamano, uso comun, principio o familia del producto cuando sea evidente, y presentacion.
- Las presentaciones son parte central de la identidad del producto. Reconoce tabletas/tab, suspension, gotas/gotero, ampolla, frasco, jeringa, sobre/sachet/pouch, lata, bulto, kg/kl/gr/g/ml/mg, rangos de peso como 4-10kg o 10-25kg, y empaques tipo x100, x150gr o unidad.
- Las palabras de linea o condicion del producto pesan mucho para elegir referencia: castrado/castrada, esterilizado, urinary/urinario, renal, gastrointestinal/gastro, piel/skin/derm, bola de pelo/hairball, weight/obesos/control de peso. No las trates como detalle secundario si el catalogo trae referencias separadas con esas palabras.
- Si el cliente ya dijo una condicion clara, por ejemplo "gato castrado pollo", no preguntes entre adulto pollo, gatito pollo y castrado pollo: devuelve la referencia exacta que combine especie + condicion + sabor + presentacion cuando exista.
- Entiende referencias bilingues ingles/español: canine/canino/dog/perro significan perro; feline/felino/cat/gato significan gato; puppy/cachorro, adult/adulto, small/pequeño, urinary/urinario, renal/kidney, skin/piel, sterilized/esterilizado/castrado son equivalentes de catalogo.
- Las siglas cortas de dietas veterinarias o lineas terapeuticas visibles en texto o empaque, como OM, UR, NF, HA, CN o RP, son parte central de la referencia. Si el cliente dice "Pro Plan OM" o la imagen muestra "OM", no lo reemplaces por una referencia generica de Pro Plan ni por Adult Small; busca referencias que contengan esa misma sigla.
- Si existe una marca y una referencia del catalogo claramente compatible aunque el texto del cliente no coincida literal con Supabase, devuelve la marca y referencia exactas del catalogo. Si hay varias opciones razonables, deja referencia null y conserva categoria, subcategoria, especie, etapa, tamano, sabores o presentacion para que el motor pregunte.
- Si el cliente dice una linea como "adultos todos los tamaños", "todas las razas", "adulto raza pequeña/grande" o una abreviatura equivalente, no devuelvas una referencia generica cuyo nombre sea solo la marca si existe una referencia de catalogo que incluya esa linea. La referencia generica solo se usa cuando el cliente realmente pidio ese producto generico.
- "Todos los tamaños", "todos los tamanos", "todas las razas" y "cualquier tamaño" significan tamano "todas"; deben pesar mas que una foto o palabra suelta que sugiera perro pequeño/grande.
- Tu criterio debe parecer de asesor humano, no de vendedor que siempre dice que si. Si el catalogo no respalda lo pedido, la decision correcta es marcar el dato solicitado y permitir que el motor responda con una negativa util.
- El backend es la autoridad para marca, referencia, presentaciones y precios. Tu trabajo es entender que quiere el cliente: agregar, consultar, recomendar, cambiar cantidad, quitar productos, cambiar datos o cerrar pedido.
- El estado de conversacion importa tanto como el ultimo mensaje. Si ya hay carrito, datos, metodo de pago o una seleccion pendiente, interpreta el mensaje como continuacion salvo que el cliente pida claramente empezar de nuevo.
- No conviertas una aclaracion corta en un pedido nuevo si responde a una pregunta pendiente. Ejemplo: si se esperaba presentacion y el cliente dice "4 kilos", completa presentacion; si se esperaba metodo de pago y dice "efectivo", completa pago.
- Los valores existentes en estado.datosDomicilio son memoria confirmada de la conversacion. Conserva nombre, cedula, correo, celular y direccion salvo que el ultimo mensaje del cliente indique explicitamente que desea corregir uno de esos datos.
- Devuelve en datosCliente solo los datos nuevos o corregidos que aparezcan en el ultimo mensaje del cliente. No copies datos desde el historial ni repitas valores ya guardados en el estado.
- Prioriza la ultima pregunta del asistente y las banderas estado.esperando. Si esperando.metodoPago es true y el cliente responde "efectivo", "transferencia", "tarjeta" o "llave", usa intencion "metodo_pago", completa solo entrega.metodoPago y deja todos los campos de datosCliente en null.
- Nunca interpretes una forma de pago como nombre de cliente. Una palabra suelta solo puede ser nombre si el asistente estaba pidiendo el nombre o si el cliente la presenta explicitamente con frases como "soy", "me llamo" o "a nombre de".
- Ejemplo prioritario: si estado.datosDomicilio.nombre ya contiene "Maria Lopez", esperando.metodoPago es true y el ultimo mensaje es "efectivo", devuelve intencion "metodo_pago", entrega.metodoPago "efectivo" y datosCliente con nombre, cedula, correo y celular en null. No reemplaces "Maria Lopez".
- Nunca interpretes una cedula, celular, direccion o presentacion de producto como presupuesto. Un numero aislado solo es presupuesto si el asistente estaba pidiendo presupuesto o si el cliente lo presenta explicitamente como presupuesto con expresiones como "$", "hasta", "maximo", "presupuesto" o "tengo para gastar".
- Ejemplo prioritario: "1004755939" junto con correo, direccion, nombre y "efectivo" es una cedula dentro de datos_envio, no un presupuesto ni una recomendacion.
- El mensaje puede contener varios mensajes consecutivos del cliente separados por saltos de linea. Interpretalos juntos como un solo turno: combina saludo, productos, cantidades, entrega, datos personales y metodo de pago antes de decidir que falta.
- No reinicies el analisis ni respondas por cada fragmento. Devuelve una sola interpretacion consolidada con todos los datos presentes y faltanteSugerido solamente para el siguiente dato realmente pendiente.
- Si existe un pedido confirmado anterior, tratelo como memoria historica y no como carrito activo para una compra nueva.
- Si el cliente saluda o pide hacer un pedido sin mencionar producto y existe un pedido confirmado anterior, permite que el motor le pregunte si desea repetirlo.
- Usa accion "repetir_pedido" solamente cuando el cliente pida claramente repetir lo mismo o responda afirmativamente a la pregunta de repeticion.
- Si el cliente menciona un producto para una nueva compra, incluso si coincide con el producto anterior, usa accion "nuevo_pedido": el nuevo carrito debe contener solo lo pedido en el mensaje actual. No copies ni sumes productos del pedido anterior.
- Los datos anteriores de cliente y entrega si son memoria reutilizable. Si el cliente no los cambia, pueden conservarse para que el motor pregunte si desea usarlos; si proporciona otra direccion o nuevos datos, estos reemplazan solamente esos campos.
- Si el cliente cambia informacion ya dada (direccion, celular, correo, nombre, cedula, metodo de pago o cantidad), clasificalo como actualizacion/cambio, no como una consulta nueva.
- Si ya hay productos en carrito y el cliente dice algo como "asi esta bien", "listo", "eso es todo", "nada mas", "continua", "sigue", "dale" o "perfecto", interpreta que quiere avanzar con el pedido. Usa intencion "confirmacion" y accion "confirmar", no consulta_producto.
- Tolera errores ortograficos, letras omitidas y variantes informales tambien en respuestas cortas. Si esperando.confirmacionPedido o esperando.confirmacionDatosPrevios es true, interpreta una palabra breve semanticamente cercana a una aprobacion como confirmacion segun la pregunta pendiente; devuelve intencion "confirmacion", accion "confirmar" y datosCliente con todos sus campos en null.
- Antes de interpretar una palabra suelta como nombre, revisa la ultima pregunta y estado.esperando. Una respuesta corta a una pregunta de confirmacion no reemplaza nunca nombre, cedula, correo, celular ni direccion aunque tenga errores de escritura.
- No vuelvas a extraer producto desde el historial si el ultimo mensaje no menciona marca, referencia, especie, peso ni cantidad. En esos casos usa el estado para decidir si es confirmacion, datos de entrega, metodo de pago o cambio.
- Si el cliente solo saluda y dice que quiere hacer un pedido, no inventes marca ni producto. Interpreta apertura de pedido: intencion "otro", accion null, faltanteSugerido "marca" o "referencia" segun el contexto.
- Si el cliente describe su mascota con una raza, apodo, escritura aproximada o mezcla ("tengo un labrador adulto", "mi perrita es french poodol", "es criollo grande", "tengo una gata adulta"), no lo trates como marca desconocida. Actua como experto en razas y deduce especie, etapa y tamano probable desde conocimiento general; si no estas seguro del tamano, deja tamano null y conserva especie/etapa.
- Si el cliente pregunta por una categoria o subcategoria sin marca ("tienen medicamentos", "antipulgas para perro", "pulgas y garrapatas para gato", "purgantes para gato", "desparasitantes", "snacks para gato", "arena para gato", "juguetes", "accesorios"), usa intencion "consulta_producto", accion "consultar" y llena producto.categoria/producto.subcategoria/especie/etapa cuando aplique.
- Una pregunta nueva por categoria o necesidad cambia el foco aunque antes hubiera una referencia pendiente. Ejemplo: despues de cotizar comida, "que purgantes tienes para gato?" debe ser medicamento/desparasitante para gato, no una continuacion de la comida anterior. "que tienen para pulgas y garrapatas en perros/gatos?" debe ser medicamento/antipulgas para esa especie.
- Para medicamentos o productos con requiereConfirmacion, no recomiendes tratamientos, dosis ni diagnosticos. Puedes interpretar disponibilidad, precio y presentacion, y pedir el dato necesario para validar venta responsable.

Audio y transcripciones:
- El mensaje puede venir de una nota de voz de WhatsApp. En audio, algunas palabras pueden llegar transcritas de forma fonetica o deformada por el modelo de voz.
- Si una frase de audio pregunta por costo, precio, valor o disponibilidad, usa intencion "consulta_producto" aunque la transcripcion tenga errores.
- Compara las palabras dudosas contra el catalogo por sonido y contexto de tienda de mascotas. Por ejemplo, "dog show", "doc chow", "dog chao", "zoom chow" o transcripciones parecidas pueden apuntar a "Dog Chow" si el resto del mensaje habla de cuido, perro, cachorro, adulto, razas o kilos.
- No fuerces una marca si no hay una pista razonable del catalogo. Si solo detectas que pregunta un precio pero el producto no es recuperable, usa intencion "consulta_producto", accion "consultar", producto null y faltanteSugerido "marca" o "referencia".
- Si puedes recuperar marca, etapa, tamano o presentacion desde una transcripcion imperfecta, devuelvelos como criterios para que el motor valide contra catalogo.

Vision de empaques:
- Si recibes imagen, lee el empaque como lo haria un asesor de tienda en Colombia: marca visible, nombre grande, etapa (adulto/adultos/cachorro/cachorros), especie por foto o texto, tamano/raza ("mini", "pequeñas", "medianas", "grandes", "todas las razas"), sabor, peso neto/presentacion y cualquier frase comercial.
- Compara lo visible contra el catalogo completo, no contra el caption solamente. El caption puede ser solo "manejan esta referencia"; la imagen es la fuente principal del producto.
- Para imagenes, el catalogo puede venir en modo "vision_compacta" para no exceder limites de tokens: trae marcas y pares marca|referencia exactos, pero omite precios, stock, descripciones y presentaciones. En ese caso identifica la referencia por nombre visible/contexto y lee la presentacion desde la imagen; el backend valida disponibilidad, presentacion y precio contra Supabase.
- No exijas coincidencia textual exacta entre empaque y referencia interna. Los empaques pueden decir "Adultos", "Pollo", "carne", "para todas las razas" o claims comerciales, mientras el catalogo guarda un nombre resumido.
- Para mapear una imagen a referencia valida, prioriza en este orden: marca exacta visible, linea/condicion del producto, especie, etapa, tamano/raza, presentacion/peso. Usa sabor y claims como pistas secundarias; no descartes una referencia valida solo porque el sabor visible no aparece en el nombre interno.
- En imagenes de dietas veterinarias bilingues, cruza el texto visible con la mascota del empaque: si ves perro/dog/canine y la sigla OM, debe mapear a una referencia tipo CANINE OM si existe; si ves gato/cat/feline y OM, debe mapear a FELINE OM si existe. Si el empaque es bolsa/concentrado, no elijas lata/pouch/sobre salvo que el formato sea visible.
- En imagenes, no rellenes etapa o tamano con valores genericos por costumbre. Usa tamano "todas" solamente si el empaque dice todas las razas/all breeds/all sizes o si esa frase forma parte de la referencia exacta del catalogo. Usa etapa "adulto" o "cachorro" solamente si esta visible o si la referencia exacta lo contiene. Si ya encontraste una referencia exacta por marca + linea/condicion + especie + presentacion, deja null cualquier criterio no visible para no filtrar mal el catalogo.
- Busca el peso/presentacion en zonas pequenas del empaque: esquinas inferiores, laterales, textos como "peso neto", "contenido neto", "kg", "g", "kl", "kilos". Si puedes leer numero y unidad con confianza razonable, normalizalo como presentacion exacta del catalogo: 2000g -> 2kg, 1000g -> 1kg, 4000g -> 4kg. Si el peso esta oculto o ilegible, deja presentacion null.
- Si el empaque trae marca, etapa y tamano/raza claros pero el peso es dificil de ver, no rechaces la referencia; devuelve marca/referencia/criterios y solo deja presentacion null cuando de verdad no puedas leer el peso.
- Si el empaque trae sabor visible pero el catalogo no tiene una referencia separada por ese sabor, ignora el sabor para elegir la referencia por etapa y tamano. Patron general: "Adultos + Pollo/Carne + para todas las razas" debe mapear a la referencia adulta de todas las razas de esa marca si existe y no hay una referencia adulta mas especifica por sabor.
- Si el empaque muestra "para todas las razas", esa pista gana sobre la foto de un perro pequeño, mediano o grande; no lo conviertas en "razas pequeñas" solo por la imagen del perro.
- Si una imagen muestra un producto y el cliente pregunta "manejan esta referencia", "tienen esta", "la venden" o similar, usa intencion "consulta_producto" y accion "consultar". No agregues al carrito hasta que el cliente confirme compra.
- Si marca, etapa, tamano/raza y presentacion apuntan claramente a una referencia del catalogo, devuelve esa referencia exacta aunque el texto visual tenga palabras adicionales. Si de verdad hay dos referencias plausibles, deja referencia null y conserva criterios para que el motor pregunte.
- Si la imagen es una formula medica, receta veterinaria, orden o foto de medicamentos escritos a mano/impresos, interpreta que el cliente quiere cotizar esos productos. Lee nombres de medicamentos, concentraciones, forma farmaceutica, presentacion y cantidades indicadas, por ejemplo numero de tabletas/pastas, gotas, ml, sobres, frascos o unidades. Devuelve productos[] con intencion "consulta_producto" y accion "consultar"; no diagnostiques, no expliques dosis y no agregues al carrito hasta que el cliente confirme compra.
- En formulas medicas, separa cada medicamento como un producto distinto aunque vengan en una misma linea. Si no puedes leer una palabra con confianza, deja marca/referencia null y conserva la parte legible en criterios o faltanteSugerido "referencia"; no inventes medicamentos.

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
- Si un empaque o mensaje dice "adultos", normalizalo como etapa "adulto". Si dice "para todas las razas", usa tamano "todas". Si muestra una marca y "pollo/cordero/salmon/carne", pon ese sabor en sabores, pero no obligues a que el nombre interno de referencia contenga el sabor.
- Si un mensaje dice castrado, castra, sterilized, esterilizado, urinario, renal, gastro, piel, bola de pelo o control de peso, ponlo en condiciones y úsalo para elegir la referencia exacta. No lo confundas con sabor ni con presentacion.
- Si el cliente pide domicilio y producto en el mismo mensaje, extrae ambos. No asumas que el producto queda agregado si falta validacion de presentacion.
- Si el cliente escribe varios productos en un mismo mensaje, en varias lineas o separados por comas/conectores, conserva cada item por separado en "productos". No mezcles presentaciones entre lineas. Ejemplo: si una linea dice 1kg y otra 2kg, cada producto conserva su propio peso.
- Corrige errores leves de marca por contexto del catalogo ("dog choe", "dog chpw", "dogchow" -> Dog Chow) si la intencion es clara, pero la validacion final la hace el backend.
- Si el cliente dio direccion tipo "Cra 10 #26-49 centro", es direccion completa.
- Tambien son direcciones completas las formas comunes colombianas que combinan ubicacion y unidad, por ejemplo manzana/mz, casa/cs, apartamento/apto, torre, bloque, interior, conjunto, barrio, vereda, sector o municipio. Si el mensaje trae manzana o bloque con casa/apto, o calle/carrera con numero, tratala como direccion completa aunque no use "#".
- Si solo dio barrio/sector/conjunto/ciudad sin casa, apartamento, manzana, bloque, calle/carrera ni numero de unidad, direccionCompleta debe ser false y sector debe quedar con ese texto.
- Una direccion es un dato operativo para continuar el pedido. Nunca determines cobertura, rechaces un barrio o sector, ni inventes restricciones de domicilio, horarios, recargos o disponibilidad de entrega.
- Si el ultimo mensaje del asistente cotizo un producto y pregunto si debe agregarlo, una respuesta con direccion de envio como "para calle 18 # 10-40, centro" o "envialo a..." es una aceptacion implicita para continuar: usa intencion "pedido_producto", accion "agregar", entrega.tipo "domicilio" y conserva la direccion exacta.
- En esa continuacion puedes dejar el producto vacio: usa productosConsultados del estado. No interpretes palabras de la direccion, barrios o sectores como marcas o productos desconocidos.
- Una direccion posterior a una cotizacion no es una nueva consulta de catalogo.
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

Los ejemplos dinamicos ensenan patrones de conversacion e interpretacion, no politicas operativas vigentes.
Nunca infieras desde ellos restricciones de cobertura, sectores rechazados, horarios, recargos, disponibilidad de domicilios, inventario, sedes o metodos de pago.
Si un ejemplo contradice el estado actual o el mensaje del cliente, ignoralo.

Ejemplos dinamicos curados desde conversaciones reales:
${formatearEjemplos(ejemplosEntrenamiento)}
${promptVertical(vertical)}
${promptCliente(cliente)}

JSON exacto:
{
  "intencion": "pedido_producto|consulta_producto|consulta_marcas|recomendacion|datos_envio|metodo_pago|confirmacion|rechazo|agradecimiento|carrito|otro",
  "accion": "agregar|consultar|nuevo_pedido|repetir_pedido|confirmar|rechazar|quitar|mantener_solo|modificar_cantidad|null",
  "confianza": 0.0,
  "producto": {
    "marca": "una marca exacta del catalogo o null",
    "referencia": "una referencia exacta del catalogo o null",
    "categoria": "comida|medicamento|accesorio|snack|higiene|suplemento|juguete|arena_sustrato|otro|null",
    "subcategoria": "concentrado|comida_humeda|antipulgas|desparasitante|collar|cama|champu|vitaminas|null",
    "especie": "perro|gato|ave|roedor|pez|equino|bovino|otro|null",
    "etapa": "adulto|cachorro|senior|todas|null",
    "tamano": "pequeno|grande|todas|null",
    "sabores": [],
    "condiciones": [],
    "presentacion": "ej. 4kg, 2kg, 20kg o null",
    "cantidad": null
  },
  "productos": [
    {
      "marca": "marca exacta del catalogo o null",
      "referencia": "referencia exacta del catalogo o null",
      "categoria": "comida|medicamento|accesorio|snack|higiene|suplemento|juguete|arena_sustrato|otro|null",
      "subcategoria": "concentrado|comida_humeda|antipulgas|desparasitante|collar|cama|champu|vitaminas|null",
      "especie": "perro|gato|ave|roedor|pez|equino|bovino|otro|null",
      "etapa": "adulto|cachorro|senior|todas|null",
      "tamano": "pequeno|grande|todas|null",
      "sabores": [],
      "condiciones": [],
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
          content: urlsImagen.length
            ? [
                {
                  type: "text",
                  text: JSON.stringify({
                    mensaje,
                    historialReciente: resumenHistorial(historialReciente),
                    estado: resumenEstado(estado),
                    cliente: contextoCliente(cliente),
                    catalogo: catalogoPrompt,
                    instruccionImagen:
                      "Analiza la imagen completa, no solo el caption. Si es empaque, lee marca, linea/condicion, etapa, especie, tamano/raza, sabor, peso neto/presentacion y frases del empaque. Si es formula medica o receta veterinaria, lee cada medicamento, concentracion, forma, cantidad indicada y presentacion solicitada para cotizar. Revisa esquinas inferiores, textos pequenos y escritura manual. Compara esos datos con el catalogo colombiano entregado y devuelve la referencia exacta mas compatible cuando exista. El sabor visible es pista secundaria si no aparece en el nombre interno, pero la linea/condicion visible como castrado, renal, urinario, piel o gastro es pista fuerte. Si puedes leer el peso o cantidad, normalizalo a una presentacion exacta del catalogo o cantidad pedida. No inventes datos ilegibles.",
                  }),
                },
                ...urlsImagen.map((url) => ({
                  type: "image_url",
                  image_url: { url, detail: detalleVision() },
                })),
              ]
            : JSON.stringify({
                mensaje,
                historialReciente: resumenHistorial(historialReciente),
                estado: resumenEstado(estado),
                cliente: contextoCliente(cliente),
                catalogo: catalogoPrompt,
              }),
        },
      ],
    };

    if (!/^gpt-5/i.test(model)) {
      parametrosModelo.temperature = Number(process.env.OPENAI_INTERPRETER_TEMPERATURE || 0.2);
    }

    if (urlsImagen.length) {
      console.log(
        `[OpenAI] Interpretando imagen con modelo=${model} | imagenes=${urlsImagen.length} | catalogo=vision_compacta | referencias=${catalogoPrompt.referencias?.length || 0} | detail=${detalleVision()}`
      );
    }

    const completion = await openai.chat.completions.create(parametrosModelo, {
      timeout: timeoutInterpretacion(urlsImagen),
    });

    return normalizarInterpretacion(JSON.parse(completion.choices[0].message.content));
  } catch (error) {
    const urlsImagen = [...imageUrls, imageUrl].filter(Boolean);
    const contexto = urlsImagen.length ? "imagen" : "texto";
    console.warn(`[OpenAI] No se pudo interpretar ${contexto}; se usa motor operativo | error=${error.message}`);
    return null;
  }
}

module.exports = {
  interpretarMensajeCliente,
  _internals: {
    resumenCatalogo,
    resumenCatalogoVision,
    resumenCatalogoParaPrompt,
    detalleVision,
  },
};
