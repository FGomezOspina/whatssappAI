const test=require('node:test'),assert=require('node:assert/strict');
const {reviewPayload}=require('../scripts/evaluation/sales-payload-privacy');
const {createHarness}=require('../scripts/evaluation/sales-dialogue-harness');
const payload=text=>({model:'configured-model',messages:[{role:'user',content:text}]});
test('payload permite solo datos sinteticos revisados, sin identificadores de origen',()=>{
  assert.equal(reviewPayload(payload('Cliente Prueba, 3000000000, prueba@example.com')).privateSourceMatch,false);
  for(const text of ['3111234567','persona@real.invalid','wamid.secret','data:image/png;base64,x','Bearer secret'])
    assert.throws(()=>reviewPayload(payload(text)));
});
test('payload rechaza valores privados y secretos aunque no parezcan telefonos',()=>{
  assert.throws(()=>reviewPayload(payload('Ubicacion privada exacta'),{forbidden:['Ubicacion privada exacta']}));
  assert.throws(()=>reviewPayload(payload('key-private-value'),{secrets:['key-private-value']}));
});
test('harness entrega historial con esquema real, roles correctos y sin turno actual duplicado',async()=>{
  const calls=[];
  const h=createHarness({catalogo:[],history:[{role:'user',content:'Cotiza producto'},{role:'assistant',content:'Cotizacion previa'}],
    interpreter:async a=>{calls.push(structuredClone(a.historialReciente));return {intencion:'otro',accion:null,confianza:1,
      consultaCatalogo:{necesaria:false},continuarFlujo:false,respuestaConversacional:'Respuesta local'};}});
  await h.send('primer turno');await h.send('segundo turno');
  assert.deepEqual(calls[0],[{direction:'inbound',body:'Cotiza producto'},{direction:'outbound',body:'Cotizacion previa'}]);
  assert.deepEqual(calls[1].map(m=>m.body),['Cotiza producto','Cotizacion previa','primer turno','Respuesta local']);
  assert.equal(calls[1].some(m=>m.body==='segundo turno'),false);
});
