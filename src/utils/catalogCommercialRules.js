const { normalizar, normalizarPeso } = require('./text');

function especiesReferencia(referencia = {}) {
  const declaradas = referencia.metadata?.especies;
  if (Array.isArray(declaradas) && declaradas.length) return [...new Set(declaradas.map(normalizar))];
  const texto = normalizar(referencia.especie || '');
  const especies = [];
  if (/\b(?:perros?|dogs?|canin[oa]s?|canine)\b/.test(texto)) especies.push('perro');
  if (/\b(?:gatos?|cats?|felin[oa]s?|feline)\b/.test(texto)) especies.push('gato');
  return especies.length ? especies : texto ? [texto] : [];
}

function admiteEspecie(referencia, especie) {
  return especiesReferencia(referencia).includes(normalizar(especie));
}

function reglasPrecio(presentacion = {}) {
  const reglas = presentacion.metadata?.precios_por_cantidad || presentacion.preciosPorCantidad || [];
  return (Array.isArray(reglas) ? reglas : []).filter(r =>
    Number.isInteger(r.desde) && r.desde > 0 && Number.isFinite(r.precio) && r.precio >= 0
  ).map(r => ({ desde: r.desde, precio: r.precio })).sort((a, b) => a.desde - b.desde);
}

function precioPorCantidad(presentacion, cantidad = 1) {
  let precio = presentacion.precioBase ?? presentacion.precio;
  for (const regla of reglasPrecio(presentacion)) {
    if (cantidad >= regla.desde) precio = regla.precio;
  }
  return precio;
}

function datosPrecio(presentacion) {
  const reglas = reglasPrecio(presentacion);
  return reglas.length ? { precioBase: presentacion.precioBase ?? presentacion.precio, preciosPorCantidad: reglas } : {};
}

function actualizarPrecioItem(item) {
  item.precio = precioPorCantidad(item, item.cantidad);
  return item;
}

// Solo convertir empaques solicitados cuando el catálogo declara venta suelta.
// El nombre/peso de un SKU que se vende como paquete no se transforma.
function normalizarVentaUnitaria(interpretacion, catalogo, mensaje = '') {
  const producto = interpretacion?.producto;
  if (!producto || producto.observado || ['modificar_cantidad','quitar','mantener_solo'].includes(interpretacion.carrito?.operacion)) return false;
  const referencias = catalogo.filter(m => normalizar(m.marca) === normalizar(producto.marca || ''))
    .flatMap(m => m.referencias).filter(r => normalizar(r.nombre) === normalizar(producto.referencia || ''));
  if (referencias.length !== 1 || referencias[0].metadata?.venta_por_unidad !== true || referencias[0].presentaciones.length !== 1) return false;
  const textos = [producto.mencionOriginal, producto.textoVisible, mensaje].filter(Boolean);
  const patron = /\b(\d+|un|una)\s+(?:paquetes?|packs?|cajas?)\b[^\n;]{0,80}?\b(?:de|x|por)\s*(\d+)\s*(?:paquetitos?|tubitos?|tubos?|sobres?|unidades?|und)\b/i;
  const coincidencia = textos.map(t => t.match(patron)).find(Boolean);
  if (!coincidencia) return false;
  // No reemplazar un peso expresamente pedido por el peso de la unidad.
  if (/\d\s*(?:kg|gr?|ml)\b/i.test(producto.presentacion || '') &&
      normalizarPeso(producto.presentacion) !== normalizarPeso(referencias[0].presentaciones[0].peso)) return false;
  const cantidad = (/^(un|una)$/i.test(coincidencia[1]) ? 1 : Number(coincidencia[1])) * Number(coincidencia[2]);
  if (!Number.isSafeInteger(cantidad) || cantidad < 1) return false;
  producto.cantidad = cantidad;
  producto.presentacion = referencias[0].presentaciones[0].peso;
  return true;
}

module.exports = { normalizarVentaUnitaria, especiesReferencia, admiteEspecie, precioPorCantidad, reglasPrecio, datosPrecio, actualizarPrecioItem };
