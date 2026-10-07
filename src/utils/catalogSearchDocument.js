// Campos comerciales del inventario. No incorporar source, ids o llaves como
// nombres: sirven para trazabilidad, no son evidencia de identidad.
function textosMetadata(metadata = {}) {
  metadata ||= {};
  return [metadata.nombre_original, metadata.original_name, metadata.descripcion,
    metadata.description, metadata.original_names, metadata.aliases,
    metadata.equivalent_references, metadata.keywords].flat()
    .filter(valor => typeof valor === 'string' && valor.trim());
}

function nombresPresentaciones(referencia = {}) {
  return (referencia.presentaciones || []).flatMap(p =>
    [p.nombre, p.descripcion, ...textosMetadata(p.metadata)]).filter(Boolean);
}

function textoBusquedaReferencia(referencia = {}) {
  return [referencia.nombre, referencia.descripcion, referencia.especie,
    referencia.categoria, referencia.subcategoria, referencia.etapa,
    ...(referencia.aliases || []), ...textosMetadata(referencia.metadata),
    ...nombresPresentaciones(referencia),
    ...(referencia.presentaciones || []).map(p => p.peso)].filter(Boolean).join(' ');
}

module.exports = { nombresPresentaciones, textoBusquedaReferencia };
