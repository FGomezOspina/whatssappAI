const { normalizar, normalizarPeso } = require('./text');

// El formato puede formar parte de la identidad; no equivale al volumen/peso.
function esDescriptorReferencia(valor, referencia) {
  const descriptor = normalizar(valor || '');
  if (!descriptor || /\d/.test(descriptor)) return false;
  if ((referencia.presentaciones || []).some(p => normalizarPeso(p.peso) === normalizarPeso(valor))) return false;
  if (/^(?:latas?|pouch|pouches?|sobres?|sachets?|bolsas?|frascos?|tarros?|envases?)$/.test(descriptor)) return true;
  return [referencia.nombre, referencia.referencia, referencia.descripcion,
    ...(referencia.metadata?.original_names || [])].filter(Boolean)
    .some(nombre => ` ${normalizar(nombre)} `.includes(` ${descriptor} `));
}

function duracionTexto(texto = '') {
  const match = normalizar(texto).match(/\b(\d+)\s*(dias?|mes(?:es)?)\b/);
  return match ? `${Number(match[1])} ${match[2].startsWith('dia') ? 'dias' : 'meses'}` : null;
}

// Leer solo la presentación elegida, no otra opción de la misma cotización.
// Incluye el formato histórico persistido antes de guardar duracion directamente.
function duracionSeleccionada(item = {}) {
  const peso = normalizarPeso(item.presentacion || item.peso || '');
  const referencia = normalizar(item.referenciaCatalogo || item.referencia || '');
  const presentaciones = peso ? (item.presentaciones || []).filter(p =>
    normalizarPeso(p.peso) === peso &&
    (!p.referenciaCatalogo && !p.referencia ||
      normalizar(p.referenciaCatalogo || p.referencia) === referencia)) : [];
  const valores = [...new Set([item.duracion, item.metadata?.duracion,
    ...presentaciones.map(p => p.metadata?.duracion)].map(duracionTexto).filter(Boolean))];
  return valores.length === 1 ? valores[0] : null;
}

function mismaSeleccionCotizada(solicitud = {}, cotizacion = {}) {
  return normalizar(solicitud.marca || '') === normalizar(cotizacion.marca || '') &&
    normalizar(solicitud.referenciaCatalogo || solicitud.referencia || '') ===
      normalizar(cotizacion.referenciaCatalogo || cotizacion.referencia || '') &&
    Boolean(solicitud.presentacion || solicitud.peso) &&
    normalizarPeso(solicitud.presentacion || solicitud.peso) === normalizarPeso(cotizacion.presentacion || cotizacion.peso || '');
}

function consultaProductoCotizado(item = {}) {
  return [item.marca, item.referenciaCatalogo || item.referencia,
    item.presentacion || item.peso, duracionSeleccionada(item)].filter(Boolean).join(' ');
}

module.exports = { esDescriptorReferencia, duracionTexto, duracionSeleccionada,
  mismaSeleccionCotizada, consultaProductoCotizado };
