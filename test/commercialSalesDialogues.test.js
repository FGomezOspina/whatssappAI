const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('../scripts/evaluation/sales-dialogue-harness');
const corpus=require('../docs/reports/sales-continuity-2026-11-05/sales-replay-v1.json');
const snapshot=require('../docs/reports/real-conversations-2026-10-30/catalog.json');
const source=require('../docs/reports/real-conversations-2026-10-30/today-corpus-v2.json');
const other={intencion:'otro',accion:null,confianza:.9,consultaCatalogo:{necesaria:false},continuarFlujo:false};
test('T02 identidad omitida se ancla a cotizacion unica y valida nueva presentacion',async()=>{
  const c=corpus.cases.find(c=>c.id==='T02-pack-correction');
  const captured=require('../docs/reports/sales-continuity-2026-11-05/T02-omitted-identity-v1.json');
  const mapper=require('../docs/reports/sales-continuity-2026-11-05/T02-interpretations-v1.json').interpretations.find(i=>!i.router).result;
  const h=local(c,async a=>structuredClone(a.clasificacion.decisionHerramientas?captured.interpretations[0].result:mapper));
  const r=await h.send(captured.text);
  assert.equal(r.state.carrito.length,1,r.response);assert.equal(r.state.carrito[0].peso,'1kg');assert.equal(r.state.carrito[0].cantidad,2);
});
test('preferencia no verificada no reemplaza SKU ni deriva por cantidad pendiente',async()=>{
  const c=structuredClone(corpus.cases.find(c=>c.id==='T02-pack-correction'));
  c.initialState={carrito:[{marca:'EXCELLENT',referencia:'EXCELLENT GATO ADULT',peso:'1kg',cantidad:2,precio:31000}],
    ultimaSolicitudProductos:[{marca:'CHURU',referencia:'CHURU',estado:'pendiente',campoPendiente:'cantidad_unidades',pregunta:'¿Cuántas unidades quieres?'}]};
  const h=local(c,async()=>({...other,intencion:'pedido_producto',accion:'agregar',seguimientoProducto:'aclaracion',
    producto:{marca:'CHURU',referencia:'CHURU',cantidad:null,condiciones:['no morrado']},consultaCatalogo:{necesaria:true,consulta:'CHURU'}}));
  for(const text of ['Que no sea morrado','Porfa']){
    const r=await h.send(text);assert.match(r.response,/Cuántas unidades/);assert.doesNotMatch(r.response,/asesor/);
    assert.equal(r.state.carrito.length,1);assert.equal(r.state.carrito[0].cantidad,2);
  }
  assert.deepEqual(h.state().ultimaSolicitudProductos[0].preferenciasNoVerificadas,['Que no sea morrado']);
});
test('compra de presentacion no cotizada no se degrada en revision de carrito vacio',async()=>{
  const c=corpus.cases.find(c=>c.id==='T02-pack-correction');
  const captured=require('../docs/reports/sales-continuity-2026-11-05/T02-revision-interpretations-v1.json');
  const h=local(c,async a=>structuredClone(captured.interpretations[a.clasificacion.revisionOperacion?1:a.clasificacion.decisionHerramientas?0:2].result));
  const r=await h.send(captured.text);
  assert.equal(r.state.carrito.length,1,r.response);
  assert.equal(r.state.carrito[0].peso,'1kg');assert.equal(r.state.carrito[0].cantidad,2);
  assert.doesNotMatch(r.response,/\[precio/);
});
test('paquete de venta unitaria sin numero de unidades pide cantidad y conserva carrito',async()=>{
  const c=structuredClone(corpus.cases.find(c=>c.id==='T02-pack-correction'));
  c.initialState={carrito:[{marca:'EXCELLENT',referencia:'EXCELLENT GATO ADULT',peso:'1kg',cantidad:2,precio:31000}]};
  const captured=require('../docs/reports/sales-continuity-2026-11-05/T02-package-interpretations-v1.json');
  const h=local(c,async a=>structuredClone(captured.interpretations.find(i=>i.router===!!a.clasificacion.decisionHerramientas).result));
  const r=await h.send(captured.text);
  assert.equal(r.state.carrito.length,1,r.response);assert.equal(r.state.carrito[0].cantidad,2);
  assert.match(r.response,/Cuántas unidades/);assert.match(r.response,/EXCELLENT/);
  assert.equal(r.state.ultimaSolicitudProductos.at(-1).estado,'pendiente');
});
test('T02 reproduce salida real OpenAI: recuperacion contextual no pisa dos unidades de 1kg',async()=>{
  const c=corpus.cases.find(c=>c.id==='T02-pack-correction');
  const captured=require('../docs/reports/sales-continuity-2026-11-05/T02-interpretations-v1.json');
  const h=local(c,async a=>structuredClone(captured.interpretations.find(i=>i.router===!!a.clasificacion.decisionHerramientas).result));
  const r=await h.send(captured.text);
  assert.equal(r.state.carrito.length,1,r.response);
  assert.equal(r.state.carrito[0].peso,'1kg',r.response);
  assert.equal(r.state.carrito[0].cantidad,2,r.response);
});
function local(c,interpreter){return createHarness({catalogo:snapshot.filter(b=>c.catalogBrands.includes(b.marca)),
  initialState:c.initialState,history:c.history,interpreter});}
test('T02 contexto comercial: dos de kilo sustituye cotizacion de 3kg; Churu no resuelto no borra alimento',async()=>{
  const c=corpus.cases.find(c=>c.id==='T02-pack-correction');
  const h=local(c,async({mensaje})=>mensaje===c.turns[0].text?{...other,intencion:'pedido_producto',accion:'agregar',
    producto:{marca:'EXCELLENT',referencia:'EXCELLENT GATO ADULT',presentacion:'1kg',cantidad:2},consultaCatalogo:{necesaria:true,consulta:'EXCELLENT GATO ADULT 1kg'}}:
    {...other,respuestaConversacional:'¿Qué sabor y presentación de Churu necesitas?'});
  for(const turn of c.turns)await h.send(turn.text);
  assert.equal(h.state().carrito.length,1);
  assert.equal(h.state().carrito[0].peso,'1kg');assert.equal(h.state().carrito[0].cantidad,2);
  assert.equal(h.state().carrito[0].precio,31000);
  assert.equal(h.state().pedidoConfirmado,false);
  // Clarification is supplied by a semantic double; no claim about audio or color inference.
});
test('C05 solicitud real y cierre sintetico: 2 bultos, direccion, factura y confirmacion aislada',async()=>{
  const c=corpus.cases.find(c=>c.id==='C05-litter-order');
  const h=local(c,async({mensaje})=>mensaje===c.turns[0].text?{...other,intencion:'pedido_producto',accion:'agregar',
    producto:{marca:'ARENA KING CAT',referencia:'ARENA KING CAT',presentacion:'25kg',cantidad:2},
    entrega:{tipo:'domicilio'},consultaCatalogo:{necesaria:true,consulta:'ARENA KING CAT 25kg'}}:other);
  for(const [i,turn]of c.turns.entries()){
    const r=await h.send(turn.text);
    assert.equal(r.state.carrito.length,1);assert.equal(r.state.carrito[0].cantidad,2);
    assert.equal(r.state.carrito[0].precio,62900);
    assert.equal(r.state.pedidoConfirmado,i===c.turns.length-1);
    if(i===2){assert.match(r.response,/cedula o NIT/);assert.match(r.response,/correo/);}
    if(i===3){assert.match(r.response,/Calle 10 # 20-30/);assert.match(r.response,/125\.800/);}
  }
});
for(const id of ['T01','T03'])test(`${id}: cotizacion y consulta/cortesia no seleccionan alternativas`,async()=>{
  const chat=source.chats.find(c=>c.id===id);
  const h=createHarness({catalogo:[],history:chat.sequence.filter(m=>m.text).map(m=>({role:m.direction==='customer'?'user':'assistant',content:m.text})),
    interpreter:async()=>({...other,respuestaConversacional:'Conservo la consulta.'})});
  for(const m of chat.sequence.filter(m=>m.direction==='customer'&&m.text)){
    const r=await h.send(m.text);assert.equal(r.state.carrito.length,0);assert.equal(r.state.pedidoConfirmado,false);
  }
});
test('harness aislado no comparte carrito ni datos entre clientes',async()=>{
  const c=corpus.cases.find(c=>c.id==='C05-litter-order');
  const h1=local(c,async()=>other),h2=local(c,async()=>other);
  await h1.send('Calle 10 # 20-30');
  assert.ok(h1.state().datosDomicilio.direccion);assert.equal(h2.state().datosDomicilio.direccion,undefined);
  assert.equal(h2.history().length,0);
});
