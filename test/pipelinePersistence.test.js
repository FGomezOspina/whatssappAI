const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createRequire}=require('node:module');
const {contexto,crearContexto}=require('../src/services/pipelineTelemetry');
function store({fallarPedido=false}={}) {
 const file=require.resolve('../src/conversation/conversationStore'),req=createRequire(file),module={exports:{}};
 const states=[],messages=[],orders=[];
 const repo={supabaseConfigurado:()=>true,guardarConversacion:async(_u,s)=>{states.push(JSON.parse(JSON.stringify(s)));return {id:'conversation'};},guardarMensaje:async(_u,d,text)=>messages.push({d,text}),guardarPedidoConfirmado:async(_u,_c,s)=>{orders.push(s.confirmacionPedidoId);if(fallarPedido)throw Error('pedido');}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n.includes('supabaseConversationRepository')?repo:n.includes('learningRepository')?{capturarAprendizaje:async()=>{}}:req(n),module,process,console:{error(){}}});
 return {...module.exports,states,messages,orders};
}
test('respuesta generada no se escribe como enviada; se confirma después del transporte',async()=>{
 const s=store(),state=s.crearEstadoInicial();state.carrito=[{referencia:'producto',cantidad:1}];
 const ctx=crearContexto('synthetic');
 await contexto.run(ctx,()=>s.guardarConversacionPersistida('user',state,{idsEventos:['m1'],respuesta:'generada'}));
 assert.equal(s.messages.filter(m=>m.d==='outbound').length,0);
 assert.equal(state.ultimaPreguntaAsistente,null);
 assert.ok(s.states[0].mensajesProcesados.includes('m1'));
 assert.equal(s.states[0].carrito.length,1);
 await ctx.alEnviar();assert.equal(s.messages.filter(m=>m.d==='outbound').length,1);assert.equal(state.ultimaPreguntaAsistente,'generada');
});
test('fallo posterior al guardado del carrito conserva recibo y clave estable del pedido',async()=>{
 const s=store({fallarPedido:true}),state=s.crearEstadoInicial();state.carrito=[{referencia:'producto',cantidad:1}];state.pedidoConfirmado=true;state.pedidoConfirmadoPendienteGuardar=true;
 await assert.rejects(s.guardarConversacionPersistida('user',state,{idsEventos:['m1']}));
 const guardado=s.states[0];assert.ok(guardado.mensajesProcesados.includes('m1'));assert.ok(guardado.confirmacionPedidoId);
 await assert.rejects(s.guardarConversacionPersistida('user',guardado,{idsEventos:['m1']}));
 assert.equal(s.orders[0],s.orders[1]);assert.equal(s.states[1].carrito[0].cantidad,1);
});
