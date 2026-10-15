const { normalizar, normalizarPeso } = require('../utils/text');
const { consultaProductoCotizado, duracionSeleccionada } = require('../utils/catalogVariants');

// Resolve a purchase against products already identified and quoted in this
// conversation. This does not search the catalog or identify new products.
function completarCompraDesdeCotizaciones(decision, estado) {
  if (!decision || estado.pedidoConfirmado ||
      ['quitar', 'mantener_solo', 'modificar_cantidad', 'conflicto'].includes(decision.carrito?.operacion)) return decision;
  const solicitudes = estado.ultimaSolicitudProductos || [];
  let recuperadas = 0;
  const completar = producto => {
    if (!producto || (producto.accion || decision.accion) !== 'agregar' ||
        !(producto.marca || producto.referencia)) return producto;
    const opciones = solicitudes.flatMap(previa => {
      if (previa.accion !== 'consultar' || !previa.cotizacion?.length ||
          (previa.contextoCreadoEn && Date.now() - Date.parse(previa.contextoCreadoEn) > 30 * 60 * 1000)) return [];
      const marca = normalizar(previa.marca);
      const nombres = [previa.referencia, ...(previa.referenciasEquivalentes || []),
        ...previa.cotizacion.map(p => p.referencia)].map(normalizar);
      if (producto.marca && normalizar(producto.marca) !== marca) return [];
      // A brand-only target is sufficient only when its quoted SKU is unique.
      // A different explicit reference/attribute never inherits this selection.
      if (producto.referencia && !nombres.includes(normalizar(producto.referencia)) &&
          normalizar(producto.referencia) !== marca) return [];
      if (['especie', 'etapa', 'tamano', 'linea'].some(campo => producto[campo] && previa[campo] &&
          normalizar(producto[campo]) !== normalizar(previa[campo]))) return [];
      if (['sabores', 'condiciones'].some(campo => producto[campo]?.length &&
          !producto[campo].every(v => (previa[campo] || []).some(p => normalizar(p) === normalizar(v))))) return [];
      return previa.cotizacion.filter(item => {
        if (item.stock === false || item.precio == null || !Number.isFinite(Number(item.precio))) return false;
        if (producto.presentacion && normalizarPeso(producto.presentacion) !== normalizarPeso(item.peso || item.presentacion)) return false;
        if (producto.duracion && normalizar(producto.duracion) !== normalizar(duracionSeleccionada(item) || '')) return false;
        // New body-weight information must go through presentation selection.
        if (producto.mascotas?.length && !producto.mascotas.every(m =>
          (item.mascotas || previa.mascotas || []).some(p => p.nombre === m.nombre && p.pesoKg === m.pesoKg))) return false;
        return true;
      }).map(item => ({ previa, item }));
    });
    const unicas = [...new Map(opciones.map(opcion => {
      const p = opcion.item;
      return [`${p.marca}:${p.referencia}:${normalizarPeso(p.peso || p.presentacion)}:${duracionSeleccionada(p) || ''}`, opcion];
    })).values()];
    if (unicas.length !== 1) return producto;
    const { previa, item } = unicas[0];
    const atributos = Object.fromEntries(['especie', 'categoria', 'subcategoria', 'etapa', 'tamano', 'linea', 'sabores', 'condiciones']
      .filter(campo => previa[campo] != null).map(campo => [campo, previa[campo]]));
    recuperadas++;
    return { ...atributos, ...Object.fromEntries(Object.entries(producto).filter(([, v]) => v != null &&
      (!Array.isArray(v) || v.length))),
      marca: item.marca, referencia: item.referenciaCatalogo || item.referencia,
      presentacion: item.peso || item.presentacion, duracion: duracionSeleccionada(item),
      cantidad: producto.cantidad || item.cantidad || previa.cantidad || 1,
      // A quoted selection is now a purchase, not another alternatives request.
      intencionPresentaciones: 'especifica', seleccionPresentaciones: undefined,
      _identidadPendiente: true,
    };
  };
  const multiples = decision.productos?.length > 1;
  const productos = multiples ? decision.productos.map(completar) : [];
  const producto = multiples ? decision.producto : completar(decision.producto || decision.productos?.[0]);
  if (!recuperadas) return decision;
  const pedidos = multiples ? productos : [producto];
  return { ...decision, producto, productos: multiples ? productos : decision.productos?.length ? [producto] : [],
    consultaCatalogo: { necesaria: true, consulta: pedidos.map(p => p._identidadPendiente
      ? consultaProductoCotizado(p) : [p.textoVisible || p.referencia || p.marca, p.presentacion].filter(Boolean).join(' ')).join('; ') },
  };
}

module.exports = { completarCompraDesdeCotizaciones };
