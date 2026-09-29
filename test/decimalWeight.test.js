const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarPeso } = require('../src/utils/text');
const { resolverEvidenciaProducto } = require('../src/services/productEvidenceService');
const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');

test('coma decimal conserva magnitud y equivale al punto en diferentes unidades', () => {
  for (const [entrada, esperado] of [
    ['1,5 kg', '1.5kg'], ['1.5kg', '1.5kg'], ['15kg', '15kg'],
    ['2,72 kg', '2.72kg'], ['0,5 kg', '0.5kg'], ['x 1,5 kl', '1.5kg'],
    ['1,5 g', '1.5g'], ['1500g', '1.5kg'], ['2,5 lb', '2.5lb'],
    ['10 kg', '10kg'], [null, ''],
  ]) assert.equal(normalizarPeso(entrada), esperado, String(entrada));
});

test('peso decimal observado selecciona presentacion correcta sin perder las alternativas', () => {
  const catalogo = [{ marca: 'NUTRIALFA', referencias: [{ nombre: 'NUTRIALFA PIEL ADULTO', especie: 'perro',
    presentaciones: [{ peso: '1.5kg', precio: 39500 }, { peso: '3kg', precio: 75900 }, { peso: '15kg', precio: 250000 }] }] }];
  for (const leido of ['1,5 kg', '1.5 kg']) {
    const producto = resolverEvidenciaProducto({ marca: 'NUTRIALFA', referencia: 'NUTRIALFA PIEL ADULTO',
      observado: { nombre: 'NUTRIALFA PIEL ADULTO', presentacion: leido, confianzaIdentidad: 0.98, confianzaPresentacion: 0.98 }, solicitud: {} });
    const resultado = validarCoincidenciaProducto({ mensaje: 'Este', catalogo,
      clasificacion: { intencion: 'imagen', requiereVision: true, perfilContexto: 'multimedia' },
      interpretacion: { accion: 'consultar', producto } });
    assert.equal(producto.fuentePresentacion, 'imagen');
    assert.equal(resultado.nivel, 'alta');
    assert.equal(resultado.presentacionSolicitada, '1.5kg');
    assert.equal(resultado.presentacionValida, true);
    assert.equal(catalogo[0].referencias[0].presentaciones.length, 3);
  }
});

test('peso del texto prevalece sobre la foto y una lectura incierta no inventa peso', () => {
  const base = { observado: { nombre: 'NUTRIALFA', presentacion: '1,5 kg', confianzaIdentidad: 0.99, confianzaPresentacion: 0.99 } };
  const pedido = resolverEvidenciaProducto({ ...base, solicitud: { presentacionTexto: '15 kg' } });
  assert.equal(pedido.presentacion, '15kg');
  assert.equal(pedido.fuentePresentacion, 'texto');
  const dudoso = resolverEvidenciaProducto({ observado: { ...base.observado, confianzaPresentacion: 0.4 }, solicitud: {} });
  assert.equal(dudoso.presentacion, null);
  assert.equal(dudoso.requierePresentacion, true);
});
