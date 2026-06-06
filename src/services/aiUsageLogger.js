function clienteParaLog(channelUserId = "") {
  if (process.env.NODE_ENV !== "production") return channelUserId || "desconocido";
  return channelUserId ? `***${channelUserId.slice(-4)}` : "desconocido";
}

function tokensUso(usage = {}) {
  return {
    prompt: usage.prompt_tokens || usage.input_tokens || 0,
    completion: usage.completion_tokens || usage.output_tokens || 0,
    total: usage.total_tokens || 0,
  };
}

function logUsoIA({
  etapa,
  channelUserId,
  cliente,
  intencion,
  modelo,
  duracionMs,
  usage,
  productosEnviados = null,
  imagenes = 0,
  audios = 0,
}) {
  if (process.env.AI_USAGE_LOGS === "false") return;

  const tokens = tokensUso(usage || {});
  console.log(
    `[AI Usage] etapa=${etapa} | cliente=${cliente?.slug || cliente?.id || "sin_cliente"} | usuario=${clienteParaLog(
      channelUserId
    )} | intencion=${intencion || "null"} | modelo=${modelo || "null"} | productosEnviados=${
      productosEnviados ?? "n/a"
    } | imagenes=${imagenes} | audios=${audios} | duracionMs=${duracionMs || 0} | tokensPrompt=${
      tokens.prompt
    } | tokensCompletion=${tokens.completion} | tokensTotal=${tokens.total}`
  );
}

function logResumenInteraccionIA({
  channelUserId,
  cliente,
  interpretacionIA = null,
  humanizerUsage = null,
}) {
  if (process.env.AI_USAGE_LOGS === "false") return;

  const interprete = tokensUso(interpretacionIA?._meta?.usage || {});
  const humanizador = tokensUso(humanizerUsage?.usage || {});
  const totalPrompt = interprete.prompt + humanizador.prompt;
  const baselineInterprete = Number(process.env.AI_TOKEN_BASELINE_INTERPRETER || 0);
  const baselineHumanizador = Number(process.env.AI_TOKEN_BASELINE_HUMANIZER || 0);
  const baselineTotal = baselineInterprete + baselineHumanizador;
  const reduccion =
    baselineTotal > 0 ? Math.max(0, ((baselineTotal - totalPrompt) / baselineTotal) * 100) : null;

  console.log(
    `[AI Usage Summary] cliente=${cliente?.slug || cliente?.id || "sin_cliente"} | usuario=${clienteParaLog(
      channelUserId
    )} | interpreterPromptTokens=${interprete.prompt} | humanizerPromptTokens=${
      humanizador.prompt
    } | humanizerSkipped=${humanizerUsage?.skipped ? "si" : "no"} | totalPromptTokens=${
      totalPrompt
    } | baselinePromptTokens=${baselineTotal || "n/a"} | reduccionPct=${
      reduccion === null ? "n/a" : reduccion.toFixed(1)
    }`
  );
}

module.exports = {
  clienteParaLog,
  logResumenInteraccionIA,
  logUsoIA,
};
