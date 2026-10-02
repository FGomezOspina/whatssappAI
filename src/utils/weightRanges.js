const { normalizar, normalizarPeso, extraerPesoTexto } = require('./text');

function rangoPeso(valor) {
  const texto = normalizarPeso(valor);
  const rango = texto.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)kg$/);
  if (rango && Number(rango[1]) < Number(rango[2])) return { desde: Number(rango[1]), hasta: Number(rango[2]) };
  const hasta = texto.match(/^hasta(\d+(?:\.\d+)?)kg$/);
  return hasta ? { desde: 0, hasta: Number(hasta[1]) } : null;
}

function usaRangosMascota(referencia) {
  return /medicamento|antipulgas|desparasitante/.test(normalizar(`${referencia.categoria || ''} ${referencia.subcategoria || ''}`)) &&
    ((referencia.presentaciones || []).some(p => rangoPeso(p.peso)) || Boolean(rangoPeso(extraerPesoTexto(referencia.nombre))));
}

function presentacionesParaPeso(referencia, peso) {
  if (!usaRangosMascota(referencia)) return [];
  const exactas = referencia.presentaciones.filter(p => normalizarPeso(p.peso) === normalizarPeso(peso));
  if (exactas.length) return exactas;
  const numero = normalizarPeso(peso).match(/^(\d+(?:\.\d+)?)kg$/);
  if (!numero) return [];
  const valor = Number(numero[1]);
  // Los extremos abiertos/cerrados son datos del catálogo, nunca reglas por
  // marca. Sin esa información un límite compartido sigue siendo ambiguo.
  return referencia.presentaciones.filter(p => {
    const rango = rangoPeso(p.peso) || rangoPeso(extraerPesoTexto(referencia.nombre));
    const limites = p.metadata?.rango_peso || {};
    return rango && valor > 0 &&
      (limites.desde_inclusivo === false ? valor > rango.desde : valor >= rango.desde) &&
      (limites.hasta_inclusivo === false ? valor < rango.hasta : valor <= rango.hasta);
  });
}
module.exports = { rangoPeso, usaRangosMascota, presentacionesParaPeso };
