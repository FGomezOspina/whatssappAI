const { normalizar, normalizarPeso } = require('../utils/text');
const { duracionSeleccionada, mismaSeleccionCotizada } = require('../utils/catalogVariants');

const clave = p => [p.marca, p.referenciaCatalogo || p.referencia, duracionSeleccionada(p)]
  .map(v => normalizar(v || '')).join(':');
const cotizable = p => p.marca && p.referencia && (p.peso || p.presentacion) &&
  p.stock !== false && p.precio != null && Number.isFinite(Number(p.precio)) && Number(p.precio) >= 0;
const pertenece = (seleccion, item) => clave(seleccion) === clave(item) ||
  (seleccion.cotizacion || []).some(c => mismaSeleccionCotizada(c, item) &&
    duracionSeleccionada(c) === duracionSeleccionada(item));

// This is purchase state, not a cache of search results. Its lifetime is the
// conversation/order, not a number of messages or an elapsed-time window.
function recordarSeleccion(estado, solicitud) {
  if (!solicitud?.marca || !solicitud.referencia) return;
  const memoria = estado.seleccionesProducto ||= [];
  const indice = memoria.findIndex(p => clave(p) === clave(solicitud));
  const cotizacion = [...new Map((solicitud.cotizacion || []).filter(cotizable)
    .map(p => [`${clave(p)}:${normalizarPeso(p.peso || p.presentacion)}`, p])).values()];
  const resuelta = cotizacion.length === 1 || (cotizacion.length > 0 &&
    solicitud.seleccionPresentaciones?.tipo === 'peso' && !solicitud.seleccionPresentaciones.pendientes?.length);
  const registro = { ...solicitud, cotizacion,
    estado: solicitud.estado === 'descartado' ? 'descartado' : resuelta ? 'cotizado' : 'pendiente' };
  if (indice < 0) memoria.push(registro);
  else memoria[indice] = registro;
}

function sincronizarSelecciones(estado) {
  if (!Array.isArray(estado.seleccionesProducto)) {
    estado.seleccionesProducto = [];
    // Migration of existing conversations: only validated quotes, never raw
    // mentions or retrieval candidates. Preserve unresolved alternatives.
    for (const p of estado.ultimaSolicitudProductos || []) recordarSeleccion(estado, p);
    const grupos = new Map();
    for (const p of estado.productosConsultados || []) {
      if (!cotizable(p) || p.pendiente) continue;
      if (!grupos.has(clave(p))) grupos.set(clave(p), { ...p, cotizacion: [] });
      grupos.get(clave(p)).cotizacion.push(p);
    }
    for (const p of grupos.values()) {
      if (!estado.seleccionesProducto.some(s => clave(s) === clave(p))) recordarSeleccion(estado, p);
    }
  }
  const carrito = estado.carrito || [];
  for (const p of estado.seleccionesProducto) {
    const comprados = carrito.filter(c => pertenece(p, c));
    if (comprados.length) {
      const pendientes = p.seleccionPresentaciones?.tipo === 'peso'
        ? p.cotizacion.filter(c => !c.seleccionado && !comprados.some(item => mismaSeleccionCotizada(c, item))) : [];
      p.estado = estado.pedidoConfirmado ? 'confirmado' : pendientes.length ? 'cotizado' : 'seleccionado';
      p.cotizacion = [...pendientes, ...comprados.map(c => ({ ...c, seleccionado: true }))];
    } else if (p.estado === 'seleccionado') p.estado = 'descartado';
    else if (p.estado === 'cotizado' && p.seleccionPresentaciones?.tipo === 'peso') {
      p.cotizacion = p.cotizacion.filter(c => !c.seleccionado);
      if (!p.cotizacion.length) p.estado = 'descartado';
    }
    if (estado.pedidoConfirmado && !comprados.length && p.estado !== 'confirmado') p.estado = 'descartado';
  }
  for (const p of carrito) {
    if (estado.seleccionesProducto.some(s => pertenece(s, p))) continue;
    estado.seleccionesProducto.push({ ...p, cotizacion: [{ ...p }],
      estado: estado.pedidoConfirmado ? 'confirmado' : 'seleccionado' });
  }
}

function actualizarSeleccionCotizada(estado, antes, despues) {
  for (const p of estado.seleccionesProducto || []) {
    if (!antes.some(c => pertenece(p, c))) continue;
    const restantes = despues.filter(c => pertenece(p, c));
    p.cotizacion = restantes;
    p.estado = restantes.length ? 'cotizado' : 'descartado';
  }
}

function resolverCompraContextual(mensaje, decision, estado) {
  if (estado.pedidoConfirmado) return null;
  const texto = normalizar(mensaje).replace(/\bpor favor\b/g, '').replace(/[.!?,¿¡]/g, '').replace(/\s+/g, ' ').trim();
  // The semantic router handles free phrasing. Exact standalone acceptances
  // are also supported without relying on the model repeating product names.
  const plural = /^(?:(?:si )?(?:me )?(?:los|las) (?:envias|envia|envies|mandas|manda|mandes)|(?:mandame|enviame) (?:esos|esas)(?: productos)?|quiero (?:los dos|ambos)|agregalos|agregalas)$/.test(texto);
  const singular = /^(?:(?:si )?(?:me )?(?:lo|la) (?:envias|envia|envies|mandas|manda|mandes)|(?:mandame|enviame) (?:ese|esa)|agregalo|agregala)$/.test(texto);
  const conjuntoInterpretado = singular && decision.productos?.length > 1 && decision.accion === 'agregar';
  const alcance = plural || conjuntoInterpretado ? 'conjunto' : singular ? 'foco' : decision.compraContextual;
  if (!['conjunto', 'foco', 'anterior'].includes(alcance) ||
      (!plural && !singular && (decision.accion !== 'agregar' ||
        ['quitar', 'mantener_solo', 'modificar_cantidad', 'conflicto'].includes(decision.carrito?.operacion)))) return null;
  sincronizarSelecciones(estado);
  if ((estado.ultimaSolicitudProductos || []).some(p => p.estado === 'pendiente' &&
      !estado.seleccionesProducto.some(s => s.estado === 'seleccionado' && pertenece(s, p)))) return null;
  let selecciones = estado.seleccionesProducto.filter(p => !['descartado', 'confirmado'].includes(p.estado));
  if (conjuntoInterpretado) selecciones = selecciones.filter(p => decision.productos.some(d => clave(d) === clave(p)));
  if (alcance !== 'conjunto') {
    const foco = estado.ultimaSeleccion;
    const indice = foco ? selecciones.findIndex(p => clave(p) === clave(foco)) : selecciones.length - 1;
    selecciones = [selecciones[alcance === 'anterior' ? indice - 1 : indice]].filter(Boolean);
  }
  if (!selecciones.length || selecciones.some(p => p.estado === 'pendiente') ||
      (/\b(los dos|ambos)\b/.test(texto) && selecciones.length !== 2)) return null;
  const productos = selecciones.flatMap(p => p.cotizacion.map(c => ({ ...p, ...c,
    presentacion: c.peso || c.presentacion, cantidad: c.cantidad || 1, accion: 'agregar',
    intencionPresentaciones: 'especifica', seleccionPresentaciones: undefined,
    observado: undefined, solicitud: undefined, _identidadPendiente: true,
  })));
  // Accepting the same set again does not request additional units.
  return productos.filter(p => !(estado.carrito || []).some(c => mismaSeleccionCotizada(p, c) &&
    duracionSeleccionada(p) === duracionSeleccionada(c)));
}

module.exports = { recordarSeleccion, sincronizarSelecciones, actualizarSeleccionCotizada, resolverCompraContextual };
