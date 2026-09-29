const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {crearEstadoInicial} = require('../src/conversation/conversationStore');
const {resolverConsultaCatalogo} = require('../src/verticals/petshop/orderLogic');
const {_internals:{seleccionarCatalogoLocal}} = require('../src/services/catalogContextService');

for(const marca of ['STOMORGYL','PRODUCTOPRUEBA']) test(`aceptar cotizacion recupera identidad y dos unidades en busqueda real: ${marca}`,async()=>{
  const catalogo=[{marca,referencias:[{nombre:marca,especie:'otro',categoria:'medicamento',requiere_confirmacion:true,
    presentaciones:[{peso:'10mg',precio:5800},{peso:'2mg',precio:2700}]}]}];
  const producto={marca,referencia:marca,presentacion:'10mg',cantidad:2};
  let estado=crearEstadoInicial();
  resolverConsultaCatalogo(`${marca} 10mg`,estado,catalogo,{intencion:'consulta_producto',accion:'consultar',confianza:1,producto});
  estado.ultimaPreguntaAsistente=`Sí, ${marca} 10mg a $5.800 c/u; dos son $11.600.`;
  estado=JSON.parse(JSON.stringify(estado));
  const file=require.resolve('../src/services/conversationService'),req=createRequire(file),mod={exports:{}};
  let busquedas=0;
  const mocks={
    './clients.service':{obtenerClienteActual:async()=>({id:'quote-test',vertical:'petshop'})},
    '../conversation/conversationStore':{obtenerConversacionPersistida:async()=>estado,
      obtenerHistorialRecientePersistido:async()=>[],guardarConversacionPersistida:async(_id,s)=>{estado=JSON.parse(JSON.stringify(s));}},
    '../repositories/trainingExampleRepository':{obtenerEjemplosEntrenamiento:async()=>[]},
    './catalogContextService':{seleccionarCatalogoParaIA:async args=>{
      busquedas++;
      // Ejecutar el filtro por mensajeOriginal: un mock que devuelve siempre
      // el catalogo correcto oculta la regresion de la frase de envio.
      return seleccionarCatalogoLocal({catalogo,mensaje:args.mensajeOriginal,clasificacion:args.clasificacion});
    }},
    './aiInterpreter':{interpretarMensajeCliente:async args=>args.clasificacion.decisionHerramientas
      ? {intencion:'pedido_producto',accion:'agregar',confianza:0.95,producto:{},consultaCatalogo:{necesaria:true,consulta:`${marca} 10mg`},entrega:{tipo:'domicilio'}}
      : {intencion:'consulta_producto',accion:'consultar',confianza:0.95,producto:{...producto,cantidad:1}}},
    './humanizer':{humanizarRespuesta:async(_m,base)=>base},
  };
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,require:n=>mocks[n]||req(n),process,console:{log(){},error(){}}});
  const respuesta=await mod.exports.responderEventoEntrante({channelUserId:'quote-test',text:'Me lo envias por favor'});
  assert.equal(busquedas,1);
  assert.equal(estado.carrito.length,1,respuesta);
  assert.equal(estado.carrito[0].referencia,marca);
  assert.equal(estado.carrito[0].cantidad,2,respuesta);
  assert.match(respuesta,/11\.600/);
  assert.doesNotMatch(respuesta,/No encuentro/);
});
