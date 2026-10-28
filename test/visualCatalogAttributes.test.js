const test = require('node:test');
const assert = require('node:assert/strict');
const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
const { _internals: { seleccionarCatalogoLocal } } = require('../src/services/catalogContextService');
const clasificacion = { requiereVision: true, intencion: 'imagen', perfilContexto: 'multimedia' };

function validar(marca, nombre, peso, catalogo, atributos = {}) {
  return validarCoincidenciaProducto({ catalogo, clasificacion,
    interpretacion: { accion: 'consultar', confianza: .99, producto: { marca, ...atributos,
      observado: { nombre, presentacion: peso, confianzaIdentidad: .99, confianzaPresentacion: .99 } } } });
}

for (const peso of ['25 Kg', '25KG', 'X 25 KG', 'x25kg']) {
  test(`identidad visual con descripción y presentación ${peso}`, () => {
    const catalogo = [{ marca: 'KING CAT', referencias: [{ nombre: 'ARENA KING CAT X 25 KG',
      presentaciones: [{ peso: '25kg', precio: 62900 }] }] }];
    const v = validar('KING CAT', `ARENA SANITARIA PARA GATOS KING CAT ${peso}`, peso, catalogo);
    assert.equal(v.nivel, 'alta', JSON.stringify(v));
    assert.equal(v.coincidencia.referencia, 'ARENA KING CAT X 25 KG');
    assert.equal(v.presentacionSolicitada, '25kg');
    const candidatos = seleccionarCatalogoLocal({ catalogo,
      mensaje: `ARENA SANITARIA PARA GATOS KING CAT ${peso}`, clasificacion });
    assert.ok(JSON.stringify(candidatos).includes('ARENA KING CAT X 25 KG'));
  });
}

for (const [marca, referencia, visual, peso] of [
  ['MAX CAT', 'MAX CAT ADUL FRANGO', 'Alimento completo para gatos adultos MAX CAT Premium FRANGO 10.1 KG', '10.1kg'],
  ['NUBLIA', 'NUBLIA LAVANDA', 'NUBLIA LAVANDA absorción duradera frescura incomparable para tu hogar 8kg', '8kg'],
  ['VETORIA', 'VETORIA PLUS', 'VETORIA PLUS tratamiento de uso veterinario protección avanzada 20ml', '20ml'],
  ['CRUJIA', 'CRUJIA BOCADOS', 'CRUJIA BOCADOS premios deliciosos para compartir momentos felices 100gr', '100gr'],
  ['TRAZO', 'TRAZO COLLAR AZUL', 'TRAZO COLLAR AZUL comodidad excepcional diseño ergonómico 30cm', '30cm'],
]) test(`descripción adicional sin metadatos obligatorios: ${marca}`, () => {
  const catalogo = [{ marca, referencias: [{ nombre: referencia, presentaciones: [{ peso, precio: 10000 }] }] }];
  const v = validar(marca, visual, peso, catalogo);
  assert.equal(v.nivel, 'alta', JSON.stringify(v));
  assert.equal(v.coincidencia.referencia, referencia);
});

test('no ignora variantes presentes en referencias competidoras', () => {
  const catalogo = [{ marca: 'NUBLIA', referencias: ['NUBLIA LAVANDA', 'NUBLIA CARBON'].map(nombre => ({ nombre,
    presentaciones: [{ peso: '8kg', precio: 10000 }] })) }];
  assert.equal(validar('NUBLIA', 'NUBLIA CARBON absorción y frescura 8kg', '8kg', catalogo).coincidencia?.referencia, 'NUBLIA CARBON');
  assert.notEqual(validar('NUBLIA', 'NUBLIA absorción y frescura 8kg', '8kg', catalogo).nivel, 'alta');
  assert.notEqual(validar('NUBLIA', 'NUBLIA LAVANDA CARBON 8kg', '8kg', catalogo).nivel, 'alta');
});

test('la especie explícita distingue candidatos con el mismo nombre', () => {
  const catalogo = [{ marca: 'NUBLIA', referencias: [
    { nombre: 'NUBLIA LAVANDA', especie: 'gato', presentaciones: [{ peso: '8kg', precio: 10000 }] },
    { nombre: 'NUBLIA LAVANDA', especie: 'perro', presentaciones: [{ peso: '8kg', precio: 11000 }] },
  ] }];
  const v = validar('NUBLIA', 'NUBLIA LAVANDA frescura duradera 8kg', '8kg', catalogo, { especie: 'perro' });
  assert.equal(v.coincidencia?.presentaciones[0].precio, 11000);
});

test('una línea explícita incompatible no se descarta como texto comercial', () => {
  const catalogo = [{ marca: 'NUBLIA', referencias: [{ nombre: 'NUBLIA LAVANDA', presentaciones: [{ peso: '8kg', precio: 10000 }] }] }];
  assert.notEqual(validar('NUBLIA', 'NUBLIA LAVANDA XTREME 8kg', '8kg', catalogo, { linea: 'XTREME' }).nivel, 'alta');
});

test('identidad completa sin contenido neto legible conserva las presentaciones', () => {
  const catalogo = [{ marca: 'NUBLIA', referencias: [{ nombre: 'NUBLIA LAVANDA',
    presentaciones: [{ peso: '4kg', precio: 10000 }, { peso: '8kg', precio: 20000 }] }] }];
  const v = validar('NUBLIA', 'NUBLIA LAVANDA absorción duradera frescura incomparable', null, catalogo);
  assert.equal(v.nivel, 'alta');
  assert.equal(v.presentacionSolicitada, null);
  assert.equal(v.coincidencia.presentaciones.length, 2);
});
