const express = require("express");
const {
  resolverConsultaCatalogo,
  obtenerConversacion,
  cargarProductos,
  buscarMarca,
  extraerCriterios,
  tieneCriterios,
  solicitaMarcas,
  solicitaReferencias,
  solicitaRecomendacion,
  solicitaOpinionMarca,
  extraerPresupuesto,
  solicitaCierre,
  esSaludo,
  esAgradecimiento,
} = require("./conversation/conversationEngine");
const { humanizarRespuesta } = require("./services/humanizer");
const { responder } = require("./services/twiml");

function crearApp() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));

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

    if (
      esAgradecimiento(mensaje) &&
      !tieneIntencionCatalogo &&
      !estado.carrito.length &&
      !estado.esperandoDatosDomicilio
    ) {
      responder(res, "Con mucho gusto 🐶");
      return;
    }

    const respuestaBase = resolverConsultaCatalogo(mensaje, estado, catalogo);
    const respuesta = await humanizarRespuesta(mensaje, respuestaBase);
    responder(res, respuesta);
  });

  return app;
}

module.exports = {
  crearApp,
};
