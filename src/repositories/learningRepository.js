const { createHash } = require('node:crypto');
const { requestSupabase, supabaseConfigurado } = require('./supabaseClient');
const TABLE = process.env.SUPABASE_TRAINING_EXAMPLES_TABLE || 'training_examples';
const ORIGIN = 'learning:v1';
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
function scope(clientId) {
  if (!uuid(clientId)) throw Error('Se requiere client_id UUID válido');
  return `client_id=eq.${clientId}&tags=cs.${encodeURIComponent(`{${ORIGIN}}`)}`;
}
function redactar(texto, datos = {}) {
  let value = String(texto || '');
  for (const dato of Object.values(datos).filter(v => typeof v === 'string' && v.trim().length >= 3)) {
    value = value.replace(new RegExp(dato.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[dato omitido]');
  }
  return value.replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, '[correo omitido]')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '[enlace omitido]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[identificador omitido]')
    .replace(/\b(?:calle|carrera|cra|cl|avenida|direccion|dirección|cedula|cédula|correo|celular)\b[^\n]*/gi, '[dato omitido]')
    .slice(0, 2000);
}
function construirCandidato(estado, metadatos) {
  if (!uuid(metadatos.cliente?.id)) return null;
  const lectura = estado._interpretacionTurno;
  if (!lectura) return null;
  const productos = lectura.productos?.length ? lectura.productos : lectura.producto ? [lectura.producto] : [];
  const pendientes = productos.some(p => p.estado === 'pendiente') || Boolean(estado.ultimaConsultaProducto?.aclaracion);
  const correccion = /\b(no es|me refiero|quise decir|corrijo|te dije|ya te|era el|era la)\b/i.test(metadatos.mensaje || '');
  if (!pendientes && !correccion && productos.length < 2) return null;
  const turnId = estado._turnoEntrante?.turnId || metadatos.idsEventos?.join('|');
  if (!turnId) return null;
  const datos = estado.datosDomicilio || {};
  // Solo campos de producto: nunca copiar respuestas, carrito, contacto o precios.
  const resumen = productos.slice(0, 20).map(p => Object.fromEntries(
    ['mencionOriginal', 'textoVisible', 'marca', 'referencia', 'presentacion', 'cantidad', 'especie', 'estado']
      .filter(k => p[k] != null).map(k => [k, typeof p[k] === 'number' ? p[k] : redactar(p[k], datos)])));
  if (!resumen.length) return null;
  const id = createHash('sha256').update(JSON.stringify([ORIGIN, metadatos.cliente.id, turnId])).digest('hex')
    .slice(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  return { id, client_id: metadatos.cliente.id, intent: lectura.intencion || 'revision',
    customer_message: JSON.stringify(resumen), ideal_response: 'Pendiente de revisión humana. No utilizar como ejemplo.',
    notes: JSON.stringify({ version: 1, motivo: correccion ? 'correccion' : pendientes ? 'producto_pendiente' : 'solicitud_multiple',
      accionObservada: lectura.accion || null }),
    tags: [ORIGIN, 'learning:pending'], active: false, priority: 0 };
}
async function capturarAprendizaje(estado, metadatos) {
  if (process.env.LEARNING_CAPTURE_ENABLED === 'false' || !supabaseConfigurado()) return;
  try {
    const candidato = construirCandidato(estado, metadatos);
    if (!candidato) return;
    // Reintentar un evento nunca sobrescribe una aprobación o un rechazo.
    await requestSupabase(`${TABLE}?on_conflict=id`, { method: 'POST',
      signal: AbortSignal.timeout(1500),
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(candidato) });
  } catch { console.error('[Learning] No se pudo guardar el candidato; la respuesta y el pedido se conservan.'); }
}
async function listarCandidatos(clientId, estado = 'pending') {
  if (!['pending', 'approved', 'rejected', 'revoked'].includes(estado)) throw Error('Estado inválido');
  return requestSupabase(`${TABLE}?${scope(clientId)}&tags=cs.${encodeURIComponent(`{learning:${estado}}`)}&select=id,intent,customer_message,ideal_response,notes,tags,active,updated_at&order=updated_at.desc&limit=100`);
}
async function revisarCandidato(clientId, id, accion, revision = {}) {
  if (!uuid(id) || !['approve', 'reject', 'revoke'].includes(accion)) throw Error('Revisión inválida');
  const query = `${TABLE}?${scope(clientId)}&id=eq.${id}`;
  const [actual] = await requestSupabase(`${query}&select=*`) || [];
  if (!actual) throw Error('Candidato no encontrado para esta empresa');
  const estado = accion === 'approve' ? 'approved' : accion === 'reject' ? 'rejected' : 'revoked';
  const payload = { active: accion === 'approve', tags: [ORIGIN, `learning:${estado}`], priority: 0 };
  if (accion === 'approve') {
    for (const campo of ['customer_message', 'ideal_response', 'notes', 'reviewed_by']) {
      if (typeof revision[campo] !== 'string' || !revision[campo].trim() || revision[campo].length > 2000) throw Error(`Revisión requiere ${campo} (1–2000 caracteres)`);
    }
    for (const campo of ['customer_message', 'ideal_response', 'notes']) {
      if (redactar(revision[campo]) !== revision[campo] || /\$\s*\d|\b\d[\d.,]*\s*(?:pesos|COP)\b/i.test(revision[campo])) throw Error('Anonimiza el ejemplo y retira precios antes de aprobar');
    }
    Object.assign(payload, { customer_message: revision.customer_message, ideal_response: revision.ideal_response,
      notes: JSON.stringify({ criterio: revision.notes, reviewedBy: revision.reviewed_by, reviewedAt: new Date().toISOString() }) });
  } else payload.notes = JSON.stringify({ anterior: actual.notes, motivo: revision.reason || accion, reviewedAt: new Date().toISOString() });
  return requestSupabase(query + `&updated_at=eq.${encodeURIComponent(actual.updated_at)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload),
  }).then(rows => { if (!rows?.length) throw Error('El candidato cambió durante la revisión; vuelve a consultarlo'); return rows; });
}
module.exports = { capturarAprendizaje, listarCandidatos, revisarCandidato, construirCandidato, redactar };
