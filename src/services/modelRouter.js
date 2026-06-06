function modeloInterprete(clasificacion = {}) {
  if (clasificacion.requiereVision) {
    return (
      process.env.OPENAI_VISION_MODEL ||
      process.env.OPENAI_INTERPRETER_MODEL_COMPLEX ||
      process.env.OPENAI_INTERPRETER_MODEL ||
      process.env.OPENAI_MODEL ||
      "gpt-4.1"
    );
  }

  if (clasificacion.complejidad === "simple") {
    return process.env.OPENAI_INTERPRETER_MODEL_SIMPLE || process.env.OPENAI_INTERPRETER_MODEL || process.env.OPENAI_MODEL || "gpt-5.2";
  }

  if (clasificacion.complejidad === "compleja" || clasificacion.complejidad === "avanzada") {
    return (
      process.env.OPENAI_INTERPRETER_MODEL_COMPLEX ||
      process.env.OPENAI_INTERPRETER_MODEL ||
      process.env.OPENAI_MODEL ||
      "gpt-5.2"
    );
  }

  return process.env.OPENAI_INTERPRETER_MODEL || process.env.OPENAI_MODEL || "gpt-5.2";
}

function modeloHumanizador(clasificacion = {}) {
  if (clasificacion.complejidad === "simple") {
    return process.env.OPENAI_HUMANIZER_MODEL_SIMPLE || process.env.OPENAI_MODEL || "gpt-5.2-chat-latest";
  }

  if (clasificacion.complejidad === "compleja" || clasificacion.complejidad === "avanzada") {
    return process.env.OPENAI_HUMANIZER_MODEL_COMPLEX || process.env.OPENAI_MODEL || "gpt-5.2-chat-latest";
  }

  return process.env.OPENAI_HUMANIZER_MODEL || process.env.OPENAI_MODEL || "gpt-5.2-chat-latest";
}

module.exports = {
  modeloInterprete,
  modeloHumanizador,
};
