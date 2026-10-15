// Instrumentación temporal, desactivada por defecto. No registra imágenes,
// URLs firmadas, direcciones, datos de pago ni credenciales.
const { createHash } = require('node:crypto');
const { contexto } = require('./pipelineTelemetry');
const huella = valor => createHash('sha256').update(typeof valor === 'string' ? valor : JSON.stringify(valor ?? null)).digest('hex').slice(0, 16);
function producto(p) {
  if (!p) return null;
  return Object.fromEntries(['marca', 'referencia', 'linea', 'categoria', 'especie', 'etapa', 'tamano', 'sabores', 'presentacion',
    'cantidad', 'observado', 'solicitud', 'fuentePresentacion', 'requierePresentacion', '_imagenSinLectura', '_imagenErrorTecnico'].filter(k => p[k] !== undefined).map(k => [k, p[k]]));
}
function lectura(v) {
  return v && { intencion: v.intencion, accion: v.accion, producto: producto(v.producto), productos: v.productos?.map(producto),
    consultaCatalogo: v.consultaCatalogo };
}
function trazar(etapa, datos) {
  if (process.env.PRODUCT_RECOGNITION_TRACE !== 'true') return;
  console.log('[PRODUCT_TRACE] ' + JSON.stringify({ run: contexto.getStore()?.run || null, etapa, ...datos }));
}
module.exports = { trazar, lectura, producto, huella };
