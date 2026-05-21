require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const express = require("express");
const OpenAI = require("openai");

const app = express();
app.use(express.urlencoded({ extended: false }));

const PRODUCTOS_PATH = path.join(__dirname, "productos.json");
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: Number(process.env.OPENAI_TIMEOUT_MS || 7000),
    })
  : null;
const conversaciones = {};

const ALIAS_MARCAS_EXTRA = {
  "dog chow": ["dogchow", "dog show", "chow"],
};

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
  "gramos",
  "gr",
  "g",
];

function cargarProductos() {
  return JSON.parse(fs.readFileSync(PRODUCTOS_PATH, "utf8"));
}

function normalizar(texto = "") {
  return texto
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function elegirVariante(llave, opciones) {
  const base = normalizar(llave);
  const suma = base.split("").reduce((total, caracter) => total + caracter.charCodeAt(0), 0);
  return opciones[suma % opciones.length];
}

function escaparXml(texto = "") {
  return texto
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function responder(res, mensaje) {
  res.set("Content-Type", "text/xml");
  res.send(`
<Response>
  <Message>${escaparXml(mensaje)}</Message>
</Response>
  `);
}

function extraerTokensCriticos(respuesta) {
  return [
    ...(respuesta.match(/\$\d[\d.]*/g) || []),
    ...(respuesta.match(/\b\d+(?:[.,]\d+)?\s?(?:kg|g|gr|lb)\b/gi) || []),
  ];
}

function conservaDatosCriticos(respuestaBase, respuestaHumanizada) {
  const tokensCriticos = extraerTokensCriticos(respuestaBase);
  const lineasCriticas = respuestaBase
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea.startsWith("- ") || linea.startsWith("Total:") || linea.startsWith("Precio:"));

  return [...tokensCriticos, ...lineasCriticas].every((token) => respuestaHumanizada.includes(token));
}

async function humanizarRespuesta(mensajeCliente, respuestaBase) {
  if (!openai || process.env.HUMANIZAR_IA === "false") {
    return respuestaBase;
  }

  if (respuestaBase.includes("Datos de domicilio:")) {
    return respuestaBase;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.55,
      messages: [
        {
          role: "system",
          content: `
Eres un asesor amable de una tienda de mascotas en Colombia por WhatsApp.
Tu tarea es reescribir la respuesta base para que suene más humana, cálida y natural.

Reglas estrictas:
- No inventes marcas, referencias, presentaciones, precios, cantidades ni beneficios.
- Conserva exactamente todas las líneas que empiecen por "- ", "Precio:" o "Total:".
- Conserva exactamente pesos y precios como aparecen.
- Mantén la respuesta corta, clara y vendedora.
- Si falta información, haz solo una pregunta.
          `.trim(),
        },
        {
          role: "user",
          content: `Mensaje del cliente: ${mensajeCliente}\n\nRespuesta base:\n${respuestaBase}`,
        },
      ],
    });

    const respuesta = completion.choices[0].message.content.trim();
    if (!respuesta || !conservaDatosCriticos(respuestaBase, respuesta)) {
      return respuestaBase;
    }

    return respuesta;
  } catch (error) {
    console.error("Error humanizando respuesta:", error.message);
    return respuestaBase;
  }
}

function obtenerConversacion(usuario) {
  if (!conversaciones[usuario]) {
    conversaciones[usuario] = {
      marca: null,
      criterios: {},
      ultimaSeleccion: null,
      carrito: [],
      datosDomicilio: {},
      esperandoDatosDomicilio: false,
      esperandoPresupuesto: false,
      pendienteRecomendacion: false,
      esperandoMarca: false,
    };
  }

  return conversaciones[usuario];
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

function contieneAlguno(textoNormalizado, palabras) {
  return palabras.some((palabra) => contieneFrase(textoNormalizado, palabra));
}

function extraerCriterios(mensaje) {
  const texto = normalizar(mensaje);
  const criterios = {};

  if (contieneAlguno(texto, ["cachorro", "cachorros", "bebe", "puppy"])) {
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
      criterios.tamano ||
      criterios.edadEspecial ||
      (criterios.sabores && criterios.sabores.length)
  );
}

function atributosReferencia(referencia) {
  const texto = normalizar(`${referencia.nombre} ${referencia.descripcion || ""}`);
  const atributos = {
    etapa: null,
    tamano: null,
    sabores: [],
    edadEspecial: null,
  };

  if (contieneAlguno(texto, ["cachorro", "cachorros"])) {
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

  if (criterios.etapa && atributos.etapa && atributos.etapa !== criterios.etapa) {
    return false;
  }

  if (criterios.edadEspecial && atributos.edadEspecial !== criterios.edadEspecial) {
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

function buscarReferenciaExacta(marca, mensaje) {
  const texto = normalizar(mensaje);

  return marca.referencias.find((referencia) => contieneFrase(texto, referencia.nombre));
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

function normalizarPeso(texto = "") {
  return normalizar(texto)
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/kilogramos?|kilos?/g, "kg")
    .replace(/gramos?/g, "g")
    .replace(/libras?/g, "lb");
}

function buscarPresentacion(referencia, mensaje) {
  const textoPeso = normalizarPeso(mensaje);
  const texto = normalizar(mensaje);

  const porPeso = referencia.presentaciones.find((presentacion) => {
    const peso = normalizarPeso(presentacion.peso);
    return textoPeso.includes(peso);
  });

  if (porPeso) return porPeso;

  const numero = texto.match(/(?:la\s+de|presentacion\s+de|bolsa\s+de|bulto\s+de)\s+(\d+(?:[.,]\d+)?)/);
  if (!numero) return null;

  const valor = numero[1].replace(",", ".");
  const coincidencias = referencia.presentaciones.filter((presentacion) =>
    normalizarPeso(presentacion.peso).startsWith(valor)
  );

  return coincidencias.length === 1 ? coincidencias[0] : null;
}

function formatearPrecio(precio) {
  return `$${precio.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function formatearReferencia(marca, referencia, apertura = "¿Qué presentación te interesa?") {
  const intro = elegirVariante(`${marca.marca}-${referencia.nombre}`, [
    `¡Claro! Te encontré esta opción: ${marca.marca} ${referencia.nombre} 🐶`,
    `Perfecto, para eso te puede servir ${marca.marca} ${referencia.nombre} 🐶`,
    `Sí, la referencia que encaja es ${marca.marca} ${referencia.nombre} 🐶`,
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
    `Listo, esta es la opción exacta: ${marca.marca} ${referencia.nombre} ${presentacion.peso} 🐶`,
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
  return `Súper. En ${marca.marca} tengo estas referencias disponibles:\n${lista}\n\nCuéntame cuál te interesa o dime cómo es tu perro y te ayudo a escoger.`;
}

function describirCriterios(criterios = {}) {
  const partes = [];

  if (criterios.etapa === "adulto") partes.push("adulto");
  if (criterios.etapa === "cachorro") partes.push("cachorro");
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

function limpiarCandidatoMarca(candidato) {
  let limpio = normalizar(candidato)
    .replace(/\b(la|el|los|las|un|una|unos|unas|de|del|para|por|favor|marca|alimento|comida|cuido|concentrado|algo|y|mi|mis|su|sus|es|esta|estan)\b/g, " ")
    .replace(/\b(que|cual|cuales|tienes|tiene|manejan|maneja|venden|vende|hay|quiero|quisiera|necesito|busco|dame|deme|me|gustaria|gusta|interesa)\b/g, " ")
    .replace(/\b(mil|pesos|peso|barato|economico|economica|recomiende|recomiendas|recomienda|recomiendame|recomendar|recomendarme)\b/g, " ");

  PALABRAS_CRITERIO.forEach((palabra) => {
    limpio = limpio.replace(new RegExp(`\\b${palabra}\\b`, "g"), " ");
  });

  return limpio.replace(/\b\d+(?:[.,]\d+)?\b/g, " ").replace(/\s+/g, " ").trim();
}

function extraerMarcaDesconocida(mensaje, catalogo, opciones = {}) {
  if (buscarMarca(catalogo, mensaje)) return null;

  const texto = normalizar(mensaje);
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
    const despues = texto.slice(regex.lastIndex, regex.lastIndex + 3);
    if (/^\s*(kg|g|gr|lb)/.test(despues)) continue;

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

function resumenMarca(marca, referencias = marca.referencias) {
  const atributos = referencias.map(atributosReferencia);
  const etapas = valoresUnicos(
    atributos
      .map((atributo) => {
        if (atributo.edadEspecial === "mayor") return "perros mayores";
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

  if (resumen.etapas.length || resumen.tamanos.length) {
    lineas.push(
      `Tiene alternativas para ${unirNatural([...resumen.etapas, ...resumen.tamanos])}.`
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

  return `${lineas.join(" ")}\n\nReferencias disponibles:\n${referenciasLista}\n\nSi me dices edad, tamaño y presupuesto, te ayudo a escoger la mejor para tu perro.`;
}

function resenarReferencia(marca, referencia) {
  const presentaciones = referencia.presentaciones
    .map((presentacion) => `${presentacion.peso}: ${formatearPrecio(presentacion.precio)}`)
    .join("\n- ");
  const descripcion = referencia.descripcion
    ? `${referencia.descripcion}. `
    : "";

  return `Sí, esa referencia te puede servir: ${marca.marca} ${referencia.nombre}.\n\n${descripcion}Es una opción para revisar si buscas algo acorde a esa necesidad del perro.\n\nPresentaciones:\n- ${presentaciones}\n\n¿Cuál presentación quieres que agregue al pedido?`;
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
    return `Por ahora no encuentro una opción exacta para ${describirCriterios(criterios)}, pero revisemos otra alternativa.\n\n${listarMarcas(catalogo)}`;
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

function productoAgregadoRespuesta(estado) {
  return `${resumenCarrito(estado)}\n\n¿Quieres agregar algo más o avanzamos con los datos para el domicilio?`;
}

function extraerDatosDomicilio(mensaje) {
  const datos = {};
  const texto = mensaje.toString();
  const textoNormalizado = normalizar(mensaje);

  const correo = texto.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (correo) datos.correo = correo[0];

  const cedula = texto.match(/(?:cedula|c[eé]dula|cc|c\.c\.)\s*:?\s*(\d{6,12})/i);
  if (cedula) datos.cedula = cedula[1];

  const celular = texto.match(/(?:celular|telefono|tel[eé]fono|tel)\s*:?\s*(\+?\d[\d\s-]{7,16})/i);
  if (celular) datos.celular = celular[1].replace(/\D/g, "");

  const direccion = texto.match(/(?:direccion|direcci[oó]n|dir)\s*:?\s*([^,\n]+(?:[,\n][^,\n]+)?)/i);
  if (direccion) datos.direccion = direccion[1].trim();

  const nombre = texto.match(/(?:nombre|me llamo|soy)\s*:?\s*([a-zA-ZÁÉÍÓÚÜÑáéíóúüñ ]{3,50})/i);
  if (nombre) datos.nombre = nombre[1].trim();

  if (!datos.celular) {
    const posibleCelular = textoNormalizado.match(/\b3\d{9}\b/);
    if (posibleCelular) datos.celular = posibleCelular[0];
  }

  return datos;
}

function camposDomicilioFaltantes(estado) {
  return ["cedula", "correo", "celular", "direccion", "nombre"].filter(
    (campo) => !estado.datosDomicilio[campo]
  );
}

function solicitarDatosDomicilio(estado) {
  const faltantes = camposDomicilioFaltantes(estado);
  estado.esperandoDatosDomicilio = true;

  return `${resumenCarrito(estado)}\n\nPerfecto, para dejar el domicilio bien tomado me faltan estos datos:\n${faltantes
    .map((campo) => `- ${campo}`)
    .join("\n")}`;
}

function confirmarPedido(estado) {
  estado.esperandoDatosDomicilio = false;

  return `${resumenCarrito(estado)}\n\nDatos de domicilio:\n- Nombre: ${estado.datosDomicilio.nombre}\n- Cédula: ${estado.datosDomicilio.cedula}\n- Celular: ${estado.datosDomicilio.celular}\n- Correo: ${estado.datosDomicilio.correo}\n- Dirección: ${estado.datosDomicilio.direccion}\n\nListo, con esos datos queda el pedido preparado.`;
}

function resolverDomicilio(mensaje, estado) {
  const datos = extraerDatosDomicilio(mensaje);
  estado.datosDomicilio = { ...estado.datosDomicilio, ...datos };

  if (!estado.carrito.length) {
    return "Claro, primero dime qué producto quieres pedir y te ayudo a armar el pedido.";
  }

  if (camposDomicilioFaltantes(estado).length) {
    return solicitarDatosDomicilio(estado);
  }

  return confirmarPedido(estado);
}

function resolverDesdeUltimaSeleccion(mensaje, estado, catalogo) {
  if (!estado.ultimaSeleccion) return null;

  const marca = buscarMarcaPorNombre(catalogo, estado.ultimaSeleccion.marca);
  if (!marca) return null;

  const referencia = marca.referencias.find((item) => item.nombre === estado.ultimaSeleccion.referencia);
  if (!referencia) return null;

  const presentacion = buscarPresentacion(referencia, mensaje);
  if (!presentacion) return null;

  agregarAlCarrito(estado, marca, referencia, presentacion);
  estado.ultimaSeleccion = { marca: marca.marca, referencia: referencia.nombre, presentacion: presentacion.peso };

  return `${formatearProductoExacto(marca, referencia, presentacion)}\n\nTe lo agrego al pedido.\n\n${productoAgregadoRespuesta(estado)}`;
}

function resolverConsultaCatalogo(mensaje, estado, catalogo = cargarProductos()) {
  const marcaDetectada = buscarMarca(catalogo, mensaje);
  const criteriosMensaje = extraerCriterios(mensaje);
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
    estado.esperandoMarca = true;
    return listarMarcas(catalogo);
  }

  if (estado.esperandoDatosDomicilio || solicitaCierre(mensaje)) {
    const respuestaDesdeUltima = resolverDesdeUltimaSeleccion(mensaje, estado, catalogo);
    if (respuestaDesdeUltima) return respuestaDesdeUltima;

    if (estado.carrito.length || estado.esperandoDatosDomicilio) {
      return resolverDomicilio(mensaje, estado);
    }
  }

  if (marcaDesconocida) {
    estado.esperandoMarca = true;
    estado.esperandoPresupuesto = false;
    estado.pendienteRecomendacion = false;
    return `Por ahora no manejamos ${marcaDesconocida}.\n\n${listarMarcas(catalogo)}`;
  }

  if (estado.esperandoPresupuesto || pidioRecomendacion || pidioOpinion || presupuesto) {
    const criterios = mezclarCriterios(estado.criterios, criteriosMensaje);
    const marcaPreferida = marcaDetectada || (estado.marca ? buscarMarcaPorNombre(catalogo, estado.marca) : null);

    if (marcaPreferida && !presupuesto && !quiereEconomico(mensaje)) {
      const referencias = referenciasPorCriterios(marcaPreferida, criterios);
      const referencia = elegirMejorReferencia(referencias, criterios, mensaje);

      estado.esperandoPresupuesto = false;
      estado.pendienteRecomendacion = false;
      estado.marca = marcaPreferida.marca;
      estado.criterios = criterios;

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

  const marca = marcaDetectada || (estado.marca ? buscarMarcaPorNombre(catalogo, estado.marca) : null);
  const criterios = mezclarCriterios(estado.criterios, criteriosMensaje);

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
        return `${listarMarcas(catalogo, marcas, criterios)}\n\nSi prefieres, también puedo recomendarte según tu presupuesto.`;
      }

      return `No encontré una opción exacta para ${describirCriterios(criterios)}.\n\n${listarMarcas(catalogo)}`;
    }

    estado.esperandoMarca = true;
    return listarMarcas(catalogo);
  }

  const referenciaExacta = buscarReferenciaExacta(marca, mensaje);
  const referencias = referenciasPorCriterios(marca, criterios);
  const referencia = referenciaExacta || elegirMejorReferencia(referencias, criterios, mensaje);

  if (referencia) {
    const presentacion = buscarPresentacion(referencia, mensaje);

    estado.marca = marca.marca;
    estado.criterios = tieneCriterios(criterios) ? criterios : criteriosDesdeReferencia(referencia);
    estado.ultimaSeleccion = {
      marca: marca.marca,
      referencia: referencia.nombre,
      presentacion: presentacion ? presentacion.peso : null,
    };

    if (presentacion) {
      agregarAlCarrito(estado, marca, referencia, presentacion);
      return `${formatearProductoExacto(marca, referencia, presentacion)}\n\nTe lo agrego al pedido.\n\n${productoAgregadoRespuesta(estado)}`;
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
    return listarReferencias(marca, referenciasFiltradas.length ? referenciasFiltradas : marca.referencias);
  }

  if (!tieneCriterios(criterios)) {
    estado.marca = marca.marca;
    return listarReferencias(marca);
  }

  if (!referencias.length) {
    estado.marca = marca.marca;
    return `No encontré esa referencia en ${marca.marca}.\n\n${listarReferencias(marca)}`;
  }

  estado.marca = marca.marca;
  estado.criterios = criterios;
  return listarReferencias(marca, referencias);
}

app.post("/whatsapp", async (req, res) => {
  const mensaje = (req.body.Body || "").trim();
  const usuario = req.body.From || "anonimo";
  const estado = obtenerConversacion(usuario);
  const catalogo = cargarProductos();

  console.log("Mensaje recibido:", mensaje);

  if (!mensaje) {
    responder(res, "Cuéntame qué necesitas para tu mascota 🐶");
    return;
  }

  const tieneIntencionCatalogo =
    buscarMarca(catalogo, mensaje) ||
    tieneCriterios(extraerCriterios(mensaje)) ||
    solicitaMarcas(mensaje) ||
    solicitaReferencias(mensaje) ||
    solicitaRecomendacion(mensaje) ||
    solicitaOpinionMarca(mensaje) ||
    extraerPresupuesto(mensaje) ||
    solicitaCierre(mensaje);

  if (esSaludo(mensaje) && !tieneIntencionCatalogo) {
    responder(res, "¡Hola! Bienvenido 🐶 ¿Qué necesitas para tu mascota hoy?");
    return;
  }

  if (esAgradecimiento(mensaje) && !tieneIntencionCatalogo) {
    responder(res, "Con mucho gusto 🐶");
    return;
  }

  const respuestaBase = resolverConsultaCatalogo(mensaje, estado, catalogo);
  const respuesta = await humanizarRespuesta(mensaje, respuestaBase);
  responder(res, respuesta);
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
  });
}

module.exports = {
  app,
  resolverConsultaCatalogo,
  obtenerConversacion,
  cargarProductos,
};
