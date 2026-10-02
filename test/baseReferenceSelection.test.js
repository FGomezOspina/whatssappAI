const test = require('node:test');
const assert = require('node:assert/strict');
const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
const { presentacionesParaPeso } = require('../src/utils/weightRanges');
const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'pedido', requiereBusquedaProducto: true };

for (const marca of ['NEXGARD', 'PROTECCIONPRUEBA', 'MARCA PRUEBA']) {
  const catalogo = JSON.parse(JSON.stringify(require('../productos.json')
    .filter(m => m.marca === 'NEXGARD')).replaceAll('NEXGARD', marca));
  for (const mensaje of [`Hola, ¿tienen ${marca} para un perro de 10 kg?`, `${marca} 10kg`]) {
    test(`nombre base completo tiene prioridad: ${mensaje}`, () => {
      const r = validarCoincidenciaProducto({ mensaje, catalogo, catalogoCandidatos: catalogo, clasificacion });
      assert.equal(r.nivel, 'alta');
      assert.equal(r.coincidencia.referencia, marca);
      assert.equal(r.presentacionSolicitada, '4-10kg');
      assert.equal(r.aclaracion, null);
    });
  }
  test(`la variante explicita conserva su identidad: ${marca}`, () => {
    const r = validarCoincidenciaProducto({ mensaje: `${marca} spectra 10kg`, catalogo, clasificacion });
    assert.equal(r.nivel, 'alta');
    assert.equal(r.coincidencia.referencia, `${marca} SPECTRA`);
    assert.equal(r.presentacionSolicitada, '7.5-15kg');
  });
  test(`una especie incompatible impide seleccionar la referencia base: ${marca}`, () => {
    const r = validarCoincidenciaProducto({ mensaje: `${marca} gato 5kg`, catalogo, clasificacion });
    assert.notEqual(r.coincidencia?.referencia, marca);
  });
}

test('los extremos del rango obedecen metadatos y mantienen ambiguedad si no estan declarados', () => {
  const ref = { nombre: 'PRODUCTO', categoria: 'medicamento', presentaciones: [
    { peso: '4-10kg' }, { peso: '10-25kg', metadata: { rango_peso: { desde_inclusivo: false } } },
  ] };
  assert.deepEqual(presentacionesParaPeso(ref, '10kg').map(p => p.peso), ['4-10kg']);
  assert.deepEqual(presentacionesParaPeso(ref, '10.1kg').map(p => p.peso), ['10-25kg']);
  assert.deepEqual(presentacionesParaPeso(ref, '26kg'), []);
  assert.deepEqual(presentacionesParaPeso(ref, '10-25kg').map(p => p.peso), ['10-25kg']);
  delete ref.presentaciones[1].metadata;
  assert.equal(presentacionesParaPeso(ref, '10kg').length, 2);
  ref.presentaciones[0].metadata = { rango_peso: { hasta_inclusivo: false } };
  assert.deepEqual(presentacionesParaPeso(ref, '10kg').map(p => p.peso), ['10-25kg']);
});
