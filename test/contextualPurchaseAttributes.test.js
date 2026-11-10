const test=require('node:test'),assert=require('node:assert/strict');
const {resolverCompraContextual}=require('../src/services/activeProductSelectionService');
function state(){return {carrito:[],productosConsultados:[{marca:'ALFA',referencia:'ALFA ADULTO',peso:'3kg',precio:50,cantidad:1}]};}
test('compra contextual conserva una cantidad nueva del mismo SKU',()=>{
  const r=resolverCompraContextual('me envias dos', {accion:'agregar',compraContextual:'foco',producto:{marca:'ALFA',referencia:'ALFA ADULTO',presentacion:'3kg',cantidad:2}},state());
  assert.equal(r[0].cantidad,2);
});
test('nueva presentacion vuelve a validacion, no copia precio ni peso anteriores',()=>{
  const r=resolverCompraContextual('me envias dos de kilo', {accion:'agregar',compraContextual:'foco',producto:{marca:'ALFA',referencia:'ALFA ADULTO',presentacion:'1kg',cantidad:2}},state());
  assert.equal(r,null);
});
test('otra referencia explicita no hereda el foco previo',()=>{
  const r=resolverCompraContextual('me envias el cachorro',{accion:'agregar',compraContextual:'foco',producto:{marca:'ALFA',referencia:'ALFA CACHORRO',presentacion:'3kg',cantidad:1}},state());
  assert.equal(r,null);
});
test('paquete declarado por catalogo no se convierte en venta suelta',()=>{
  const {empaqueUnitarioSinCantidad}=require('../src/utils/catalogCommercialRules');
  const cat=[{marca:'BETA',referencias:[{nombre:'BETA PACK',metadata:{},presentaciones:[{peso:'6und'}]}]}];
  assert.equal(empaqueUnitarioSinCantidad('un paquete BETA PACK',{marca:'BETA',referencia:'BETA PACK'},cat),null);
});
