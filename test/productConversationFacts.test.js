const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
const { consolidarCatalogo } = require('../src/services/catalogConsolidationService');

const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'pedido' };
function catalogo(marca = 'NUTRIPRUEBA') {
  return [{ marca, referencias: [
    { nombre: marca, especie: 'perro', categoria: 'comida', presentaciones: [
      { peso: '10kg', precio: 40000 }, { peso: '30 kg', precio: 103000 }] },
    { nombre: `${marca} GATOS`, especie: 'gato', categoria: 'comida', presentaciones: [
      { peso: '500gr', precio: 4000 }, { peso: '8kg', precio: 61500 }] },
  ] }];
}

test('marcas arbitrarias mantienen especie y presentaciones separadas desde consolidacion a validacion', () => {
  for (const marca of ['NUTRIPRUEBA', 'OTRAMARCA']) {
    const productos = consolidarCatalogo(catalogo(marca));
    const validar = mensaje => validarCoincidenciaProducto({ mensaje, catalogo: productos,
      catalogoCandidatos: productos, clasificacion });
    const perro = validar(`${marca} 30kg`);
    assert.equal(perro.nivel, 'alta');
    assert.equal(perro.coincidencia.referencia, marca);
    assert.deepEqual(perro.coincidencia.presentaciones.map(p => p.precio), [103000]);
    const gato = validar(`${marca} gatos 30kg`);
    assert.equal(gato.presentacionValida, false);
    assert.deepEqual(gato.coincidencia.presentaciones.map(p => p.precio), [4000, 61500]);
    const ambiguo = validar(`por favor un bulto de ${marca} para calle 20 Pereira con domicilio`);
    for (const opcion of ambiguo.alternativas) {
      const esGato = opcion.referencia.includes('GATOS');
      assert.ok(opcion.presentaciones.every(p => (esGato ? [4000, 61500] : [40000, 103000]).includes(p.precio)));
    }
  }
});

function humanizador(respuestas, solicitudes) {
  const archivo = require.resolve('../src/services/humanizer');
  const localRequire = createRequire(archivo);
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    require: name => name === 'openai' ? class {
      chat = { completions: { create: async request => {
        solicitudes.push(request);
        const respuesta = respuestas.shift();
        if (respuesta instanceof Error) throw respuesta;
        return { choices: [{ message: { content: respuesta } }] };
      } } };
    } : localRequire(name), module: modulo, process: { env: { OPENAI_API_KEY: 'synthetic' } }, console,
  });
  return modulo.exports.humanizarRespuesta;
}

test('redaccion exacta usa prosa de IA sin exigir encabezados ni lineas de ficha', async () => {
  const solicitudes = [];
  const respuestaIA = 'Tenemos NUTRIPRUEBA de 30 kg a $103.000. Falta verificar el costo del domicilio.';
  const redactar = humanizador([respuestaIA], solicitudes);
  const productos = catalogo();
  const hechos = validarCoincidenciaProducto({ mensaje: 'NUTRIPRUEBA 30kg', catalogo: productos,
    catalogoCandidatos: productos, clasificacion });
  const resultado = await redactar('Quiero un bulto, ¿cuánto con domicilio?',
    'Opción exacta:\nNUTRIPRUEBA 30 kg\nPrecio: $103.000', {
      productoAutonomo: hechos, clasificacion, estado: {}, interpretacionIA: { accion: 'consultar' },
    });
  assert.equal(resultado, respuestaIA);
  assert.equal(solicitudes.length, 1);
});

test('coincidencia incierta pregunta un atributo sin precios ni plantilla como respaldo', async () => {
  const solicitudes = [];
  const redactar = humanizador(['¿Lo necesitas para perro o para gato?'], solicitudes);
  const respuesta = await redactar('¿Tienes nutriprueba?', 'Tengo esta opción cercana: 30kg: $103.000', {
    productoAutonomo: { nivel: 'media', aclaracion: { campo: 'especie', valores: ['perro', 'gato'] },
      alternativas: [{ marca: 'NUTRIPRUEBA', referencia: 'NUTRIPRUEBA', presentaciones: [{ peso: '30kg', precio: 103000 }] }] },
    estado: {}, clasificacion,
  });
  assert.equal(respuesta, '¿Lo necesitas para perro o para gato?');
  const contexto = JSON.parse(solicitudes[0].messages[1].content);
  assert.equal(contexto.hechosOperativos, null);
  assert.doesNotMatch(JSON.stringify(contexto), /103000|103\.000|opción cercana/);
});

test('rechaza precios inventados y devuelve el precio verificado si ambas redacciones fallan', async () => {
  const solicitudes = [];
  const redactar = humanizador(['NUTRIPRUEBA 30kg cuesta $9.000.', 'NUTRIPRUEBA 30kg cuesta $8.000.'], solicitudes);
  const productos = catalogo();
  const hechos = validarCoincidenciaProducto({ mensaje: 'NUTRIPRUEBA 30kg', catalogo: productos,
    catalogoCandidatos: productos, clasificacion });
  assert.equal(await redactar('NUTRIPRUEBA 30kg', 'Precio: $103.000', {
    productoAutonomo: hechos, estado: {}, clasificacion,
  }), 'Precio: $103.000');
  assert.equal(solicitudes.length, 2);
});

test('mensaje con direccion y transferencia valida la consulta de producto separada de logistica', async () => {
  const { crearEstadoInicial } = require('../src/conversation/conversationStore');
  const archivo = require.resolve('../src/services/conversationService');
  const localRequire = createRequire(archivo);
  const estado = crearEstadoInicial();
  const productos = catalogo();
  // Synthetic food form is explicit; this test concerns logistics, not unknown packaging.
  for (const marca of productos) for (const ref of marca.referencias) ref.subcategoria = 'concentrado';
  const redacciones = [];
  const solicitudesRedaccion = [];
  const redactar = humanizador([
    'El NUTRIPRUEBA de 30 kg cuesta $103.000. Falta verificar el valor del domicilio.',
    'El NUTRIPRUEBA de 30 kg cuesta $103.000.',
  ], solicitudesRedaccion);
  const lectura = { intencion: 'pedido_producto', accion: 'agregar', confianza: 0.99,
    consultaCatalogo: { necesaria: true, consulta: 'precio y disponibilidad de 1 bulto de cuido alimento NUTRIPRUEBA presentacion 30 kilos y costo de comida alimento concentrado' },
    producto: { marca: 'NUTRIPRUEBA', referencia: 'NUTRIPRUEBA', presentacion: '30kg', cantidad: 1 },
    entrega: { tipo: 'domicilio', direccion: 'Calle 30 # 4-39 Pereira', metodoPago: 'transferencia bancaria' },
  };
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'tenant-test', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async () => {} },
    './aiInterpreter': { interpretarMensajeCliente: async args => args.clasificacion.decisionHerramientas
      ? structuredClone(lectura)
      : { ...structuredClone(lectura), intencion: 'consulta_producto', accion: 'consultar', entrega: {} } },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo: productos, metadata: {} }) },
    './humanizer': { humanizarRespuesta: async (_mensaje, base, opciones) => { redacciones.push(opciones); return redactar(_mensaje, base, opciones); } },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: name => mocks[name] || localRequire(name),
    module: modulo, process, console: { log() {}, error() {} } });
  const respuestaCompra = await modulo.exports.responderEventoEntrante({ channelUserId: 'usuario-test',
    text: 'por favor un bulto de cuido nutriprueba de 30 kilos, para calle 30 nro 4-39 Pereira. Cuanto con domicilio? Para pagar por transferencia, gracias' });
  assert.equal(redacciones.at(-1).productoAutonomo.nivel, 'alta');
  assert.equal(redacciones.at(-1).productoAutonomo.coincidencia.referencia, 'NUTRIPRUEBA');
  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].precio, 103000);
  assert.equal(estado.carrito[0].referencia, 'NUTRIPRUEBA');
  assert.equal(estado.datosDomicilio.direccion, lectura.entrega.direccion);
  const { dividirRespuestaMensajes } = require('../src/utils/responseMessages');
  const mensajes = dividirRespuestaMensajes(respuestaCompra);
  assert.equal(mensajes.length, 2);
  assert.match(mensajes[0], /Datos para transferencia/);
  assert.match(mensajes[0], /07300007105/);
  assert.match(mensajes[0], /127200128222/);
  assert.match(mensajes[0], /@luzg5604/);
  assert.doesNotMatch(mensajes[0], /NUTRIPRUEBA/);
  assert.match(mensajes[1], /^El NUTRIPRUEBA de 30 kg cuesta/);
  assert.doesNotMatch(mensajes[1], /cedula/);
  assert.doesNotMatch(mensajes[1], /correo/);
  assert.match(mensajes[1], /celular/);
  assert.match(mensajes[1], /nombre/);
  assert.doesNotMatch(mensajes[1], /opción exacta|Datos para transferencia|- direccion|- método de pago/);
  assert.equal(estado.esperandoDatosDomicilio, true);
  assert.equal(estado.pedidoConfirmado, false);

  // Recover a conversation whose old clarification stored logistics as identity.
  estado.ultimaConsultaProducto = { ...estado.ultimaConsultaProducto,
    terminos: ['disponibilidad', 'bulto', 'alimento', 'nutriprueba', 'presentacion', 'costo', 'nro', 'pereira'],
    aclaracion: { campo: 'referencia', valores: ['NUTRIPRUEBA', 'NUTRIPRUEBA GATOS'] } };
  lectura.accion = 'consultar';
  lectura.intencion = 'consulta_producto';
  lectura.consultaCatalogo.consulta = 'precio de alimento concentrado marca NUTRIPRUEBA presentacion 30 kilos comida alimento concentrado';
  await modulo.exports.responderEventoEntrante({ channelUserId: 'usuario-test',
    text: 'Si por favor, cuanto vale el cuido?' });
  assert.equal(redacciones.at(-1).productoAutonomo.nivel, 'alta');
  assert.equal(redacciones.at(-1).productoAutonomo.coincidencia.referencia, 'NUTRIPRUEBA');
  assert.equal(estado.carrito.length, 1);

});

test('reintento de aclaracion recibe el rechazo concreto y la respuesta que debe corregir', async () => {
  const solicitudes = [];
  const redactar = humanizador(['Te ayudo a identificarlo.', '¿Para qué especie lo necesitas?'], solicitudes);
  const respuesta = await redactar('Cuanto vale el cuido?', '', {
    productoAutonomo: { nivel: 'media', presentacionSolicitada: '30kg', terminos: ['nutriprueba'],
      aclaracion: { campo: 'especie', valores: ['perro', 'gato'] } }, estado: {}, clasificacion,
  });
  assert.equal(respuesta, '¿Para qué especie lo necesitas?');
  assert.match(solicitudes[1].messages.at(-1).content, /falta_pregunta_de_aclaracion/);
  assert.equal(solicitudes[1].messages.at(-2).content, 'Te ayudo a identificarlo.');
  const contexto = JSON.parse(solicitudes[0].messages[1].content);
  assert.equal(contexto.resultado.presentacionSolicitada, '30kg');
});

test('la redaccion natural no elimina el resumen ni el avance tras agregar un producto', async () => {
  const solicitudes = [];
  const intro = 'El NUTRIPRUEBA de 30 kg cuesta $103.000.';
  const redactar = humanizador([intro], solicitudes);
  const productos = catalogo();
  const hechos = validarCoincidenciaProducto({ mensaje: 'NUTRIPRUEBA 30kg', catalogo: productos,
    catalogoCandidatos: productos, clasificacion });
  const cierre = 'Pedido:\n- 1 x NUTRIPRUEBA 30 kg: $103.000\nTotal: $103.000\n\n¿Quieres agregar algo más o avanzamos con la entrega?';
  const respuesta = await redactar('Me das un bulto de 30kg', `Producto NUTRIPRUEBA 30 kg: $103.000\n\n${cierre}`, {
    productoAutonomo: hechos, estado: { carrito: [{}] }, clasificacion,
    interpretacionIA: { accion: 'agregar' },
  });
  assert.equal(respuesta, `${intro}\n\n${cierre}`);
});

test('aclaracion de referencia rechaza pregunta al aire y conserva opciones de catalogo', async () => {
  const solicitudes = [];
  const buena = '¿Necesitas NUTRIALFA PREMIUM o NUTRIALFA CAMPO de 30 kg?';
  const redactar = humanizador(['¿Me confirmas la referencia exacta?', buena], solicitudes);
  const respuesta = await redactar('NUTRIALFA 30kg', '', {
    productoAutonomo: { nivel: 'media', presentacionSolicitada: '30kg',
      aclaracion: { campo: 'referencia', valores: ['NUTRIALFA PREMIUM', 'NUTRIALFA CAMPO'] } },
    estado: {}, clasificacion,
  });
  assert.equal(respuesta, buena);
  assert.match(solicitudes[1].messages.at(-1).content, /faltan_opciones_de_aclaracion/);
});

test('redaccion conserva el siguiente paso comercial cuando el motor lo solicita', async () => {
  const solicitudes = [];
  const buena = 'NUTRIPRUEBA de 30 kg vale $103.000. ¿Quieres agregar algo más?';
  const redactar = humanizador(['NUTRIPRUEBA de 30 kg vale $103.000.', buena], solicitudes);
  const productos = catalogo();
  const hechos = validarCoincidenciaProducto({ mensaje: 'NUTRIPRUEBA 30kg', catalogo: productos, clasificacion });
  const respuesta = await redactar('quiero NUTRIPRUEBA 30kg',
    'NUTRIPRUEBA 30 kg: $103.000. ¿Quieres agregar algo más?', {
      productoAutonomo: hechos, estado: { carrito: [{}] }, clasificacion,
      interpretacionIA: { accion: 'agregar' },
    });
  assert.equal(respuesta, buena);
  assert.match(solicitudes[1].messages.at(-1).content, /falta_siguiente_paso/);
});

test('precios COP equivalentes pasan y un importe distinto sigue rechazado', async () => {
  const hechos = { nivel: 'alta', coincidencia: { referencia: 'PRO PLAN FELINE EN',
    presentaciones: [{ peso: '1.5kg', precio: 113600 }] } };
  for (const precio of ['$113.600', '$ 113.600', '113.600 pesos', 'COP 113,600', '$113.600,00']) {
    const solicitudes = [];
    const buena = `PRO PLAN FELINE EN de 1.5kg a ${precio}. ¿Avanzamos con la entrega?`;
    const redactar = humanizador(['PRO PLAN FELINE EN de 1.5kg a $113.600.', buena], solicitudes);
    assert.equal(await redactar('Me podrías enviar dos paquetes',
      'PRO PLAN FELINE EN 1.5kg a $113.600. ¿Avanzamos con la entrega?', {
        productoAutonomo: hechos, estado: {}, interpretacionIA: { accion: 'agregar' },
      }), buena);
  }
  const redactar = humanizador(Array(2).fill('PRO PLAN FELINE EN de 1.5kg a 113.601 pesos. ¿Avanzamos?'), []);
  assert.equal(await redactar('Dos paquetes', 'Precio: $113.600. ¿Avanzamos?', {
    productoAutonomo: hechos, estado: {},
  }), 'Precio: $113.600. ¿Avanzamos?');
});

test('compra interpretada conserva dos unidades sin exigir palabra clave ni elegir presentacion unica', () => {
  const { crearEstadoInicial } = require('../src/conversation/conversationStore');
  const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
  const productos = [{ marca: 'PRO PLAN', referencias: [{ nombre: 'PRO PLAN FELINE EN', especie: 'gato',
    categoria: 'comida', presentaciones: [{ peso: '1.5kg', precio: 113600 }] }] }];
  const lectura = { intencion: 'pedido_producto', accion: 'agregar', confianza: 0.99,
    producto: { marca: 'PRO PLAN', referencia: 'PRO PLAN FELINE EN', cantidad: 2 } };
  for (const mensaje of ['Me podrías por favor enviarme dos paquetes de concentrado proplan feline EN',
    'PRO PLAN FELINE EN, dos para mañana por favor']) {
    const estado = crearEstadoInicial();
    const respuesta = resolverConsultaCatalogo(mensaje, estado, productos, lectura);
    assert.equal(estado.carrito.length, 1);
    assert.equal(estado.carrito[0].cantidad, 2);
    assert.equal(estado.carrito[0].peso, '1.5kg');
    assert.match(respuesta, /227\.200/);
  }
  for (const variante of ['consulta', 'multiples', 'peso_no_disponible']) {
    const estado = crearEstadoInicial();
    const catalogo = structuredClone(productos);
    const interpretacion = structuredClone(lectura);
    if (variante === 'consulta') { interpretacion.accion = 'consultar'; interpretacion.intencion = 'consulta_producto'; }
    if (variante === 'multiples') catalogo[0].referencias[0].presentaciones.push({ peso: '3kg', precio: 200000 });
    if (variante === 'peso_no_disponible') interpretacion.producto.presentacion = '5kg';
    resolverConsultaCatalogo('PRO PLAN FELINE EN', estado, catalogo, interpretacion);
    assert.equal(estado.carrito.length, 0, variante);
  }
});

test('dos redacciones de aclaracion incompletas producen una pregunta validada sin romper el webhook', async () => {
  for (const aclaracion of [
    { campo: 'sabores', valores: ['pollo', 'pavo', 'conejo'] },
    { campo: 'referencia', valores: ['NUTRIALFA CASTRADO POLLO', 'NUTRIALFA CASTRADO PAVO'] },
  ]) {
    const redactar = humanizador(['¿Cuál necesitas?', '¿Cuál prefieres?'], []);
    const respuesta = await redactar('Tienes este x3kl?', 'Candidato no confirmado a $90.000', {
      productoAutonomo: { nivel: 'media', aclaracion }, estado: {}, clasificacion,
    });
    for (const valor of aclaracion.valores) assert.ok(respuesta.toLowerCase().includes(valor.toLowerCase()));
    assert.match(respuesta, /\?/);
    assert.doesNotMatch(respuesta, /\$|90.000|agreg|confirmado/);
  }
});

test('pregunta pendiente se publica una sola vez despues del carrito', async () => {
  const pregunta = 'Para el otro alimento, ¿me confirmas la referencia?';
  const resumen = 'Pedido:\n- 1 x NUTRIPRUEBA 30kg: $103.000\nTotal: $103.000';
  const redactar = humanizador([`Agregué NUTRIPRUEBA al pedido. ${pregunta}`], []);
  const respuesta = await redactar('Mi lista', `Agregado.\n\n${resumen}\n\n${pregunta}`, {
    productoAutonomo: { nivel: 'no_aplica' }, interpretacionIA: { accion: 'agregar', preguntaPendiente: pregunta },
    estado: { carrito: [{ referencia: 'NUTRIPRUEBA' }] }, clasificacion,
  });
  assert.equal((respuesta.match(/me confirmas la referencia/g) || []).length, 1);
  assert.ok(respuesta.includes(resumen));
  assert.ok(respuesta.endsWith(pregunta));
});

test('redaccion de un item acepta el total real del carrito y conserva sus separadores', async () => {
  const pregunta = '¿Qué sabor necesitas del otro alimento?';
  const carrito = [{ referencia: 'NUTRIPRUEBA', peso: '30kg', precio: 103000, cantidad: 1 }, { referencia: 'OTRO', precio: 81900, cantidad: 1 }];
  const resumen = 'Pedido:\n- 1 x NUTRIPRUEBA 30kg: $103.000\n- 1 x OTRO: $81.900\nTotal: $184.900';
  const redactar = humanizador([`Agregué NUTRIPRUEBA de 30kg por $103.000. El total es $184.900. ${pregunta}`], []);
  const respuesta = await redactar('Ese', `NUTRIPRUEBA 30kg: $103.000\n\n${resumen}\n\n${pregunta}`, {
    productoAutonomo: { nivel: 'alta', coincidencia: { referencia: 'NUTRIPRUEBA', presentaciones: [{ peso: '30kg', precio: 103000 }] } },
    interpretacionIA: { accion: 'agregar', preguntaPendiente: pregunta }, estado: { carrito }, clasificacion,
  });
  assert.match(respuesta, /El total es \$184\.900\./);
  assert.equal((respuesta.match(/Qué sabor/g) || []).length, 1);
  assert.ok(respuesta.includes(resumen));
});

test('sin candidatos comunica incertidumbre y no genera confirmaciones de atributos ya recibidos', async () => {
  const solicitudes = [];
  const redactar = humanizador([
    JSON.stringify({respuesta:'¿Es 1.5 kg?',siguientePaso:'pedir_dato',datoSolicitado:'presentacion'}),
    JSON.stringify({respuesta:'Aún no puedo confirmar esa referencia de 1.5 kg. ¿Quieres que revisemos otra opción?',siguientePaso:'ofrecer_busqueda',datoSolicitado:null}),
  ], solicitudes);
  const respuesta = await redactar('De 1.5 kilos', 'No encuentro el producto.', {
    productoAutonomo: { nivel: 'baja', terminos: ['PRUEBA', 'cachorro', 'grande'],
      presentacionSolicitada: '1.5kg', alternativas: [], aclaracion: null }, estado: {}, clasificacion,
    interpretacionIA: {producto:{categoria:'comida',especie:'perro'}},
  });
  assert.match(respuesta, /no puedo confirmar.*1\.5 kg/);
  assert.doesNotMatch(respuesta, /confirmas|cachorro o adulto|catálogo|no tenemos/);
  assert.equal(solicitudes.length, 2);
  assert.equal(JSON.parse(solicitudes[0].messages[1].content).datosConocidos.presentacion,'1.5kg');
});

test('fallo del redactor de incertidumbre conserva respuesta segura sin dejar silencio', async () => {
  const solicitudes = [];
  const redactar = humanizador([new Error('simulated timeout')], solicitudes);
  const r = await redactar('Precio de NUBE CRIA', 'Texto operativo antiguo', {
    productoAutonomo: {nivel:'baja',alternativas:[],terminos:['NUBE','CRIA']},estado:{},clasificacion,
  });
  assert.match(r,/no puedo confirmar NUBE CRIA/i);
  assert.doesNotMatch(r,/cat[aá]logo|no tenemos|agotado/i);
  assert.equal(solicitudes.length,1);
});

test('sin mas datos no vuelve a pedir foto y puede orientar por necesidad sin exigir otra pregunta', async()=>{
 const solicitudes=[];
 const redactar=humanizador([
  JSON.stringify({respuesta:'¿Tienes una foto?',siguientePaso:'pedir_foto',datoSolicitado:null}),
  JSON.stringify({respuesta:'Entiendo. Si te sirve buscar otra opción, cuéntame qué tipo de producto necesitas y para qué mascota.',siguientePaso:'explorar_necesidad',datoSolicitado:null}),
 ],solicitudes);
 const r=await redactar('Ya dije que no tengo foto ni más datos','Por ahora no puedo confirmarlo.',{
  productoAutonomo:{nivel:'baja',alternativas:[],terminos:['NUBE']},estado:{},clasificacion,sinProgreso:true,
 });
 assert.doesNotMatch(r,/\?|foto|cat[aá]logo/);assert.match(r,/Entiendo/);assert.equal(solicitudes.length,2);
});

test('ofrecer una busqueda con consentimiento no exige signos de interrogacion', async () => {
  const solicitudes=[];
  const esperada='Con ese nombre aún no puedo confirmarlo. Si quieres, revisamos otras opciones.';
  const redactar=humanizador([JSON.stringify({respuesta:esperada,siguientePaso:'ofrecer_busqueda',datoSolicitado:null})],solicitudes);
  const r=await redactar('NUBE CRIA de 4 kilos', 'Respuesta operativa', {
    productoAutonomo:{nivel:'baja',alternativas:[],terminos:['NUBE','CRIA'],presentacionSolicitada:'4kg'},
    estado:{},clasificacion,interpretacionIA:{producto:{categoria:'comida'}},
  });
  assert.equal(r,esperada);assert.equal(solicitudes.length,1);
});

test('recurso no disponible interpretado por router impide pedir foto en consulta nueva', async () => {
  const solicitudes=[];
  const redactar=humanizador([
    JSON.stringify({respuesta:'¿Puedes mandar una foto?',siguientePaso:'pedir_foto',datoSolicitado:null}),
    JSON.stringify({respuesta:'Gracias. Si quieres que busquemos por necesidad, cuéntame qué tipo de producto necesitas.',siguientePaso:'explorar_necesidad',datoSolicitado:null}),
  ],solicitudes);
  const r=await redactar('NUBE CRIA de 4kg, no puedo mostrar el empaque', 'Respuesta operativa', {
    productoAutonomo:{nivel:'baja',alternativas:[],terminos:['NUBE','CRIA'],presentacionSolicitada:'4kg'},
    interpretacionIA:{recursosAclaracion:{fotoDisponible:false,masDatosDisponibles:null}},estado:{},clasificacion,
  });
  assert.doesNotMatch(r,/foto|empaque/);assert.equal(solicitudes.length,2);
  assert.equal(JSON.parse(solicitudes[0].messages[1].content).recursosAclaracion.fotoDisponible,false);
});

test('normaliza restricciones de aclaracion como booleanos sin inferir ausencia por null', () => {
  const {normalizarInterpretacion}=require('../src/services/aiInterpreter')._internals;
  const d=normalizarInterpretacion({recursosAclaracion:{fotoDisponible:false,masDatosDisponibles:'no'}});
  assert.deepEqual(d.recursosAclaracion,{fotoDisponible:false,masDatosDisponibles:null});
});

test('sin identidad rechaza veredictos de stock y precios inventados',async()=>{
 const redactar=humanizador([
  JSON.stringify({respuesta:'No lo tenemos. ¿Quieres otro?',siguientePaso:'ofrecer_busqueda',datoSolicitado:null}),
  JSON.stringify({respuesta:'Cuesta $15.000. ¿Lo quieres?',siguientePaso:'ofrecer_busqueda',datoSolicitado:null}),
 ],[]);
 const r=await redactar('Precio de NUBE CRIA','No puedo confirmarlo.',{
  productoAutonomo:{nivel:'baja',alternativas:[],terminos:['NUBE','CRIA']},estado:{},clasificacion,
  interpretacionIA:{producto:{categoria:'comida'}},
 });
 assert.doesNotMatch(r,/15\.000|no lo tenemos|cat[aá]logo/i);assert.match(r,/no puedo confirmar NUBE CRIA/i);
});

test('agotar pistas no autoriza cerrar ni prometer alternativas sin conocer necesidad', async () => {
  const solicitudes=[];
  const esperada='Si te interesa elegir por necesidad, ¿qué tipo de producto buscas y para qué mascota?';
  const redactar=humanizador([
    JSON.stringify({respuesta:'Entonces lo dejamos aquí.',siguientePaso:'cerrar',datoSolicitado:null}),
    JSON.stringify({respuesta:esperada,siguientePaso:'explorar_necesidad',datoSolicitado:null}),
  ],solicitudes);
  const r=await redactar('No tengo más información', 'Contingencia', {
    productoAutonomo:{nivel:'baja',alternativas:[]},estado:{},clasificacion,sinProgreso:true,
    interpretacionIA:{intencion:'consulta_producto',accion:'consultar'},
  });
  assert.equal(r,esperada);assert.equal(solicitudes.length,2);
});

test('rechazo explicito permite cerrar sin insistir', async () => {
  const esperada='De acuerdo, aquí estoy si necesitas algo más.';
  const redactar=humanizador([JSON.stringify({respuesta:esperada,siguientePaso:'cerrar',datoSolicitado:null})],[]);
  assert.equal(await redactar('No gracias, dejemos así', 'Contingencia', {
    productoAutonomo:{nivel:'baja',alternativas:[]},estado:{},clasificacion,sinProgreso:true,
    interpretacionIA:{intencion:'rechazo',accion:'rechazar'},
  }),esperada);
});

test('revisión comercial solo comunica pendiente guardado, sin inventar aviso o asignación', async () => {
  const solicitudes=[];
  const esperada='Gracias por aclararlo. Dejé la referencia pendiente de revisión por un asesor; todavía no hay uno asignado en este chat. Puedo ayudarte con otras consultas mientras tanto.';
  const redactar=humanizador([
    JSON.stringify({respuesta:'Ya avisé a un asesor y te responderá enseguida.',siguientePaso:'revision_asesor',datoSolicitado:null}),
    JSON.stringify({respuesta:esperada,siguientePaso:'revision_asesor',datoSolicitado:null}),
  ],solicitudes);
  const r=await redactar('No tengo más datos',esperada,{
    productoAutonomo:{nivel:'baja',alternativas:[]},sinProgreso:true,estado:{},clasificacion,
    revisionComercial:{registrada:true,notificada:false,asignada:false},
    interpretacionIA:{intencion:'consulta_producto',accion:'consultar'},
  });
  assert.equal(r,esperada);assert.equal(solicitudes.length,2);
});

test('consulta informativa omite resumen heredado sin tocar carrito ni pregunta de producto', async () => {
  const solicitudes=[];
  const respuesta='PRUEBA de 1kg cuesta $10.000. ¿Qué presentación del otro producto necesitas?';
  const redactar=humanizador([respuesta],solicitudes);
  const estado={carrito:[{marca:'ANTERIOR',referencia:'ANTERIOR',peso:'2kg',precio:20000,cantidad:2}],
    ultimaSolicitudProductos:[{estado:'pendiente'}]};
  const before=JSON.stringify(estado);
  const r=await redactar('Cuánto vale PRUEBA', 'PRUEBA 1kg $10.000\n\nPedido:\n- 2 x ANTERIOR 2kg: $40.000\nTotal: $40.000\n\n¿Qué presentación del otro producto necesitas?', {
    estado,clasificacion,interpretacionIA:{intencion:'consulta_producto',accion:'consultar'},
    productoAutonomo:{nivel:'alta',coincidencia:{referencia:'PRUEBA',presentaciones:[{peso:'1kg',precio:10000}]}},
    vertical:{orderLogic:{resumenCarrito:()=>{throw Error('No debe adjuntar el carrito');}}},
  });
  assert.equal(r,respuesta);assert.doesNotMatch(r,/Pedido:|ANTERIOR|40\.000/);
  assert.equal(JSON.stringify(estado),before);
  assert.equal(JSON.parse(solicitudes[0].messages[1].content).carrito,undefined);
});

test('presentacion conserva resumen para solicitud de carrito, compra y avance operativo', async () => {
  const {esConsultaInformativaProducto}=require('../src/utils/responsePresentation');
  for(const decision of [
    {accion:'consultar',intencion:'carrito'}, {accion:'agregar',intencion:'pedido_producto'},
    {accion:'consultar',intencion:'consulta_producto',continuarFlujo:true},
    {accion:'consultar',productos:[{accion:'consultar'},{accion:'agregar'}]},
    {accion:'consultar',carrito:{operacion:'modificar_cantidad'}},
  ]) {
    assert.equal(esConsultaInformativaProducto(decision),false);
    const r=await humanizador([],[])('Mensaje interpretado','Pedido:\n- 1 x PRUEBA 1kg: $10.000\nTotal: $10.000',{
      estado:{},interpretacionIA:decision,productoAutonomo:{nivel:'alta'},
    });
    assert.match(r,/Pedido:.*\n- 1 x PRUEBA/);
  }
});

test('consulta de varias unidades cotiza cantidad solicitada sin agregar ni usar pauta', async () => {
  const solicitudes = [];
  const redactar = humanizador(['Sí, PRUEBA 10mg cuesta $5.800 por unidad; las dos unidades suman $11.600.'], solicitudes);
  const r = await redactar('¿Manejan PRUEBA 10? 1/4 cada 24 horas por 6 días. Necesito dos tabletas.',
    'PRUEBA 10mg: $5.800', { estado: {carrito:[]}, clasificacion,
      interpretacionIA: {accion:'consultar',producto:{cantidad:2}},
      productoAutonomo: {nivel:'alta',presentacionSolicitada:'10mg',coincidencia:{referencia:'PRUEBA',
        presentaciones:[{peso:'10mg',precio:5800}]}},
    });
  assert.match(r,/11\.600/);
  const contexto = JSON.parse(solicitudes[0].messages[1].content);
  assert.equal(contexto.cotizacionCantidad.unidades,2);
  assert.equal(contexto.cotizacionCantidad.total,11600);
});

test('aclarar un producto de varias fotos no omite la cotizacion del ya identificado', async () => {
  const solicitudes = [];
  const completa = 'ALFA POUCH ADULT de 85 g cuesta $6.200. ¿Qué presentación quieres del otro producto?';
  const redactar = humanizador([
    'El alimento húmedo quedó identificado; me falta que confirmes el otro producto.', completa,
  ], solicitudes);
  const resultado = await redactar('Tienen estos dos productos', completa, {
    productoAutonomo: { nivel: 'no_aplica', resultados: [
      { nivel: 'alta', solicitud: { presentacion: '85g' }, coincidencia: { referencia: 'ALFA POUCH ADULT',
        presentaciones: [{ peso: '85gr', precio: 6200 }] } },
      { nivel: 'media', solicitud: { marca: 'OTRA' }, coincidencia: null },
    ] }, estado: {}, clasificacion, interpretacionIA: { accion: 'consultar', preguntaPendiente: '¿Qué presentación quieres?' },
  });
  assert.equal(resultado, completa);
  assert.equal(solicitudes.length, 2);
});

test('dos fotos mantienen respuesta validada si el redactor insiste en cotizar el peso pendiente', async () => {
  const solicitudes = [];
  const base = 'ALFA POUCH ADULT 85gr: $6.200. ¿Qué presentación necesitas de BETA WILD?';
  const redactar = humanizador(['ALFA POUCH ADULT 85gr $6.200 y BETA WILD 1kg $35.900?',
    'Ambos cuestan $42.100. ¿Los agrego?'], solicitudes);
  const respuesta = await redactar('Tienen estos dos', base, {
    productoAutonomo: { nivel: 'no_aplica', resultados: [
      { nivel: 'alta', solicitud: { presentacion: '85g' }, coincidencia: { referencia: 'ALFA POUCH ADULT',
        presentaciones: [{ peso: '85gr', precio: 6200 }] } },
      { nivel: 'alta', solicitud: { presentacion: null }, coincidencia: { referencia: 'BETA WILD',
        presentaciones: [{ peso: '1kg', precio: 35900 }] } },
    ] }, estado: {}, clasificacion, interpretacionIA: { accion: 'consultar' },
  });
  assert.equal(respuesta, base);
  const contexto = JSON.parse(solicitudes[0].messages[1].content);
  assert.equal(contexto.resultado.resultados[1].pendiente, 'presentacion');
  assert.doesNotMatch(JSON.stringify(contexto), /35900/);
});

test('redactor no vuelve a preguntar especie que el intérprete ya resolvió', async () => {
  const solicitudes=[];
  const redactar=humanizador(['¿Me confirmas si es para perro o gato?', '¿Qué tamaño de raza necesitas?'], solicitudes);
  const respuesta=await redactar('un bulto rojo de 22.7', '¿Qué tamaño de raza necesitas?', {
    productoAutonomo:{nivel:'media',aclaracion:{campo:'tamano',valores:['pequeno','grande']},alternativas:[]},
    clasificacion,estado:{},interpretacionIA:{accion:'agregar',producto:{especie:'perro'}},
  });
  assert.equal(solicitudes.length,2);
  assert.doesNotMatch(respuesta,/perro o gato/);
  assert.equal(JSON.parse(solicitudes[0].messages[1].content).especieConocida,'perro');
});

test('autoriza precio de la presentación validada aunque el texto operativo no lo incluya', async () => {
 const solicitudes = [];
 const esperada = 'PRUEBA ADULTO de 10.1kg cuesta $178.600. ¿Te la envío?';
 const redactar = humanizador([esperada], solicitudes);
 const respuesta = await redactar('10.1kg', 'Ya seleccionaste la presentación.', {
   productoAutonomo: { nivel: 'alta', coincidencia: {
     marca: 'PRUEBA', referencia: 'PRUEBA ADULTO', presentaciones: [
       { peso: '1kg', precio: 27400 }, { peso: '10.1kg', precio: 178600 },
     ] } }, estado: {}, interpretacionIA: { accion: 'consultar', producto: { presentacion: '10.1kg' } },
 });
 assert.equal(respuesta, esperada); assert.equal(solicitudes.length, 1);
});
