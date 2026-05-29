const express = require("express");
const {
  resolverConsultaCatalogo,
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
const {
  obtenerConversacionPersistida,
  guardarConversacionPersistida,
} = require("./conversation/conversationStore");
const { obtenerEjemplosEntrenamiento } = require("./repositories/trainingExampleRepository");
const { interpretarMensajeCliente } = require("./services/aiInterpreter");
const { humanizarRespuesta } = require("./services/humanizer");
const { asegurarRespuestaCatalogo } = require("./services/responseGuard");
const { responder } = require("./services/twiml");

function crearApp() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));

  app.post("/whatsapp", async (req, res) => {
    const mensaje = (req.body.Body || "").trim();
    const usuario = req.body.From || "anonimo";
    const estado = await obtenerConversacionPersistida(usuario);
    const catalogo = cargarProductos();

    console.log("Mensaje recibido:", mensaje);

    const responderYGuardar = async (respuestaFinal) => {
      await guardarConversacionPersistida(usuario, estado, {
        mensaje,
        respuesta: respuestaFinal,
      });
      responder(res, respuestaFinal);
    };

    if (!mensaje) {
      await responderYGuardar("Cuéntame qué necesitas para tu mascota 🐶");
      return;
    }

    const ejemplosEntrenamiento = await obtenerEjemplosEntrenamiento(mensaje, 8);
    const interpretacionIA = await interpretarMensajeCliente({
      mensaje,
      estado,
      catalogo,
      ejemplosEntrenamiento,
    });

    const tieneIntencionCatalogo =
      buscarMarca(catalogo, mensaje) ||
      tieneCriterios(extraerCriterios(mensaje)) ||
      solicitaMarcas(mensaje) ||
      solicitaReferencias(mensaje) ||
      solicitaRecomendacion(mensaje) ||
      solicitaOpinionMarca(mensaje) ||
      extraerPresupuesto(mensaje) ||
      solicitaCierre(mensaje) ||
      ["pedido_producto", "consulta_producto", "consulta_marcas", "recomendacion", "datos_envio", "metodo_pago"].includes(
        interpretacionIA?.intencion
      );

    if (esSaludo(mensaje) && !tieneIntencionCatalogo && !(estado.pedidoConfirmado && estado.carrito.length)) {
      await responderYGuardar("¡Hola! Bienvenido 🐶 ¿Qué necesitas para tu mascota hoy?");
      return;
    }

    if (
      esAgradecimiento(mensaje) &&
      !tieneIntencionCatalogo &&
      !estado.carrito.length &&
      !estado.esperandoDatosDomicilio
    ) {
      await responderYGuardar("Con mucho gusto 🐶");
      return;
    }

    const respuestaBase = resolverConsultaCatalogo(mensaje, estado, catalogo, interpretacionIA);
    const respuestaHumanizada = await humanizarRespuesta(mensaje, respuestaBase, {
      ejemplosEntrenamiento,
      estado,
      interpretacionIA,
    });
    const respuesta = asegurarRespuestaCatalogo(mensaje, respuestaHumanizada, { catalogo, interpretacionIA });
    await responderYGuardar(respuesta);
  });

  return app;
}

module.exports = {
  crearApp,
};
