const test = require('node:test');
const assert = require('node:assert/strict');
const { validarCoincidenciaProducto: validar, aplicarCoincidenciaValidada: aplicar } = require('../src/services/productMatchValidator');
const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { consolidarCatalogo } = require('../src/services/catalogConsolidationService');
const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'pedido' };
const catalogo = [{ marca: 'PROTECCION', referencias: ['3 meses', '37 dias'].map((duracion, i) => ({
  nombre: i ? 'PROTECCION 37 DIAS' : 'PROTECCION', especie: 'perro', categoria: 'medicamento',
  metadata: { duracion }, presentaciones: [{ peso: '4.5-10kg', precio: i ? 35000 : 120000 }],
})) }];
test('duraciones no se consolidan ni se cotizan solo por conocer peso', () => {
  assert.equal(consolidarCatalogo(catalogo)[0].referencias.length, 2);
  for (const peso of ['7kg', '4.5-10kg']) {
    const v = validar({ mensaje: `PROTECCION perro ${peso}`, catalogo, clasificacion });
    assert.equal(v.aclaracion?.campo, 'duracion');
    assert.equal(v.coincidencia, undefined);
  }
});
for (const [duracion, precio] of [['3 meses', 120000], ['37 dias', 35000]]) {
  test(`elige ${duracion} y conserva peso en aclaracion`, () => {
    const inicial = validar({ mensaje: 'PROTECCION perro 7kg', catalogo, clasificacion });
    const contextoProducto = { ...inicial, presentacion: inicial.presentacionSolicitada, creadoEn: new Date().toISOString() };
    const v = validar({ mensaje: duracion, catalogo, clasificacion, contextoProducto });
    assert.equal(v.nivel, 'alta', JSON.stringify(v));
    assert.equal(v.presentacionSolicitada, '4.5-10kg');
    assert.equal(v.coincidencia.presentaciones[0].precio, precio);
    const directa = validar({ mensaje: `PROTECCION perro 7kg ${duracion}`, catalogo, clasificacion });
    assert.equal(directa.nivel, 'alta', JSON.stringify(directa));
    assert.equal(directa.coincidencia.presentaciones[0].precio, precio);
  });
  test(`duracion antes del peso: ${duracion}`, () => {
    const inicial = validar({ mensaje: `PROTECCION ${duracion}`, catalogo, clasificacion });
    assert.equal(inicial.aclaracion?.campo, 'peso_mascota', JSON.stringify(inicial));
    const v = validar({ mensaje: '7kg', catalogo, clasificacion,
      contextoProducto: { ...inicial, presentacion: inicial.presentacionSolicitada, creadoEn: new Date().toISOString() } });
    assert.equal(v.nivel, 'alta', JSON.stringify(v));
    assert.equal(v.coincidencia.presentaciones[0].precio, precio);
  });
}
for (const [marca, formato] of [['CUTAMYCON', 'SPRAY'], ['DERMOPRUEBA', 'ESPUMA']]) {
  test(`formato en identidad no produce falsa indisponibilidad: ${marca}`, () => {
    const catalogo = [{ marca, referencias: [{ nombre: `${marca} ${formato}`, categoria: 'medicamento',
      presentaciones: [{ peso: '50ml', precio: 34000 }, { peso: '100ml', precio: 53300 }] }] }];
    const mensaje = `${marca} ${formato}`;
    const interpretacion = { intencion: 'consulta_producto', accion: 'consultar', confianza: 1,
      producto: { marca, referencia: mensaje, presentacion: formato.toLowerCase() } };
    const v = validar({ mensaje, catalogo, clasificacion, interpretacion });
    assert.equal(v.nivel, 'alta');
    const lectura = aplicar(interpretacion, v);
    assert.equal(lectura.producto.presentacion, null);
    const estado = crearEstadoInicial();
    const respuesta = resolverConsultaCatalogo(mensaje, estado, catalogo, lectura);
    assert.doesNotMatch(respuesta, /no (?:tengo|manejamos|hay|tenemos)/i);
    assert.match(respuesta, /34[.,]000/);
    assert.match(respuesta, /53[.,]300/);
    assert.equal(estado.carrito.length, 0);
  });
}

test('catálogo real separa duraciones, corrige el decimal y no inventa precios perdidos', () => {
  const real = require('../productos.json').filter(m => m.marca === 'BRAVECTO');
  const corta = real[0].referencias.find(r => r.metadata.duracion === '37 dias');
  assert.equal(corta.nombre, 'BRAVECTO 37 DIAS');
  assert.equal(corta.presentaciones[0].peso, '2.5-4.5kg');
  assert.equal(corta.presentaciones[0].precio, 32000);
  assert.ok(!real[0].referencias.some(r => r.nombre === 'BRAVECTO 2.'));
  for (const peso of ['4.5-10kg', '18kg']) {
    assert.equal(validar({ mensaje: `bravecto ${peso}`, catalogo: real, clasificacion }).aclaracion.campo, 'duracion');
    assert.equal(validar({ mensaje: `bravecto ${peso} 37 dias`, catalogo: real, clasificacion }).razon, 'precio_por_confirmar');
    assert.equal(validar({ mensaje: `bravecto ${peso} 3 meses`, catalogo: real, clasificacion }).nivel, 'alta');
  }
  const v = validar({ mensaje: 'bravecto perro 3kg 37 dias', catalogo: real, clasificacion });
  assert.equal(v.nivel, 'alta', JSON.stringify(v));
  assert.equal(v.presentacionSolicitada, '2.5-4.5kg');
  assert.equal(v.coincidencia.presentaciones[0].precio, 32000);
});

test('la migración conserva precios conocidos y es idempotente', () => {
  const { corregirMarca } = require('../scripts/split-catalog-durations');
  const real = require('../productos.json').find(m => m.marca === 'BRAVECTO');
  assert.deepEqual(corregirMarca(real), real);
});
