const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
const catalogo = [{ marca:'MARCA AJENA', referencias:[{nombre:'REFERENCIA AJENA',especie:'perro',presentaciones:[{peso:'2kg',precio:10000}]}]}];

test('una pregunta de precio sin producto resuelto no lo convierte en marca ni ofrece catalogo', () => {
  for (const mensaje of ['precio', 'Que precio tiene?', '¿Cuánto cuesta?']) {
    const estado=crearEstadoInicial();
    const respuesta=resolverConsultaCatalogo(mensaje,estado,catalogo,null);
    assert.doesNotMatch(respuesta,/no manejamos precio|MARCA AJENA|REFERENCIA AJENA|estas marcas|llama.*atenci[oó]n/i);
    assert.equal(estado.carrito.length,0);
  }
});

test('una consulta semantica sin coincidencia no sugiere marcas ajenas', () => {
  const respuesta=resolverConsultaCatalogo('valor por favor',crearEstadoInicial(),catalogo,{
    intencion:'consulta_producto',accion:'consultar',confianza:0.95,
    producto:{marca:'OTRA MARCA',referencia:'PRODUCTO SOLICITADO'},
  });
  assert.doesNotMatch(respuesta,/MARCA AJENA|REFERENCIA AJENA|estas marcas|llama.*atenci[oó]n/i);
});

test('el precio del producto identificado sigue usando el motor actual', () => {
  const estado=crearEstadoInicial();
  const respuesta=resolverConsultaCatalogo('Qué precio tiene?',estado,catalogo,{
    intencion:'consulta_producto',accion:'consultar',confianza:0.99,
    producto:{marca:'MARCA AJENA',referencia:'REFERENCIA AJENA',presentacion:'2kg'},
  });
  assert.match(respuesta,/10\.000/);
  assert.equal(estado.carrito.length,0);
});
