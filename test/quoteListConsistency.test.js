const test=require('node:test'),assert=require('node:assert/strict');
const {normalizarInterpretacion:n}=require('../src/services/aiInterpreter')._internals;
test('an all-consultation list cannot be promoted to purchase by conflicting root action',()=>{
 const source={accion:'agregar',intencion:'pedido_producto',producto:{cantidad:2},productos:[{accion:'consultar',referencia:'NUBE LATA',cantidad:2},{accion:'consultar',referencia:'NUBE POUCH',cantidad:3}],carrito:{operacion:'agregar',cantidadDelta:9}};
 const original=JSON.stringify(source),r=n(source);assert.equal(r.accion,'consultar');assert.equal(r.intencion,'consulta_producto');assert.equal(r.carrito.operacion,null);assert.equal(r.carrito.cantidadDelta,null);assert.deepEqual(r.productos.map(p=>p.cantidad),[2,3]);assert.equal(JSON.stringify(source),original);
});
test('mixed purchase and inquiry retain separate item actions',()=>{
 const r=n({accion:'agregar',productos:[{accion:'agregar',cantidad:2},{accion:'consultar',cantidad:3}],carrito:{operacion:'agregar'}});assert.equal(r.accion,'agregar');assert.deepEqual(r.productos.map(p=>p.accion),['agregar','consultar']);
});
test('explicit exclusion and incomplete item actions are not rewritten as an all-consultation list',()=>{
 for(const source of [{accion:'quitar',productos:[{accion:'consultar'},{accion:'consultar'}],carrito:{operacion:'quitar'}},{accion:'agregar',productos:[{accion:'consultar'},{}]}])assert.equal(n(source).accion,source.accion);
});
