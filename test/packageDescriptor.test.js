const test = require('node:test');
const assert = require('node:assert/strict');
const { validarCoincidenciaProducto: validar, aplicarCoincidenciaValidada } = require('../src/services/productMatchValidator');
const { esDescriptorReferencia } = require('../src/utils/catalogVariants');
const { _internals: { consultaSolicitudProducto } } = require('../src/services/conversationService');
const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'pedido' };

for (const envase of ['lata', 'latas', null]) test(`envase ${envase} no descarta referencia cuyo catálogo solo contiene gramos`, () => {
  const catalogo = [{ marca: 'NUTRICIONPRUEBA', referencias: [{ nombre: 'NUTRICIONPRUEBA URINARY',
    especie: 'gato', categoria: 'comida', presentaciones: [{ peso: '100gr', precio: 8000 }] }] }];
  const producto = { marca: 'NUTRICIONPRUEBA', referencia: 'Urinary', textoVisible: '3 latas de NUTRICIONPRUEBA Urinary',
    presentacion: envase, cantidad: 3, condiciones: ['urinary'] };
  const interpretacion = { producto, confianza: 1, intencion: 'consulta_producto', accion: 'consultar' };
  const v = validar({ mensaje: consultaSolicitudProducto(producto, producto.textoVisible), catalogo, interpretacion, clasificacion });
  assert.equal(v.nivel, 'alta');
  assert.equal(v.coincidencia.referencia, 'NUTRICIONPRUEBA URINARY');
  const resuelta = aplicarCoincidenciaValidada(interpretacion, v);
  assert.equal(resuelta.producto.presentacion, null);
  assert.equal(resuelta.producto.cantidad, 3);
});

test('lata y latas mantienen la distinción con pouch cuando el catálogo especifica envases', () => {
  const catalogo = [{ marca: 'NUTRICIONPRUEBA', referencias: ['LATA', 'POUCH'].map(formato => ({
    nombre: `NUTRICIONPRUEBA URINARY ${formato}`, categoria: 'comida', presentaciones: [{ peso: '100gr', precio: 8000 }],
  })) }];
  for (const mensaje of ['1 lata NUTRICIONPRUEBA urinary', '3 latas NUTRICIONPRUEBA urinary']) {
    const v = validar({ mensaje, catalogo, clasificacion });
    assert.equal(v.nivel, 'alta');
    assert.equal(v.coincidencia.referencia, 'NUTRICIONPRUEBA URINARY LATA');
  }
});

test('una presentación que el catálogo llama lata conserva su significado y un peso literal no es envase', () => {
  assert.equal(esDescriptorReferencia('lata', { presentaciones: [{ peso: 'lata', precio: 1 }] }), false);
  assert.equal(esDescriptorReferencia('100gr', { nombre: 'PRODUCTO 100GR', presentaciones: [] }), false);
});
