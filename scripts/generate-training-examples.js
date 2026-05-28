const fs = require("fs");
const path = require("path");

const inputDir = process.argv[2] || "/Users/gomez/Downloads/Examples_chats";
const outputDir = process.argv[3] || path.join(process.cwd(), "data", "training_examples");

const EMPLOYEE_RE = /distrifincapereira/i;
const MESSAGE_RE = /^(\d{1,2}\/\d{1,2}\/\d{4}),\s+(\d{1,2}:\d{2}[^-]*) - ([^:]+): ([\s\S]*)$/;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalize(text = "") {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function redact(text = "") {
  const safe = text
    .replace(/[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[correo]")
    .replace(/@[a-z0-9._-]+/gi, "[cuenta]")
    .replace(/\+?57\s?\d[\d\s-]{8,}/g, "[telefono]")
    .replace(/\b3\d{9}\b/g, "[telefono]")
    .replace(/\b\d{7,10}\b/g, "[numero]")
    .replace(
      /\b(calle|cll|cra|carrera|avenida|av|mz|manzana|apto|apartamento|torre|casa|diagonal|transversal|cr)\b[^\n]{0,90}/gi,
      "[direccion]"
    )
    .replace(/Chat de WhatsApp con [^\n]+/gi, "Chat de WhatsApp con [cliente]")
    .trim();

  return safe
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      const looksLikeName = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}$/.test(trimmed);
      const commonPhrase = /^(buenos|buenas|buena|hola|muchas|mil|listo|vale|ok|gracias|para|total)\b/i.test(trimmed);
      const productPhrase = /\b(chunky|chow|purina|excellent|agility|arena|galgocal|organew|capstar|gusantrol|azimelox|clorhexidina|klinadine|test|wild|king|kg|mg|gr|gato|perro|cachorro|adulto)\b/i.test(
        trimmed
      );

      return looksLikeName && !commonPhrase && !productPhrase ? "[nombre]" : line;
    })
    .join("\n");
}

function parseChat(filePath) {
  const messages = [];
  let current = null;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(MESSAGE_RE);
    if (match) {
      if (current) messages.push(current);
      current = {
        date: match[1],
        time: match[2].trim(),
        sender: match[3].trim(),
        body: match[4],
      };
    } else if (current) {
      current.body += `\n${line}`;
    }
  }

  if (current) messages.push(current);

  return messages.filter(
    (message) =>
      message.body &&
      !message.body.includes("cifrados de extremo") &&
      !message.body.includes("mensajes temporales") &&
      !message.body.includes("Se eliminó este mensaje")
  );
}

function groupTurns(messages) {
  const turns = [];

  messages.forEach((message) => {
    const speaker = EMPLOYEE_RE.test(message.sender) ? "employee" : "customer";
    const last = turns[turns.length - 1];

    if (last && last.speaker === speaker) {
      last.messages.push(message);
      last.body = `${last.body}\n${message.body}`;
      return;
    }

    turns.push({
      speaker,
      messages: [message],
      body: message.body,
    });
  });

  return turns;
}

function sqlString(value = "") {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlArray(tags = []) {
  return `array[${tags.map(sqlString).join(", ")}]`;
}

function addExample(examples, seen, example) {
  const customerMessage = redact(example.customer_message).slice(0, 1200);
  const idealResponse = redact(example.ideal_response).slice(0, 900);
  const notes = redact(example.notes || "").slice(0, 700);
  const key = `${example.intent}|${customerMessage}|${idealResponse}`;

  if (seen.has(key)) return;
  seen.add(key);

  examples.push({
    intent: example.intent,
    customer_message: customerMessage,
    ideal_response: idealResponse,
    notes,
    tags: example.tags || [],
    priority: example.priority || 50,
  });
}

function nextTurn(turns, index, speaker = null) {
  const next = turns[index + 1];
  if (!next) return null;
  return speaker && next.speaker !== speaker ? null : next;
}

function classifyConversation(file, turns, examples, seen) {
  turns.forEach((turn, index) => {
    const text = normalize(turn.body);
    const nextEmployee = nextTurn(turns, index, "employee");

    if (turn.speaker === "customer" && turn.messages.length >= 2) {
      addExample(examples, seen, {
        intent: "esperar_mensajes_seguidos",
        customer_message: `El cliente envio varios mensajes seguidos:\n${turn.body}`,
        ideal_response:
          "Responder despues de entender todos los mensajes juntos. Unir saludo, producto, cantidad, imagen omitida, precio o domicilio en una sola intencion antes de preguntar.",
        notes:
          "No responder al primer saludo si inmediatamente viene el producto o la direccion. Evitar preguntas repetidas cuando el cliente ya completo la idea en mensajes seguidos.",
        tags: ["varios mensajes", "contexto", "no preguntar de mas"],
        priority: 100,
      });
    }

    if (
      turn.speaker === "customer" &&
      (text.includes("precio") || text.includes("cuanto") || text.includes("cuánto") || text.includes("que cuesta")) &&
      nextEmployee
    ) {
      addExample(examples, seen, {
        intent: "consulta_precio",
        customer_message: `Cliente consulta precio:\n${turn.body}\n\nRespuesta humana observada:\n${nextEmployee.body}`,
        ideal_response:
          "Dar el precio o las presentaciones disponibles de forma directa. Si el cliente ya menciono producto y presentacion, no pedir marca ni referencia otra vez. Cerrar con una sola pregunta: si desea agregarlo o si quiere domicilio.",
        notes:
          "Usar el catalogo actual para precios. El ejemplo enseña el flujo, no los valores si el producto no existe en backend.",
        tags: ["precio", "producto exacto", "directo"],
        priority: 90,
      });
    }

    if (
      turn.speaker === "customer" &&
      (text.includes("domicilio") || text.includes("direccion") || text.includes("envio") || text.includes("para hacer un domicilio"))
    ) {
      addExample(examples, seen, {
        intent: "domicilio",
        customer_message: `Cliente habla de domicilio:\n${turn.body}`,
        ideal_response:
          "Si ya hay producto en carrito, avanzar con entrega y pedir solo el dato faltante: direccion, metodo de pago o datos de facturacion. Si no hay producto, pedir primero que producto necesita.",
        notes: "No pedir todos los datos si el cliente ya dio direccion o metodo de pago.",
        tags: ["domicilio", "datos faltantes", "pedido"],
        priority: 95,
      });
    }

    if (turn.speaker === "customer" && (text.includes("tarjeta") || text.includes("efectivo") || text.includes("transferencia") || text.includes("llave"))) {
      addExample(examples, seen, {
        intent: "metodo_pago",
        customer_message: `Cliente indica metodo de pago:\n${turn.body}`,
        ideal_response:
          "Registrar el metodo de pago y continuar con el siguiente dato faltante. Si es transferencia, enviar datos autorizados y pedir comprobante; si es efectivo o tarjeta, continuar sin repetir todo el pedido.",
        notes: "El metodo de pago es un dato operativo, no una consulta de catalogo.",
        tags: ["pago", "transferencia", "tarjeta", "efectivo"],
        priority: 85,
      });
    }

    if (turn.speaker === "employee" && (text.includes("no lo tenemos") || text.includes("no tenemos") || text.includes("agotado"))) {
      const previousCustomer = turns[index - 1]?.speaker === "customer" ? turns[index - 1] : null;
      addExample(examples, seen, {
        intent: "producto_no_disponible",
        customer_message: `Cliente busca algo no disponible:\n${previousCustomer?.body || ""}\n\nRespuesta humana observada:\n${turn.body}`,
        ideal_response:
          "Responder con claridad que por ahora no esta disponible. Si hay una alternativa real en el backend, ofrecerla brevemente; si no, no inventar sustitutos.",
        notes: "Ser amable sin dar falsas expectativas.",
        tags: ["no disponible", "alternativa", "honestidad"],
        priority: 80,
      });
    }

    if (turn.speaker === "customer" && (text.includes("recomienda") || text.includes("recomiendas") || text.includes("buena") || text.includes("no tan cara"))) {
      addExample(examples, seen, {
        intent: "recomendacion",
        customer_message: `Cliente pide recomendacion:\n${turn.body}`,
        ideal_response:
          "Recomendar segun especie, edad, tamano y presupuesto. Si falta presupuesto, preguntar solo presupuesto; si ya lo dijo, sugerir opciones reales del catalogo y explicar un beneficio corto.",
        notes: "La recomendacion debe sonar asesora, no robotica.",
        tags: ["recomendacion", "presupuesto", "beneficios"],
        priority: 90,
      });
    }

    if (turn.speaker === "customer" && text.includes("<multimedia omitido>")) {
      addExample(examples, seen, {
        intent: "imagen_omitida",
        customer_message: `Cliente envio imagen o comprobante:\n${turn.body}`,
        ideal_response:
          "Reconocer que el cliente envio una imagen. Si el sistema aun no puede verla, pedir nombre del producto, presentacion o confirmar si es comprobante. No inventar el contenido de la imagen.",
        notes: "Preparado para la mejora futura de vision.",
        tags: ["imagen", "multimedia", "vision futura"],
        priority: 70,
      });
    }

    if (turn.speaker === "customer" && (text.includes("gracias") || text.includes("muchas gracias"))) {
      addExample(examples, seen, {
        intent: "cierre_amable",
        customer_message: `Cliente agradece o cierra:\n${turn.body}`,
        ideal_response:
          "Responder de forma breve y amable. Si el pedido ya quedo confirmado, no volver a pedir datos ni repetir el resumen.",
        notes: "Cerrar con calidez y dejar puerta abierta.",
        tags: ["cierre", "agradecimiento", "no repetir"],
        priority: 75,
      });
    }
  });
}

function extractObservedTerms(messages) {
  const stop = new Set([
    "hola",
    "buenas",
    "buenos",
    "dias",
    "tardes",
    "noches",
    "precio",
    "domicilio",
    "gracias",
    "por favor",
    "para",
    "tiene",
    "tienen",
    "cuanto",
    "cuesta",
    "pedido",
  ]);
  const counts = new Map();

  messages
    .filter((message) => !EMPLOYEE_RE.test(message.sender))
    .forEach((message) => {
      const text = normalize(message.body.replace(/<Multimedia omitido>/gi, ""));
      const candidates = text.match(/\b[a-z0-9][a-z0-9\s.-]{2,35}(?:kg|kl|gr|gramos|libras|mg)?\b/g) || [];

      candidates.forEach((candidate) => {
      const clean = candidate.replace(/\s+/g, " ").trim();
      if (clean.length < 4 || stop.has(clean)) return;
      if (/\[(numero|telefono|correo|direccion|nombre|cuenta)\]/i.test(redact(clean))) return;
      if (!/\b(kg|kl|gr|gramos|libras|mg|chunky|chow|purina|excellent|agility|arena|galgocal|organew|capstar|gusantrol|azimelox|clorhexidina|klinadine|test of the wild|king)\b/i.test(clean)) {
        return;
      }
        counts.set(clean, (counts.get(clean) || 0) + 1);
      });
    });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 120)
    .map(([term, count]) => ({ term: redact(term), count }));
}

function main() {
  ensureDir(outputDir);

  const files = fs.readdirSync(inputDir).filter((file) => file.endsWith(".txt"));
  const examples = [];
  const seen = new Set();
  const allMessages = [];
  const stats = {
    files: files.length,
    messages: 0,
    employeeMessages: 0,
    customerMessages: 0,
    mediaMessages: 0,
    examples: 0,
  };

  files.forEach((file) => {
    const messages = parseChat(path.join(inputDir, file));
    allMessages.push(...messages);
    stats.messages += messages.length;
    stats.employeeMessages += messages.filter((message) => EMPLOYEE_RE.test(message.sender)).length;
    stats.customerMessages += messages.filter((message) => !EMPLOYEE_RE.test(message.sender)).length;
    stats.mediaMessages += messages.filter((message) => /<Multimedia omitido>/i.test(message.body)).length;

    classifyConversation(file, groupTurns(messages), examples, seen);
  });

  examples.sort((a, b) => b.priority - a.priority || a.intent.localeCompare(b.intent));
  stats.examples = examples.length;

  const values = examples
    .map(
      (example) =>
        `  (${sqlString(example.intent)}, ${sqlString(example.customer_message)}, ${sqlString(
          example.ideal_response
        )}, ${sqlString(example.notes)}, ${sqlArray(example.tags)}, ${example.priority})`
    )
    .join(",\n");

  const sql = `-- Generated from sanitized WhatsApp exports. Review before running in Supabase.\ninsert into public.training_examples\n  (intent, customer_message, ideal_response, notes, tags, priority)\nvalues\n${values}\non conflict do nothing;\n`;

  fs.writeFileSync(path.join(outputDir, "generated_training_examples.json"), JSON.stringify(examples, null, 2));
  fs.writeFileSync(path.join(outputDir, "generated_training_examples.sql"), sql);
  fs.writeFileSync(path.join(outputDir, "observed_terms.json"), JSON.stringify(extractObservedTerms(allMessages), null, 2));
  fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(stats, null, 2));

  console.log(JSON.stringify(stats, null, 2));
}

main();
