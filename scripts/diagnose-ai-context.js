require("dotenv").config({ quiet: true });

const { crearEstadoInicial } = require("../src/conversation/conversationStore");
const { cargarCatalogoCliente } = require("../src/repositories/productRepository");
const { interpretarMensajeCliente } = require("../src/services/aiInterpreter");
const {
  construirSolicitudInterprete,
} = require("../src/services/aiContextOptimizer");
const { seleccionarCatalogoParaIA } = require("../src/services/catalogContextService");
const { obtenerClienteActual } = require("../src/services/clients.service");
const { humanizarRespuesta } = require("../src/services/humanizer");
const { clasificarInteraccion } = require("../src/services/interactionClassifier");
const { modeloHumanizador, modeloInterprete } = require("../src/services/modelRouter");
const {
  aplicarCoincidenciaValidada,
  respuestaValidacionProducto,
  validarCoincidenciaProducto,
} = require("../src/services/productMatchValidator");
const { obtenerVerticalCliente } = require("../src/verticals");

function argumentos() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const mensaje = args.filter((item) => item !== "--live").join(" ").trim();
  return {
    live,
    mensaje: mensaje || "tienes br adulto r pequena?",
  };
}

function promptTokens(usage = {}) {
  return usage.prompt_tokens || usage.input_tokens || 0;
}

async function diagnosticar() {
  const { mensaje, live } = argumentos();
  const evento = { phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID };
  const cliente = await obtenerClienteActual(evento);
  const vertical = obtenerVerticalCliente(cliente);
  const estado = crearEstadoInicial();
  const catalogo = await cargarCatalogoCliente(cliente);
  const clasificacion = clasificarInteraccion({ mensaje, estado });
  const catalogoIA = await seleccionarCatalogoParaIA({
    catalogo,
    mensaje,
    estado,
    clasificacion,
    cliente,
  });
  const interpreterModel = modeloInterprete(clasificacion);
  const solicitud = construirSolicitudInterprete({
    mensaje,
    estado,
    catalogo: catalogoIA.catalogo,
    clasificacion,
    cliente,
    vertical,
    model: interpreterModel,
  });
  const resultado = {
    mensaje,
    cliente: cliente.slug,
    perfil: clasificacion.perfilContexto,
    productos: catalogoIA.metadata,
    interpreterModel,
    interpreterEstimated: solicitud.diagnostico,
    live,
  };
  const validacionPrevia = validarCoincidenciaProducto({
    mensaje,
    catalogo,
    catalogoCandidatos: catalogoIA.catalogo,
    clasificacion,
  });
  resultado.catalogMatch = validacionPrevia;

  if (["media", "baja"].includes(validacionPrevia.nivel)) {
    resultado.actual = {
      interpreterPromptTokens: 0,
      humanizerPromptTokens: 0,
      humanizerSkipped: true,
      totalPromptTokens: 0,
      baselinePromptTokens:
        Number(process.env.AI_TOKEN_BASELINE_INTERPRETER || 0) +
          Number(process.env.AI_TOKEN_BASELINE_HUMANIZER || 0) || null,
      reductionPct: 100,
      skippedOpenAI: true,
      respuesta: respuestaValidacionProducto(validacionPrevia),
    };
    console.log(JSON.stringify(resultado, null, 2));
    return;
  }

  if (
    ["consulta_generica", "consulta_categoria"].includes(validacionPrevia.razon) &&
    !clasificacion.requiereVision
  ) {
    const respuesta = vertical.orderLogic.resolverConsultaCatalogo(
      mensaje,
      estado,
      catalogo,
      null
    );
    resultado.actual = {
      interpreterPromptTokens: 0,
      humanizerPromptTokens: 0,
      humanizerSkipped: true,
      totalPromptTokens: 0,
      skippedOpenAI: true,
      skipReason: validacionPrevia.razon,
      respuesta,
    };
    console.log(JSON.stringify(resultado, null, 2));
    return;
  }

  if (live) {
    let interpretacion = await interpretarMensajeCliente({
      mensaje,
      estado,
      catalogo: catalogoIA.catalogo,
      cliente,
      vertical,
      clasificacion,
      model: interpreterModel,
      catalogoMetadata: catalogoIA.metadata,
      channelUserId: "diagnostico",
    });
    const validacionFinal = validarCoincidenciaProducto({
      mensaje,
      interpretacion,
      catalogo,
      catalogoCandidatos: catalogoIA.catalogo,
      clasificacion,
    });
    resultado.catalogMatchFinal = validacionFinal;
    if (["media", "baja"].includes(validacionFinal.nivel)) {
      const interpreterPromptTokens = promptTokens(interpretacion?._meta?.usage);
      resultado.actual = {
        interpreterPromptTokens,
        humanizerPromptTokens: 0,
        humanizerSkipped: true,
        totalPromptTokens: interpreterPromptTokens,
        skippedHumanizer: true,
        respuesta: respuestaValidacionProducto(validacionFinal),
      };
      console.log(JSON.stringify(resultado, null, 2));
      return;
    }
    interpretacion = aplicarCoincidenciaValidada(interpretacion, validacionFinal);
    const respuestaBase = vertical.orderLogic.resolverConsultaCatalogo(
      mensaje,
      estado,
      catalogo,
      interpretacion
    );
    let humanizerUsage = { skipped: true };
    const respuesta = await humanizarRespuesta(mensaje, respuestaBase, {
      estado,
      interpretacionIA: interpretacion,
      cliente,
      vertical,
      clasificacion,
      model: modeloHumanizador(clasificacion),
      channelUserId: "diagnostico",
      onUsage: (usage) => {
        humanizerUsage = usage;
      },
    });
    const interpreterPromptTokens = promptTokens(interpretacion?._meta?.usage);
    const humanizerPromptTokens = promptTokens(humanizerUsage.usage);
    const baseline =
      Number(process.env.AI_TOKEN_BASELINE_INTERPRETER || 0) +
      Number(process.env.AI_TOKEN_BASELINE_HUMANIZER || 0);
    const total = interpreterPromptTokens + humanizerPromptTokens;

    resultado.actual = {
      interpreterPromptTokens,
      humanizerPromptTokens,
      humanizerSkipped: Boolean(humanizerUsage.skipped),
      totalPromptTokens: total,
      baselinePromptTokens: baseline || null,
      reductionPct: baseline > 0 ? Number((((baseline - total) / baseline) * 100).toFixed(1)) : null,
      respuesta,
    };
  }

  console.log(JSON.stringify(resultado, null, 2));
}

diagnosticar().catch((error) => {
  console.error(`[AI Diagnose] ${error.message}`);
  process.exitCode = 1;
});
