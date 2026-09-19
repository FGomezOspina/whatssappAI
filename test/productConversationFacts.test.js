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
        return { choices: [{ message: { content: respuestas.shift() } }] };
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

test('rechaza precios inventados y no publica la ficha del motor si ambas redacciones fallan', async () => {
  const solicitudes = [];
  const redactar = humanizador(['NUTRIPRUEBA 30kg cuesta $9.000.', 'NUTRIPRUEBA 30kg cuesta $8.000.'], solicitudes);
  const productos = catalogo();
  const hechos = validarCoincidenciaProducto({ mensaje: 'NUTRIPRUEBA 30kg', catalogo: productos,
    catalogoCandidatos: productos, clasificacion });
  await assert.rejects(redactar('NUTRIPRUEBA 30kg', 'Precio: $103.000', {
    productoAutonomo: hechos, estado: {}, clasificacion,
  }), /fiel a los hechos/);
  assert.equal(solicitudes.length, 2);
});

test('mensaje con direccion y transferencia valida la consulta de producto separada de logistica', async () => {
  const { crearEstadoInicial } = require('../src/conversation/conversationStore');
  const archivo = require.resolve('../src/services/conversationService');
  const localRequire = createRequire(archivo);
  const estado = crearEstadoInicial();
  const productos = catalogo();
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
  assert.match(mensajes[1], /cedula/);
  assert.match(mensajes[1], /correo/);
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
