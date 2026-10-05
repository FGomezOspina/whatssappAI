const test = require('node:test');
const assert = require('node:assert/strict');
const catalogo = require('../productos.json');
const { formatoAlimento, formatoReferencia } = require('../src/utils/foodFormat');
const { _internals: { expandirConsulta } } = require('../src/services/catalogContextService');
const { extraerCriterios, resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { validarCoincidenciaProducto: validar, aplicarCoincidenciaValidada } = require('../src/services/productMatchValidator');

function buscar(mensaje, marca, producto = {}, catalog = catalogo) {
  const familia = catalog.filter(m => m.marca === marca);
  const interpretacion = { accion: 'consultar', intencion: 'consulta_producto', producto: {
    marca, categoria: 'comida', subcategoria: 'comida_humeda', textoVisible: mensaje, ...producto,
  } };
  return { interpretacion, familia, resultado: validar({ mensaje, interpretacion,
    catalogo: familia, catalogoCandidatos: familia,
    clasificacion: { requiereBusquedaProducto: true, perfilContexto: 'producto' } }) };
}

for (const expresion of ['comida húmeda', 'alimento humedo', 'pouch', 'pouches', 'sobres', 'sachet', 'comida_humeda']) {
  test(`vocabulario húmedo compartido: ${expresion}`, () => {
    assert.equal(formatoAlimento(expresion), 'comida_humeda');
    assert.equal(extraerCriterios(`Purina ${expresion}`).subcategoria, 'comida_humeda');
    const consulta = expandirConsulta(`Purina ${expresion}`);
    assert.match(consulta, /humeda pouch sobre/);
    assert.doesNotMatch(consulta, /concentrado/);
  });
}

test('Purina no impone subcategoría y sobres de medicamento no clasifican como alimento', () => {
  assert.notEqual(extraerCriterios('Purina').subcategoria, 'concentrado');
  assert.equal(formatoReferencia({ nombre: 'MEDICAMENTO SOBRES', categoria: 'medicamento' }), null);
});

test('caso real Pro Plan: selecciona pouch, conserva $6.200 y registra consulta sin agregar carrito', () => {
  const mensaje = 'Y tienes comida húmeda Purina pro plan para gatos adultos ?';
  const { resultado, interpretacion, familia } = buscar(mensaje, 'PRO PLAN', {
    referencia: 'PRO PLAN POUCH FELINO ADULT', linea: 'PRO PLAN', especie: 'gato', etapa: 'adulto', presentacion: '85gr',
  });
  assert.equal(resultado.nivel, 'alta');
  assert.equal(resultado.coincidencia.referencia, 'PRO PLAN POUCH FELINO ADULT');
  assert.equal(resultado.coincidencia.presentaciones[0].precio, 6200);
  const estado = crearEstadoInicial();
  const validada = aplicarCoincidenciaValidada(interpretacion, resultado);
  const respuesta = resolverConsultaCatalogo(mensaje, estado, familia, validada);
  assert.match(respuesta, /6\.200/);
  assert.equal(estado.carrito.length, 0);
  assert.equal(estado.productosConsultados.length, 1);
  assert.equal(estado.productosConsultados[0].precio, 6200);
});

for (const [marca, especie, texto] of [
  ['PRO PLAN', 'gato', 'sobres pro plan para gatos adultos'],
  ['WHISKAS', 'gato', 'comida húmeda whiskas para gatos'],
  ['FELIX', 'gato', 'comida húmeda felix para gatos'],
  ['CHUNKY', 'perro', 'sobres chunky para perros'],
]) test(`${marca}: alimento húmedo no se mezcla con concentrado`, () => {
  const { resultado, familia } = buscar(texto, marca, { especie });
  assert.ok(resultado.alternativas.length > 0);
  for (const candidato of resultado.alternativas) {
    const referencia = familia[0].referencias.find(r => r.nombre === candidato.referenciaCatalogo);
    assert.equal(formatoReferencia(referencia), 'comida_humeda');
    assert.equal(referencia.especie, especie);
  }
  if (['WHISKAS', 'FELIX', 'CHUNKY'].includes(marca)) {
    assert.notEqual(resultado.nivel, 'alta');
    assert.ok(resultado.aclaracion, 'no debe adivinar entre referencias compatibles');
  }
});

test('equivalencia funciona con una marca nueva y la consulta seca excluye pouch', () => {
  const familia = [{ marca: 'NUBECITA', referencias: [
    { nombre: 'NUBECITA GATO ADULTO', categoria: 'comida', subcategoria: 'concentrado', especie: 'gato', presentaciones: [{ peso: '3kg', precio: 80000 }] },
    { nombre: 'NUBECITA POUCH GATO ADULTO', categoria: 'comida', subcategoria: 'comida_humeda', especie: 'gato', presentaciones: [{ peso: '85gr', precio: 4200 }] },
  ] }];
  for (const [formato, esperado] of [['comida húmeda', 'NUBECITA POUCH GATO ADULTO'], ['alimento seco', 'NUBECITA GATO ADULTO']]) {
    const { resultado } = buscar(`${formato} Nubecita gato adulto`, 'NUBECITA', { especie: 'gato', etapa: 'adulto' }, familia);
    assert.equal(resultado.nivel, 'alta');
    assert.equal(resultado.coincidencia.referencia, esperado);
  }
});
