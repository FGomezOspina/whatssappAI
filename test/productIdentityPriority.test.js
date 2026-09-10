const test = require('node:test');
const assert = require('node:assert/strict');
const { consolidarCatalogo } = require('../src/services/catalogConsolidationService');
const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
const { _internals: { seleccionarCatalogoLocal } } = require('../src/services/catalogContextService');
const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'pedido', requiereBusquedaProducto: true };
const catalogo = consolidarCatalogo([{ marca: 'NUTRIALFA', referencias: [
  { nombre: 'NUTRIALFA PREMIUM', especie: 'perro', presentaciones: [{ peso: '20kg', precio: 116000 }] },
  { nombre: 'NUTRIALFA CROQUETA', especie: 'perro', presentaciones: [{ peso: 'x 20', precio: 95500 }] },
  { nombre: 'NUTRIALFA CROQUETAS', especie: 'perro', presentaciones: [{ peso: '1kg', precio: 5600 }] },
  { nombre: 'NUTRIALFA VITALITY', especie: 'perro', presentaciones: [{ peso: '10kg', precio: 154900 }] },
] }]);

test('nombre singular/plural identifica su familia, no otra linea con el mismo peso', () => {
  const candidatos = seleccionarCatalogoLocal({ catalogo, mensaje: 'nutrialfa croquetas 20kl', clasificacion }).catalogo;
  const resultado = validarCoincidenciaProducto({ mensaje: 'nutrialfa croquetas 20kl', catalogo: candidatos, catalogoCandidatos: candidatos, clasificacion });
  assert.equal(resultado.nivel, 'alta');
  assert.match(resultado.coincidencia.referenciaCatalogo, /CROQUETAS?/);
  assert.equal(resultado.presentacionValida, true);
  assert.equal(resultado.coincidencia.presentaciones.find(p => p.peso === '20kg').precio, 95500);
});

test('marca y peso solo ofrecen variantes de ese peso sin inventar una especie faltante', () => {
  const resultado = validarCoincidenciaProducto({ mensaje: 'nutrialfa x20kl', catalogo, catalogoCandidatos: catalogo, clasificacion });
  assert.equal(resultado.nivel, 'media');
  assert.equal(resultado.alternativas.length, 2);
  assert.equal(resultado.aclaracion, undefined);
  for (const alternativa of resultado.alternativas) {
    assert.doesNotMatch(alternativa.referencia, /VITALITY/);
    assert.ok(alternativa.presentaciones.every(p => p.peso === '20kg'));
  }
});
