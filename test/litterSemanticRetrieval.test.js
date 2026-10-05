const test = require('node:test');
const assert = require('node:assert/strict');
const catalogo = require('../productos.json');
const { _internals: { seleccionarCatalogoLocal } } = require('../src/services/catalogContextService');
const { validarCoincidenciaProducto: validar, aplicarCoincidenciaValidada, _internals: { consultaSemanticaRespaldada } } = require('../src/services/productMatchValidator');
const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'producto', requiereBusquedaProducto: true };
function decision(textoVisible) { return { accion: 'consultar', intencion: 'consulta_producto', producto: {
  marca: null, referencia: null, categoria: 'arena_sustrato', especie: 'gato', textoVisible,
} }; }
const mensajes = [
  ['arena maiz cat', 'arena maiz cat'],
  ['ahh perdon tiene arena para gatos de Maiz ??? de esa que la bolsa es verde ??', 'arena para gatos de Maiz'],
];
test('interpretación real con marca identificada no se desvía al maíz de otra categoría', () => {
  const mensaje = mensajes[1][0];
  const interpretacion = decision('arena para gatos de maiz bolsa verde');
  Object.assign(interpretacion.producto, { marca: 'ARENA MAIZ CAT', referencia: 'ARENA MAIZ CAT' });
  const v = validar({ mensaje, interpretacion, catalogo, clasificacion });
  assert.equal(v.nivel, 'alta');
  assert.equal(v.coincidencia.referencia, 'ARENA MAIZ CAT');
  assert.notEqual(v.marcaExacta, 'maiz');
});
for (const [mensaje, nucleo] of mensajes) test(`recuperación y estado del caso real: ${mensaje}`, () => {
  const candidatos = seleccionarCatalogoLocal({ catalogo, mensaje, clasificacion }).catalogo;
  assert.ok(candidatos.some(m => m.marca === 'ARENA MAIZ CAT'));
  const interpretacion = decision(nucleo);
  const v = validar({ mensaje, interpretacion, catalogo: candidatos, clasificacion });
  assert.equal(v.nivel, 'alta');
  assert.equal(v.coincidencia.referencia, 'ARENA MAIZ CAT');
  assert.equal(v.coincidencia.presentaciones.length, 5);
  const estado = crearEstadoInicial();
  estado.carrito = [{ marca: 'DIAMOND', referencia: 'DIAMOND INDOOR CAT', peso: '500gr', cantidad: 2, precio: 19500 }];
  const anterior = structuredClone(estado.carrito);
  const respuesta = resolverConsultaCatalogo(mensaje, estado, candidatos, aplicarCoincidenciaValidada(interpretacion, v));
  assert.match(respuesta, /ARENA MAIZ CAT/);
  assert.doesNotMatch(respuesta, /no encuentro|bolsa verde/i);
  assert.deepEqual(estado.carrito, anterior);
  assert.equal(estado.ultimaSeleccion.referencia, 'ARENA MAIZ CAT');
});

for (const material of ['papel', 'pino', 'nogal']) test(`material descubierto desde catálogo sin reglas para ${material}`, () => {
  const nombre = `ARENA ${material.toUpperCase()} CAT`;
  const datos = [
    { marca: 'ARENA', referencias: [{ nombre: 'ARENA OTRA', categoria: 'arena_sustrato', especie: 'gato', presentaciones: [{ peso: '4kg', precio: 10000 }] }] },
    { marca: material.toUpperCase(), referencias: [{ nombre: material.toUpperCase(), categoria: 'comida', especie: 'perro', presentaciones: [{ peso: '1kg', precio: 1000 }] }] },
    { marca: nombre, referencias: [{ nombre, categoria: 'arena_sustrato', especie: 'gato', presentaciones: [{ peso: '4kg', precio: 21000 }] }] },
  ];
  const mensaje = `hola necesito arena de ${material} para gatos, recuerdo la bolsa azul`;
  const candidatos = seleccionarCatalogoLocal({ catalogo: datos, mensaje, clasificacion }).catalogo;
  const v = validar({ mensaje, interpretacion: decision(`arena de ${material} para gatos`), catalogo: candidatos, clasificacion });
  assert.equal(v.nivel, 'alta');
  assert.equal(v.coincidencia.referencia, nombre);
});

test('la extracción semántica no puede borrar variantes conocidas ni inventar nombres', () => {
  const datos = [{ marca: 'NUBE', referencias: [{ nombre: 'ARENA NUBE LAVANDA', categoria: 'arena_sustrato' }] }];
  for (const [mensaje, nucleo] of [['arena nube lavanda', 'arena nube'], ['arena desconocida', 'arena nube'], ['arena para gatos', 'arena para perros']]) {
    assert.equal(consultaSemanticaRespaldada(mensaje, decision(nucleo), datos), mensaje);
  }
});

test('dos arenas del mismo material requieren aclaración, el color no autoriza elegir una', () => {
  const datos = ['NUBE', 'BRISA'].map(marca => ({ marca, referencias: [{ nombre: `ARENA ${marca} PAPEL CAT`, categoria: 'arena_sustrato', especie: 'gato', presentaciones: [{ peso: '4kg', precio: 15000 }] }] }));
  const v = validar({ mensaje: 'arena de papel para gatos la bolsa verde', interpretacion: decision('arena de papel para gatos'), catalogo: datos, clasificacion });
  assert.notEqual(v.nivel, 'alta');
  assert.equal(v.coincidencia, null);
});
