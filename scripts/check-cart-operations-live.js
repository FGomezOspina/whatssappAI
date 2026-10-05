// Evaluacion optativa: interprete real, sin Supabase ni envios WhatsApp.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const { interpretarMensajeCliente } = require('../src/services/aiInterpreter');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { resolverOperacionCarritoIA } = require('../src/verticals/petshop/orderLogic');
const fixture = require('../test/fixtures/cart-removal-real-interpretation.json');
const casos = require('../test/fixtures/cart-operation-language.json');
(async () => {
 const resultados = [];
 for (const caso of casos) {
  const carrito = structuredClone(fixture.carrito);
  const target = carrito[caso.target === 'arena' ? 3 : 0];
  if (caso.inicial) target.cantidad = caso.inicial;
  const estado = { ...crearEstadoInicial(), carrito, ultimaSolicitudProductos: carrito.map(p => ({ estado:'identificado', accion:'consultar', cotizacion:[p] })) };
  if (caso.contextual) estado.ultimaSeleccion = { ...target, presentacion: target.peso };
  if (caso.ordinal) estado.referenciasPendientes = { opciones:[carrito[3],carrito[0],carrito[1]].map(p=>({...p,presentaciones:[{peso:p.peso}]})),turnosRestantes:3 };
  const antes = structuredClone(estado.carrito);
  if(caso.cotizacion) {estado.carrito=[];estado.productosConsultados=structuredClone(carrito);}
  const historialReciente = caso.targets ? [{direction:'inbound',body:'1 kg Excellent Urinary gatos, 3 latas de Vet Solution Urinary, 1 lata de Vet Solution Gastro gatos, 1 Arena x 8 kg Kitten talco'}] : [];
  let decision = await interpretarMensajeCliente({ mensaje:caso.mensaje, estado, catalogo:[], historialReciente,
   clasificacion:{decisionHerramientas:true,perfilContexto:'pedido',limiteHistorial:12},
   model:process.env.OPENAI_ROUTER_MODEL || 'gpt-5.4' });
  if(decision) decision = await interpretarMensajeCliente({ mensaje:caso.mensaje, estado, catalogo:[], historialReciente,
   clasificacion:{decisionHerramientas:true,perfilContexto:'pedido',revisionOperacion:decision},
   model:process.env.OPENAI_ROUTER_MODEL || 'gpt-5.4' });
  let esperado = antes;
  const indice = caso.target === 'arena' ? 3 : 0;
  if(caso.accion==='quitar') esperado=antes.filter((_,i)=>!(caso.targets || [indice]).includes(i));
  if(caso.accion==='mantener_solo') esperado=antes.filter((_,i)=>(caso.targets || [indice]).includes(i));
  if(['agregar','modificar_cantidad'].includes(caso.accion)) esperado=antes.map((p,i)=>i===indice?{...p,cantidad:caso.cantidadObjetivo??p.cantidad+caso.cantidadDelta}:p).filter(p=>p.cantidad>0);
  const estadoOperacion=caso.cotizacion?{...estado,carrito:structuredClone(antes)}:estado;
  if(decision) resolverOperacionCarritoIA(caso.mensaje,estadoOperacion,[],decision);
  const ok=JSON.stringify(estadoOperacion.carrito)===JSON.stringify(esperado);
  resultados.push({mensaje:caso.mensaje,ok,decision});
  console.log(JSON.stringify({mensaje:caso.mensaje,ok,accion:decision?.accion,carrito:decision?.carrito}));
 }
 if(process.argv[2]) fs.writeFileSync(process.argv[2],JSON.stringify(resultados,null,2));
 console.log(JSON.stringify({total:resultados.length,passed:resultados.filter(r=>r.ok).length}));
 if(resultados.some(r=>!r.ok)) process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
