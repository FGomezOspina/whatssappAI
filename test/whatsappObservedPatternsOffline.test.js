// Synthetic scenarios derived from observed business patterns, never copied chats.
// Run with the OS network/.env guard documented beside the corpus.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHarness } = require('../scripts/evaluation/sales-dialogue-harness');
const corpus = require('../docs/reports/offline-whatsapp-patterns-2026-11-10/synthetic-corpus.json');
const item = {marca:'FICTORA',referencia:'FICTORA ADULTO',peso:'4kg',precio:12300,cantidad:2};
const other = {intencion:'otro',accion:null,confianza:.99,consultaCatalogo:{necesaria:false},continuarFlujo:false};
function setup(kind, interpreter) {
  const initialState = kind === 'cart' ? {carrito:[structuredClone(item)]} :
    {productosConsultados:[{...item,contextoCreadoEn:new Date().toISOString()}]};
  return createHarness({catalogo:structuredClone(corpus.catalog),initialState,
    interpreter:interpreter || (async()=>({...other,respuestaConversacional:'Mantengo la consulta pendiente sin realizar cambios.'}))});
}
for(const c of corpus.cases) test(`${c.id}: ${c.pattern}; oraculo semantico manual`,async()=>{
  const h=setup(c.state), before=h.state(); const r=await h.send(c.text);
  assert.deepEqual(r.state.carrito,before.carrito,r.response);
  assert.equal(r.state.pedidoConfirmado,false,r.response);
  assert.equal(r.state.confirmacionPedidoId,null);
  assert.equal(r.state.pedidoConfirmadoPendienteGuardar,false);
  assert.equal(r.state.metodoPago,before.metodoPago);
  assert.equal(r.state.entrega.tipo,before.entrega.tipo);
});
test('P11: aplazamiento durante cierre no es confirmacion explicita',async()=>{
  const h=createHarness({catalogo:corpus.catalog,initialState:{carrito:[structuredClone(item)],esperandoConfirmacionPedido:true},
    interpreter:async()=>({...other,respuestaConversacional:'Espero tu decision.'})});
  const r=await h.send('No confirmes aun; necesito revisarlo despues.');
  assert.equal(r.state.pedidoConfirmado,false);assert.equal(r.state.carrito[0].cantidad,2);
});
test('P12: catalogo local valida presentacion y precio sinteticos sin convertir cotizacion en venta',async()=>{
  const h=setup('quote',async()=>({intencion:'consulta_producto',accion:'consultar',confianza:1,
    producto:{marca:'NUBEX',referencia:'NUBEX VEGETAL',presentacion:'12kg',cantidad:1},
    consultaCatalogo:{necesaria:true,consulta:'NUBEX VEGETAL 12kg'}}));
  const r=await h.send('Cotiza NUBEX VEGETAL de 12kg.');
  assert.equal(r.state.carrito.length,0,r.response);
  assert.match(r.response,/18\.700/);assert.match(r.response,/12\s?kg/);
  assert.equal(r.state.pedidoConfirmado,false);
});
test('P13: presentacion inexistente conserva carrito y evita precio inventado',async()=>{
  const h=setup('cart',async()=>({intencion:'consulta_producto',accion:'consultar',confianza:1,
    producto:{marca:'NUBEX',referencia:'NUBEX VEGETAL',presentacion:'99kg',cantidad:1},
    consultaCatalogo:{necesaria:true,consulta:'NUBEX VEGETAL 99kg'}}));
  const r=await h.send('¿Existe NUBEX VEGETAL en 99kg?');
  assert.deepEqual(r.state.carrito,[item],r.response);assert.equal(r.state.pedidoConfirmado,false);
  assert.match(r.response,/no tengo|no existe|no manej|presentaci/i);
});
test('P14: afirmacion de pago retoma cotizacion unica sin duplicar ni confirmar',async()=>{
  const h=setup('quote');const question=await h.send('¿Es posible pagar en efectivo?');
  assert.equal(question.state.carrito.length,0);
  const r=await h.send('Pago en efectivo');
  assert.equal(r.state.carrito.length,1,r.response);assert.equal(r.state.carrito[0].cantidad,2);
  assert.equal(r.state.carrito[0].precio,12300);assert.equal(r.state.pedidoConfirmado,false);
  const again=await h.send('Pago en efectivo');assert.equal(again.state.carrito[0].cantidad,2);
});
test('P15: prueba de aislamiento entre compradores sinteticos',async()=>{
  const a=setup('quote'),b=setup('quote');await a.send('Pago en efectivo');
  assert.equal(a.state().carrito.length,1);assert.equal(b.state().carrito.length,0);
  assert.equal(b.history().length,0);
});
test('P16: corpus tiene solo texto reescrito y catalogo ficticio, sin datos de contacto ni multimedia',()=>{
  const file=require.resolve('../docs/reports/offline-whatsapp-patterns-2026-11-10/synthetic-corpus.json');
  const data=fs.readFileSync(file,'utf8');
  assert.equal(corpus.mode,'synthetic-patterns-only');assert.equal(corpus.cases.length,10);
  assert.doesNotMatch(data,/https?:\/\/|[\w.+-]+@[\w.-]+|\b\d{7,}\b|sk-[A-Za-z0-9]/);
  assert.deepEqual(corpus.catalog.map(c=>c.marca),['FICTORA','NUBEX']);
  assert.ok(corpus.cases.every(c=>Object.keys(c).sort().join(',')==='expected,id,pattern,state,text'));
});
