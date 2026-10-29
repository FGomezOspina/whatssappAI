const { normalizar } = require('../utils/text');
const MOTIVOS = new Set(['criterio_veterinario', 'solicitud_asesor']);
function reanudarPendienteComercial(estado) {
  const anterior = estado.atencionHumana;
  // Historical automatic commercial queues no longer pause the bot. A person
  // already attending, or an explicit human request, always retains control.
  if (anterior?.estado !== 'pendiente' || anterior.motivo !== 'producto_no_resuelto') return false;
  estado.atencionHumana = anterior.consultaClinicaPendiente || {
    ...anterior, estado: 'cerrada', cerradaEn: new Date().toISOString(),
    motivoCierre: 'continuidad_comercial',
  };
  return true;
}
function respuestaIncertidumbreComercial() {
  return 'Con la información disponible todavía no puedo confirmar esa referencia en el catálogo. No he agregado un producto distinto. Si consigues el nombre completo o una foto del empaque, puedo revisarlo; también puedes consultar otra referencia.';
}
function atencionHumanaActiva(estado) {
  return ['pendiente', 'en_atencion'].includes(estado.atencionHumana?.estado);
}
function consultaClinicaPendiente(estado) {
  return estado.atencionHumana?.estado === 'pendiente' &&
    estado.atencionHumana.motivo === 'criterio_veterinario';
}
function pausaAutomaticaActiva(estado) {
  return atencionHumanaActiva(estado) && !consultaClinicaPendiente(estado);
}
function permiteSolicitudComercialMixta(decision) {
  return motivoDerivacion(decision) === 'criterio_veterinario' &&
    decision.solicitudComercialIndependiente === true &&
    (decision.consultaCatalogo?.necesaria === true || decision.continuarFlujo === true);
}
const AVISO_CLINICO = 'La orientación clínica sigue pendiente de un asesor; puedo ayudarte con la información comercial y tu pedido.';
function agregarAvisoClinico(respuesta, aviso) {
  return aviso && typeof respuesta === 'string' && respuesta.trim() && !respuesta.includes(AVISO_CLINICO)
    ? `${respuesta}\n\n${AVISO_CLINICO}` : respuesta;
}
function motivoDerivacion(decision) {
  const motivo = decision?.derivacionHumana?.motivo;
  return decision?.derivacionHumana?.necesaria === true &&
    ['criterio_veterinario', 'solicitud_asesor'].includes(motivo) ? motivo : null;
}
function prepararDerivacion(estado, motivo) {
  if (!MOTIVOS.has(motivo)) throw new Error('Motivo de atención no válido');
  if (!atencionHumanaActiva(estado)) estado.atencionHumana = {
    estado: 'pendiente', motivo, solicitadaEn: new Date().toISOString(),
  };
  else if (consultaClinicaPendiente(estado) && motivo !== 'criterio_veterinario') {
    // Una petición explícita de operador vuelve a pausar todo el bot. Conservar
    // la consulta clínica anterior, sin declararla resuelta ni asignada.
    estado.atencionHumana = { estado: 'pendiente', motivo, solicitadaEn: new Date().toISOString(),
      consultaClinicaPendiente: { ...estado.atencionHumana } };
  }
  return motivo === 'criterio_veterinario'
    ? 'Para orientarte sobre diagnóstico o tratamiento se necesita criterio veterinario. Dejo tu consulta pendiente de un asesor para que te ayude con la orientación especializada.'
    : 'Dejo tu consulta pendiente de un asesor para que pueda ayudarte a confirmar la referencia. Conservo lo que hemos conversado.';
}
// The semantic router determines whether this is the same unresolved request.
// Technical errors must never enter this function as evidence of absence.
function registrarAclaracion(estado, { mensaje, decision, validacion }) {
  const anterior = estado.aclaracionIdentidad;
  const consulta = normalizar(mensaje).slice(0, 500);
  const seguimiento = decision?.seguimientoProducto;
  const misma = anterior && seguimiento !== 'nueva' &&
    (['aclaracion', 'sin_resolver'].includes(seguimiento) || anterior.consulta === consulta);
  const campo = validacion?.aclaracion?.campo || null;
  const progreso = misma && campo && campo !== anterior.campo;
  const intentos = misma ? anterior.intentos + 1 : 1;
  estado.aclaracionIdentidad = { consulta, campo, intentos };
  return Boolean(misma && (!progreso || intentos >= 3));
}
module.exports = { atencionHumanaActiva, consultaClinicaPendiente, pausaAutomaticaActiva,
  reanudarPendienteComercial, respuestaIncertidumbreComercial,
  permiteSolicitudComercialMixta, agregarAvisoClinico, AVISO_CLINICO,
  motivoDerivacion, prepararDerivacion, registrarAclaracion };
