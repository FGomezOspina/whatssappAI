const test = require('node:test');
const assert = require('node:assert/strict');
const { recordarSeleccion, sincronizarSelecciones, actualizarSeleccionCotizada, resolverCompraContextual } = require('../src/services/activeProductSelectionService');

const item = (marca, peso = '1kg') => ({ marca, referencia: `${marca} ORIGINAL`, peso, precio: 10000, cantidad: 1 });
function estado() {
  const s = { carrito: [] };
  for (const marca of ['ALFA', 'BETA']) recordarSeleccion(s, { ...item(marca), cotizacion: [item(marca)] });
  return s;
}

test('resuelve conjunto desde interpretación semántica sin depender de la frase literal', () => {
  const s = estado();
  const productos = resolverCompraContextual('Por favor prepara lo que acabamos de escoger',
    { accion: 'agregar', compraContextual: 'conjunto' }, s);
  assert.deepEqual(productos.map(p => p.marca), ['ALFA', 'BETA']);
});

test('singular utiliza el foco y anterior utiliza su antecedente', () => {
  const s = estado();
  s.ultimaSeleccion = item('BETA');
  assert.equal(resolverCompraContextual('me lo envías', {}, s)[0].marca, 'BETA');
  assert.equal(resolverCompraContextual('quiero el anterior', { accion: 'agregar', compraContextual: 'anterior' }, s)[0].marca, 'ALFA');
  s.ultimaSeleccion = item('ALFA');
  assert.equal(resolverCompraContextual('envíame ese', {}, s)[0].marca, 'ALFA');
});

test('alternativas pendientes, menciones y candidatos no autorizan compra', () => {
  const s = estado();
  recordarSeleccion(s, { ...item('GAMMA'), cotizacion: [item('GAMMA'), item('GAMMA', '3kg')] });
  assert.equal(resolverCompraContextual('me los envías', {}, s), null);
  const mencion = { carrito: [], productosPendientes: [item('GAMMA')],
    coincidenciasProductoPendientes: { opciones: [item('GAMMA')] } };
  assert.equal(resolverCompraContextual('me lo envías', {}, mencion), null);
});

test('descarte sobre cotización persiste y no reaparece al aceptar el conjunto', () => {
  const s = estado();
  actualizarSeleccionCotizada(s, [item('ALFA'), item('BETA')], [item('BETA')]);
  const restaurado = JSON.parse(JSON.stringify(s));
  assert.equal(resolverCompraContextual('me los envías', {}, restaurado).length, 1);
  assert.equal(restaurado.seleccionesProducto[0].estado, 'descartado');
  assert.equal(resolverCompraContextual('quiero los dos', {}, restaurado), null);
});

test('quitar un producto del carrito no recupera una cotización histórica', () => {
  const s = estado();
  s.carrito = [item('ALFA')];
  sincronizarSelecciones(s);
  s.carrito = [];
  sincronizarSelecciones(s);
  s.productosConsultados = [item('ALFA')];
  assert.deepEqual(resolverCompraContextual('me los envías', {}, s).map(p => p.marca), ['BETA']);
});

test('pedidos confirmados no se reabren por pronombres ni después de iniciar otro', () => {
  const s = estado();
  s.carrito = [item('ALFA')];
  s.pedidoConfirmado = true;
  sincronizarSelecciones(s);
  assert.equal(s.seleccionesProducto.find(p => p.marca === 'ALFA').estado, 'confirmado');
  assert.equal(s.seleccionesProducto.find(p => p.marca === 'BETA').estado, 'descartado');
  assert.equal(resolverCompraContextual('me los envías', {}, s), null);
  s.pedidoConfirmado = false;
  s.carrito = [];
  assert.equal(resolverCompraContextual('me los envías', {}, s), null);
});

test('dos mascotas de la misma presentación mantienen cantidad y asociación', () => {
  const s = { carrito: [] };
  const mascotas = [{ nombre: 'Luna', pesoKg: 10.6 }, { nombre: 'Sol', pesoKg: 7.8 }];
  recordarSeleccion(s, { ...item('PROTECCION', '4-10kg'), mascotas,
    cotizacion: [{ ...item('PROTECCION', '4-10kg'), cantidad: 2, mascotas }] });
  const [p] = resolverCompraContextual('me los envías', {}, s);
  assert.equal(p.cantidad, 2);
  assert.deepEqual(p.mascotas, mascotas);
});

test('el contrato semántico conserva el alcance y toda la memoria activa', () => {
  const { _internals: { normalizarInterpretacion } } = require('../src/services/aiInterpreter');
  const { _internals: { compactarEstado } } = require('../src/services/aiContextOptimizer');
  assert.equal(normalizarInterpretacion({ accion: 'agregar', compraContextual: 'conjunto' }).compraContextual, 'conjunto');
  assert.equal(normalizarInterpretacion({ compraContextual: 'inventado' }).compraContextual, null);
  const s = estado();
  for (let i = 0; i < 70; i++) recordarSeleccion(s, { ...item(`MARCA${i}`), cotizacion: [item(`MARCA${i}`)] });
  const serializado = JSON.parse(JSON.stringify(s));
  assert.equal(compactarEstado(serializado, 'pedido').seleccionesProducto.length, 72);
  assert.equal(resolverCompraContextual('me los envías', {}, serializado).length, 72);
});

test('una compra parcial por mascotas conserva los otros rangos cotizados', () => {
  const s = { carrito: [] };
  const menor = item('PROTECCION', '4-10kg'), mayor = item('PROTECCION', '10-25kg');
  recordarSeleccion(s, { ...menor, cotizacion: [menor, mayor], seleccionPresentaciones: { tipo: 'peso', pendientes: [] } });
  s.carrito = [menor];
  sincronizarSelecciones(s);
  const faltantes = resolverCompraContextual('me los envías', {}, JSON.parse(JSON.stringify(s)));
  assert.equal(faltantes.length, 1);
  assert.equal(faltantes[0].presentacion, '10-25kg');
  s.carrito = [];
  assert.deepEqual(resolverCompraContextual('me los envías', {}, s).map(p => p.presentacion), ['10-25kg']);
});
