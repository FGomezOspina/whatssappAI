const { normalizar } = require('../utils/text');
const MOTIVOS = new Set(['criterio_veterinario', 'solicitud_asesor', 'producto_no_resuelto']);
function atencionHumanaActiva(estado) {
  return ['pendiente', 'en_atencion'].includes(estado.atencionHumana?.estado);
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
module.exports = { atencionHumanaActiva, motivoDerivacion, prepararDerivacion, registrarAclaracion };
