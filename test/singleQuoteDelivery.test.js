const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const {createRequire}=require('node:module');
const {crearEstadoInicial}=require('../src/conversation/conversationStore');
const {_internals:{seleccionarCatalogoLocal}}=require('../src/services/catalogContextService');
const {respuestaParaHistorial}=require('../src/utils/responseMessages');
function escenario({ambigua=false,consulta=false}={}) {
 const producto={marca:'BR CAT',referencia:'BR CAT SALMON CASTRADO',peso:'x 3kg',precio:81900,cantidad:1};
 const catalogo=require('../productos.json').filter(m=>m.marca==='BR CAT');
 let estado={...crearEstadoInicial(),productosConsultados:[producto,...(ambigua?[{...producto,peso:'x 1kg',precio:28000}]:[])]};
 const archivo=require.resolve('../src/services/conversationService'),req=createRequire(archivo),module={exports:{}};
 const mocks={
 './clients.service':{obtenerClienteActual:async()=>({id:'synthetic',vertical:'petshop'})},
 '../conversation/conversationStore':{obtenerConversacionPersistida:async()=>JSON.parse(JSON.stringify(estado)),obtenerHistorialRecientePersistido:async()=>[],guardarConversacionPersistida:async(_id,s)=>{estado=JSON.parse(JSON.stringify(s));}},
 '../repositories/trainingExampleRepository':{obtenerEjemplosEntrenamiento:async()=>[]},
 './catalogContextService':{seleccionarCatalogoParaIA:async a=>seleccionarCatalogoLocal({catalogo,mensaje:a.mensajeOriginal,clasificacion:a.clasificacion})},
 './aiInterpreter':{interpretarMensajeCliente:async a=>a.clasificacion.decisionHerramientas?{
 intencion:consulta?'consulta_producto':'datos_envio',accion:consulta?'consultar':null,confianza:.99,continuarFlujo:true,consultaCatalogo:{necesaria:false},
 producto:null,entrega:{tipo:'domicilio',...(a.mensaje.includes('@')?{direccion:'Mz 1 cs 19 sakabuma',metodoPago:'transferencia bancaria'}:{})},
 datosCliente:a.mensaje.includes('@')?{nombre:'Fabio',cedula:'10045454',celular:'312414531',correo:'fabio@gmal.com'}:{},
 }:{intencion:'consulta_producto',accion:'consultar',confianza:.99,producto:{...producto,presentacion:producto.peso}}},
 './humanizer':{humanizarRespuesta:async(_m,base)=>base},
 };
 vm.runInNewContext(fs.readFileSync(archivo,'utf8'),{module,require:n=>mocks[n]||req(n),process,console:{log(){},error(){}}});
 return {estado:()=>estado,enviar:async text=>respuestaParaHistorial(await module.exports.responderEventoEntrante({channelUserId:'synthetic',text}))};
}
const datos='fabio\n10045454\n312414531\nfabio@gmal.com\nmz 1 cs 19 sakabuma\ntransferencia';
test('envío clasificado como datos_envio materializa la cotización única y conserva pedido al recargar',async()=>{
 const caso=escenario();const primera=await caso.enviar('me lo envias por favor');
 assert.equal(caso.estado().carrito.length,1,primera);assert.equal(caso.estado().carrito[0].precio,81900);
 const segunda=await caso.enviar(datos);assert.equal(caso.estado().carrito.length,1,segunda);
 assert.equal(caso.estado().carrito[0].cantidad,1);assert.match(segunda,/81\.900/);
 assert.doesNotMatch(segunda,/Qué productos y cantidades/);assert.equal(caso.estado().datosDomicilio.nombre,'Fabio');
});
test('datos posteriores recuperan cotización individual aunque el turno anterior no haya llenado carrito',async()=>{
 const caso=escenario();const respuesta=await caso.enviar(datos);
 assert.equal(caso.estado().carrito.length,1,respuesta);assert.match(respuesta,/81\.900/);
});
test('envío no elige entre presentaciones ambiguas ni convierte una consulta en compra',async()=>{
 for(const opciones of [{ambigua:true},{consulta:true}]){const caso=escenario(opciones);await caso.enviar('¿Qué costo tiene el domicilio?');assert.equal(caso.estado().carrito.length,0);}
});
