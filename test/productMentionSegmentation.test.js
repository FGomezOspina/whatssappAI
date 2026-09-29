const test = require('node:test');
const assert = require('node:assert/strict');
const { _internals: { mencionProductoRespaldada } } = require('../src/services/conversationService');
const { _internals: { normalizarInterpretacion } } = require('../src/services/aiInterpreter');
const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
const mensaje = 'Hola buen día\nUstedes manejan este medicamento?\nStonorgyl 10\n1/4 de tableta cada 24hr por 6 días\nSolo necesito dos pastas';
test('mencion literal separa identidad de pauta y conserva cantidad comercial', () => {
  const catalogo = require('../productos.json').filter(m => m.marca === 'STOMORGYL');
  const lectura = normalizarInterpretacion({ intencion: 'consulta_producto', accion: 'consultar',
    producto: { mencionOriginal: 'Stonorgyl 10', referencia: 'Stonorgyl 10', cantidad: 2 } });
  const literal = mencionProductoRespaldada(lectura.producto, mensaje, catalogo);
  assert.equal(literal, 'Stonorgyl 10');
  assert.equal(lectura.producto.cantidad, 2);
  assert.equal(lectura.accion, 'consultar');
  const validacion = validarCoincidenciaProducto({ mensaje: literal, catalogo,
    clasificacion: { intencion: 'busqueda_producto', perfilContexto: 'pedido' } });
  assert.equal(validacion.nivel, 'alta');
  assert.equal(validacion.coincidencia.referencia, 'STOMORGYL');
  assert.equal(validacion.presentacionSolicitada, null); // No inventa mg desde el numero del nombre.
});
test('mencion literal funciona con cualquier nombre y no acepta sustituciones inventadas', () => {
  const catalogo = [{marca:'PRUEBA',referencias:[{nombre:'PRUEBA JUNIOR'},{nombre:'PRUEBA ADULTO'}]}];
  assert.equal(mencionProductoRespaldada({mencionOriginal:'PRUEBA JUNIOR'},
    'Tienes PRUEBA JUNIOR? Lo necesito mañana, 2 paquetes.', catalogo), 'PRUEBA JUNIOR');
  assert.equal(mencionProductoRespaldada({mencionOriginal:'PRUEBA ADULTO'},
    'Tienes PRUEBA JUNIOR?', catalogo), null);
  assert.equal(mencionProductoRespaldada({mencionOriginal:'PRUEBA'},
    'Tienes PRUEBA JUNIOR?', catalogo), null);
});

test('recuperacion conserva nombres con una errata antes de validar identidad', () => {
  const { _internals: { seleccionarCatalogoLocal } } = require('../src/services/catalogContextService');
  for (const [nombre,consulta] of [['STOMORGYL','Stonorgyl 10'], ['MARCAPRUEBA','marcaprueva 10']]) {
    const catalogo = [{marca:nombre,referencias:[{nombre,presentaciones:[{peso:'10mg',precio:5800}]}]}];
    const candidatos = seleccionarCatalogoLocal({catalogo,mensaje:consulta,
      clasificacion:{intencion:'busqueda_producto',perfilContexto:'pedido',requiereBusquedaProducto:true}});
    assert.equal(candidatos.catalogo[0]?.referencias[0]?.nombre,nombre);
  }
});
