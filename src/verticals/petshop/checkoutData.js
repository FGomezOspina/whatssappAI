const { normalizar } = require('../../utils/text');

// This is an order preference, never inferred from the presence of tax data.
function solicitudFacturaElectronica(mensaje = '', actual = false) {
  const texto = String(mensaje).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let decision = null;
  if (actual && /^(?:no,?\s*)?(?:ya no la (?:quiero|necesito)|no la (?:quiero|necesito)|(?:mejor |por favor )?sin factura|no (?:necesito|quiero) (?:la )?factura)(?:[.!]| por favor)?$/.test(texto.trim())) return false;
  if (/\b(?:facturame|factureme|facturenme) electronicamente\b/.test(texto) && !/\bno\b/.test(texto)) return true;
  for (const match of texto.matchAll(/\b(?:factura(?:cion)? electronica|factura digital)\b/g)) {
    const antes = texto.slice(0, match.index).split(/[,.!?;\n]|\bpero\b|\baunque\b/).pop();
    const despues = texto.slice(match.index + match[0].length).split(/[,.!?;\n]|\bpero\b/)[0];
    if (/\b(?:sin|no(?: la)?(?: necesito| quiero| requiero| deseo)?|no me (?:hagas|haga|envies)|cancel[ao]|cancela(?:r)?|ya no(?: necesito| quiero)?)\s*(?:una |la )?$/.test(antes) ||
        /^\s*(?:no|ya no|cancelada)\b/.test(despues)) decision = false;
    else if (!/\b(?:les aviso|te aviso|avisare|llegara a necesitar)\b/.test(despues) && !/\b(?:cuando|en caso de|que es|como|ofrecen|emiten|hacen|tienen|pueden emitir|no se si)\b/.test(antes) &&
        (/\b(?:necesito|quiero|requiero|deseo|solicito|hazme|haganme|me haces|me hace|dame|regalame|incluye|con|si)\s*(?:una |la |mi )?$/.test(antes) ||
        (!antes.trim() && /^(?:\s*por favor)?\s*$/.test(despues) && !/[?¿]/.test(mensaje)) ||
        /^\s*(?:la )?(?:necesito|quiero|a nombre de)\b/.test(despues) ||
        /\b(?:me (?:puedes|pueden|podrias|podrian) (?:hacer|enviar|dar|generar))\s*(?:una |la )?$/.test(antes))) decision = true;
  }
  return decision;
}

function decidirFactura(mensaje, estado, interpretacion = {}) {
  const directa = solicitudFacturaElectronica(mensaje, estado.facturacionElectronica === true);
  if (directa !== null) return directa;
  const propuesta = interpretacion?.facturacion;
  const evidencia = propuesta?.evidencia;
  // Semantic extraction can handle paraphrases/typos, but must cite the actual
  // customer request and explicitly mention electronic billing. A document,
  // email, sender profile, or a generic invoice does not authorize this mode.
  if (typeof propuesta?.electronica !== 'boolean' || typeof evidencia !== 'string' || !evidencia.trim()) return null;
  const fuente = normalizar(mensaje), cita = normalizar(evidencia);
  if (!fuente.includes(cita) || !/\b(?:factur\w*|fatur\w*|facur\w*)\b.*\b(?:electr\w*|eletr\w*)\b/.test(cita)) return null;
  if (/\b(?:cuando|en caso de|les aviso|te aviso|que es|como funciona|ofrecen|emiten)\b/.test(cita)) return null;
  return propuesta.electronica;
}

function normalizarDato(campo, valor, parcial = false) {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null;
  const limpio = String(valor).trim().replace(/\s+/g, ' ');
  if (!limpio || /^(?:null|undefined|pendiente|no se|no tengo)$/i.test(limpio)) return null;
  if (campo === 'correo') return /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(limpio) ? limpio : null;
  if (campo === 'celular') {
    if (!/^\+?[\d\s().-]+$/.test(limpio)) return null;
    const numero = limpio.replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, '');
    return /^3\d{9}$/.test(numero) ? numero : null;
  }
  if (campo === 'cedula') {
    const numero = limpio.replace(/[.\s]/g, '');
    return /^\d{6,12}(?:-\d)?$/.test(numero) ? numero : null;
  }
  if (campo === 'nombre') {
    const texto = normalizar(limpio);
    if (limpio.length > 120 || /[@:#\n]/.test(limpio) ||
        /\b(?:factura|facturacion|necesito|quiero|domicilio|efectivo|tarjeta|transferencia|gracias|confirmo|pedido|direccion|celular|correo|pago|datos|completos|adelante|agrega|comprar|envia|envio|debe|figurar|persona)\b/.test(texto)) return null;
    return /^[\p{L}\d .&'’-]+$/u.test(limpio) && (limpio.match(/\p{L}+/gu) || []).length >= (parcial ? 1 : 2) ? limpio : null;
  }
  if (campo === 'direccion') {
    if (/^(?:calle|cll|cra|carrera|av|avenida|diagonal|transversal)\s+\d+[a-z]?$/i.test(limpio)) return null;
    if (limpio.length < 8 || /^(?:la )?(?:misma|anterior|habitual)|^no se$/i.test(limpio)) return null;
    return /\d/.test(limpio) || /\b(?:finca|vereda)\b/i.test(limpio) ? limpio : null;
  }
  return limpio;
}

function fusionarDatos(actuales = {}, nuevos = {}) {
  const resultado = { ...actuales };
  for (const campo of ['nombre', 'cedula', 'correo', 'celular', 'direccion', 'sector', 'direccionParcial']) {
    const valor = normalizarDato(campo, nuevos[campo], campo === "nombre" && !normalizarDato("nombre", actuales.nombre));
    if (valor) resultado[campo] = valor;
  }
  if (resultado.direccion) {
    delete resultado.direccionParcial;
    delete resultado.sector;
  }
  return resultado;
}

function camposRequeridos(estado) {
  return estado.facturacionElectronica === true
    ? ['nombre', 'cedula', 'correo', 'celular', 'direccion']
    : ['nombre', 'direccion', 'celular'];
}

const REGLA_DATOS_CIERRE = `Datos de cierre: por defecto NO hay factura electronica. Pide solo nombre completo, direccion de entrega, celular y metodo de pago. Solo una solicitud EXPLICITA de factura electronica agrega cedula o NIT y correo; nombre admite razon social. No infieras esa solicitud por aportar documento/correo ni por mencionar factura de forma ambigua. Respeta negaciones y cambios de opinion. Extrae todos los campos nuevos o corregidos del mensaje/lote en cualquier orden, conserva los datos ya guardados y solicita exclusivamente faltantes validos juntos. No uses el nombre comercial del remitente ni el numero del canal como datos del cliente sin que los aporte o confirme. No confundas NIT/cedula con celular, direccion, cantidad o presupuesto. En facturacion devuelve electronica=true/false solo ante solicitud/cancelacion explicita y evidencia con la cita textual exacta del cliente; en ausencia de solicitud usa electronica=null, evidencia=null. Razon social va en datosCliente.nombre y NIT en datosCliente.cedula. Metodos: efectivo/contraentrega, transferencia bancaria, tarjeta debito o credito, llave Bre-B. Nunca pidas numeros de tarjeta, CVV ni claves. La peticion/cancelacion de factura para un pedido activo es datos_envio y continuarFlujo=true; no confirma el pedido. Cuando esten completos, el motor muestra el resumen y continua al cierre existente; no hagas preguntas extra ni vuelvas a pedir datos conocidos.`;
module.exports = { decidirFactura, solicitudFacturaElectronica, normalizarDato, fusionarDatos, camposRequeridos, REGLA_DATOS_CIERRE };
