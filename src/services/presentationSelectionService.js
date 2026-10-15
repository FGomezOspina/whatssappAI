const { normalizar, normalizarPeso, extraerPesoTexto, formatearPrecio } = require('../utils/text');
const { rangoPeso, usaRangosMascota } = require('../utils/weightRanges');
const { precioPorCantidad, datosPrecio } = require('../utils/catalogCommercialRules');

// These fields describe the customer's request. They never participate in
// retrieval or identity scoring; they are consumed only after identification.
const INSTRUCCIONES_PRESENTACIONES = `Para la cotizacion posterior a identificar cada producto, conserva en cada producto intencionPresentaciones: "todas" si solicita otras/mas presentaciones, tamanos disponibles o precios de las demas, "especifica" si solicita solo una, o null. Interpreta el significado completo, incluidas negaciones, y asigna la intencion a su producto, no a toda la lista. Una foto con pregunta solo de precio usa la presentacion observada; pedir alternativas tiene prioridad sobre ese tamano.
Conserva mascotas: [{nombre: string|null, pesoKg: number|null}] por producto cuando el cliente aporta pesos corporales. Distingue peso individual, peso del empaque y cantidad de unidades. No sumes ni promedies pesos; no conviertas numero de mascotas en cantidad comprada. Incluye cada mascota aunque falte su peso. Recupera pesos individuales del contexto conversacional vigente cuando siguen refiriendose a esas mascotas; conserva comas decimales como numeros decimales. Estos campos no cambian marca, referencia, busqueda ni reconocimiento; el backend selecciona presentaciones del catalogo despues de validar la identidad.`;

function normalizarMascotas(mascotas) {
  if (!Array.isArray(mascotas)) return [];
  return mascotas.filter(m => m && typeof m === 'object').map((m, i) => ({
    nombre: typeof m.nombre === 'string' && m.nombre.trim() ? m.nombre.trim().slice(0, 100) : `Mascota ${i + 1}`,
    pesoKg: m.pesoKg != null && Number.isFinite(Number(String(m.pesoKg).replace(',', '.'))) &&
      Number(String(m.pesoKg).replace(',', '.')) > 0 ? Number(String(m.pesoKg).replace(',', '.')) : null,
  }));
}

function solicitaTodas(texto, intencion) {
  if (intencion) return intencion === 'todas';
  const t = normalizar(texto);
  if (/\b(?:no quiero|no necesito|sin|no me muestres)\b.*\b(?:presentaciones|tamanos|demas)\b/.test(t)) return false;
  return /\b(?:otras|mas|todas las) presentaciones\b|\b(?:que|cuales|los) tamanos\b|\bprecios? y tamanos\b|\bprecios? (?:de )?(?:las |los )?demas\b/.test(t);
}

function mascotasDelTexto(texto) {
  // Compatibility for older interpreter payloads. Only body-weight clauses,
  // never arbitrary kg values from packaging, directions or other products.
  const patron = /\b(?:pesa(?:n)?|(?:perr(?:o|a|ito|ita)|gat(?:o|a|ito|ita)|mascota)\s+de)\s*(\d+(?:[.,]\d+)?)\s*(?:y\s*)?(?:kg|kl|kilos?|kilogramos?)\b/gi;
  return [...texto.matchAll(patron)].map((m, i) => ({ nombre: `Mascota ${i + 1}`, pesoKg: Number(m[1].replace(',', '.')) }));
}

function seleccionarPorPeso(referencia, pesoKg) {
  if (!(pesoKg > 0)) return [];
  const opciones = (referencia.presentaciones || []).map(p => ({ p,
    rango: rangoPeso(p.peso) || rangoPeso(extraerPesoTexto(p.referencia || referencia.nombre)) }))
    .filter(({ p, rango }) => rango &&
      (p.metadata?.rango_peso?.desde_inclusivo === false ? pesoKg > rango.desde : pesoKg >= rango.desde) &&
      // Compare at decimal precision without rounding the customer's weight.
      pesoKg * 100 <= Math.round((rango.hasta + 0.9) * 100))
    .sort((a, b) => a.rango.hasta - b.rango.hasta);
  // The lower band retains its upper edge and up to 0.9 kg above it.
  // Several SKUs in that band remain real commercial alternatives.
  return opciones.filter(o => o.rango.hasta === opciones[0]?.rango.hasta).map(o => o.p);
}

function resolverPresentacionesIdentificadas({ validacion, producto = {}, mensaje = '', catalogo = [], estado = {} }) {
  producto = producto || {};
  const identidad = validacion?.coincidencia || validacion?.identidadAntesDePresentacion;
  if (!identidad || identidad.tipoCoincidencia === 'marca') return validacion;
  const nombres = identidad.referenciasEquivalentes || [identidad.referenciaCatalogo || identidad.referencia];
  const referencias = catalogo.filter(m => normalizar(m.marca) === normalizar(identidad.marca))
    .flatMap(m => m.referencias || []).filter(r => nombres.some(n => normalizar(n) === normalizar(r.nombre)));
  const referencia = referencias[0];
  if (!referencia) return validacion;
  const presentaciones = (identidad.presentaciones || []).filter(p => p.stock !== false);
  const texto = producto.mencionOriginal || producto.textoVisible || mensaje;
  if (producto.intencionPresentaciones === 'especifica' && rangoPeso(producto.presentacion) && !mascotasDelTexto(texto).length) return validacion;
  const todas = solicitaTodas(texto, producto.intencionPresentaciones) ||
    (!producto.intencionPresentaciones && producto.observado && solicitaTodas(mensaje));
  let plan;
  const pesosAportados = normalizarMascotas(producto.mascotas).length || mascotasDelTexto(texto).length;
  if (todas || (producto.observado && !validacion.presentacionSolicitada && !pesosAportados)) {
    plan = { tipo: 'alternativas', grupos: presentaciones.map(p => ({ ...p, mascotas: [] })), pendientes: [] };
  } else if (usaRangosMascota(referencia)) {
    let mascotas = normalizarMascotas(producto.mascotas);
    if (!mascotas.length) mascotas = mascotasDelTexto(texto);
    if (!mascotas.length && validacion.pesoMascotaSolicitado && !rangoPeso(validacion.pesoMascotaSolicitado)) {
      const peso = normalizarPeso(validacion.pesoMascotaSolicitado).match(/^(\d+(?:\.\d+)?)kg$/);
      if (peso) mascotas = [{ nombre: 'Mascota 1', pesoKg: Number(peso[1]) }];
    }
    if (!mascotas.length && !producto.presentacion) {
      const previa = (estado.ultimaSolicitudProductos || []).find(s =>
        s.marca === identidad.marca && nombres.includes(s.referencia));
      const seleccion = estado.ultimaSeleccion;
      const original = estado.ultimaConsultaProducto?.solicitudOriginal?.producto;
      mascotas = normalizarMascotas(previa?.mascotas ||
        (original?.marca === identidad.marca && nombres.includes(original.referencia) ? original.mascotas : null) ||
        (seleccion?.marca === identidad.marca && nombres.includes(seleccion.referencia) ? seleccion.mascotas : null));
    }
    if (!mascotas.length) return validacion;
    const grupos = new Map(), pendientes = [];
    for (const mascota of mascotas) {
      const opciones = seleccionarPorPeso({ ...referencia, presentaciones }, mascota.pesoKg);
      if (opciones.length !== 1) {
        pendientes.push({ ...mascota, motivo: mascota.pesoKg == null ? 'peso_faltante' : opciones.length ? 'presentacion_ambigua' : 'fuera_de_rango' });
        continue;
      }
      const p = opciones[0], clave = `${p.referencia || identidad.referenciaCatalogo}:${normalizarPeso(p.peso)}`;
      if (!grupos.has(clave)) grupos.set(clave, { ...p, mascotas: [] });
      grupos.get(clave).mascotas.push(mascota);
    }
    plan = { tipo: 'peso', grupos: [...grupos.values()], pendientes, mascotas };
  }
  if (!plan) return validacion;
  return { ...validacion, nivel: 'alta', coincidencia: identidad, aclaracion: null,
    presentacionSolicitada: plan.grupos.length === 1 && plan.tipo === 'peso' ? normalizarPeso(plan.grupos[0].peso) : null,
    presentacionValida: true, seleccionPresentaciones: plan };
}

function cotizarPresentaciones(identidad, plan, cantidad = 1) {
  return plan.grupos.map(p => ({ marca: identidad.marca,
    ...(identidad.duracion ? { duracion: identidad.duracion } : {}),
    referencia: p.referencia || identidad.referenciaCatalogo || identidad.referencia,
    referenciaCatalogo: p.referencia || identidad.referenciaCatalogo || identidad.referencia,
    peso: p.peso, precio: precioPorCantidad(p, cantidad), ...datosPrecio(p), stock: p.stock,
    cantidad, mascotas: p.mascotas, tipoSeleccion: plan.tipo, presentaciones: identidad.presentaciones,
  }));
}

function agruparCotizaciones(items) {
  const grupos = new Map();
  for (const item of items) {
    const clave = `${item.marca}:${item.referencia}:${normalizarPeso(item.peso)}:${item.duracion || ''}`;
    const anterior = grupos.get(clave);
    if (!anterior) grupos.set(clave, { ...item, mascotas: [...(item.mascotas || [])] });
    else for (const mascota of item.mascotas || []) {
      if (!anterior.mascotas.some(m => m.nombre === mascota.nombre && m.pesoKg === mascota.pesoKg)) anterior.mascotas.push(mascota);
    }
  }
  return [...grupos.values()];
}

function formatearCotizaciones(items) {
  return agruparCotizaciones(items).map(item => {
    const mascotas = item.mascotas?.length ? ` — ${item.mascotas.map(m => `${m.nombre} (${m.pesoKg} kg)`).join(', ')}` : '';
    const cantidad = item.cantidad > 1 ? ` por unidad; ${item.cantidad} unidades: ${formatearPrecio(item.precio * item.cantidad)}` : '';
    return `- ${item.referencia} ${item.peso}: ${formatearPrecio(item.precio)}${cantidad}${mascotas}`;
  }).join('\n');
}

function preguntasPeso(plan) {
  return (plan.pendientes || []).map(m => m.motivo === 'peso_faltante'
    ? `¿Cuánto pesa ${m.nombre}?` : m.motivo === 'fuera_de_rango'
      ? `No hay una presentación del catálogo para ${m.nombre} (${m.pesoKg} kg).`
      : `Hay varias presentaciones para ${m.nombre} (${m.pesoKg} kg); falta elegir la presentación.`).join('\n');
}

module.exports = { INSTRUCCIONES_PRESENTACIONES, normalizarMascotas, resolverPresentacionesIdentificadas,
  seleccionarPorPeso, cotizarPresentaciones, agruparCotizaciones, formatearCotizaciones, preguntasPeso };
