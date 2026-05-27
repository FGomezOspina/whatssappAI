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

module.exports = {
  escaparXml,
  responder,
};
