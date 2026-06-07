const MESSAGE_BREAK = "[[AIVANCE_MESSAGE_BREAK]]";

function dividirRespuestaMensajes(respuesta = "") {
  return respuesta
    .toString()
    .split(MESSAGE_BREAK)
    .map((parte) => parte.trim())
    .filter(Boolean);
}

function unirMensajesRespuesta(partes = []) {
  return partes
    .map((parte) => parte?.toString().trim())
    .filter(Boolean)
    .join(`\n\n${MESSAGE_BREAK}\n\n`);
}

function respuestaParaHistorial(respuesta = "") {
  return dividirRespuestaMensajes(respuesta).join("\n\n");
}

function esRespuestaMultiMensaje(respuesta = "") {
  return dividirRespuestaMensajes(respuesta).length > 1;
}

module.exports = {
  dividirRespuestaMensajes,
  esRespuestaMultiMensaje,
  respuestaParaHistorial,
  unirMensajesRespuesta,
};
