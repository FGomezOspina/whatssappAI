const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');

async function responderAclaracion({ marca = 'NEXGARD', referencia = 'NEXGARD SPECTRA', mensaje, producto, campo = 'peso_mascota', valores = [], accion = 'consultar', catalogo }) {
  catalogo ||= require('../productos.json').filter(m => ['NEXGARD', 'CUTAMYCON', 'ADVOCATE'].includes(m.marca));
  const archivo = require.resolve('../src/services/conversationService');
  const req = createRequire(archivo);
  const inicial = crearEstadoInicial();
  inicial.ultimaConsultaProducto = { nivel: 'media', razon: 'falta_peso_mascota',
    terminos: referencia.toLowerCase().split(' '), etiqueta: referencia, creadoEn: new Date().toISOString(),
    aclaracion: { campo, valores }, solicitudOriginal: {
      intencion: accion === 'agregar' ? 'pedido_producto' : 'consulta_producto', accion,
      producto: { marca, referencia: referencia.replace(marca, '').trim(), cantidad: 2 },
    } };
  inicial.ultimaPreguntaAsistente = '¿Me confirmas los datos de tu mascota?';
  let guardado = JSON.stringify(inicial), contexto, busqueda;
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'synthetic', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => JSON.parse(guardado), obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async (_u, s) => { guardado = JSON.stringify(s); } },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async args => { busqueda = args; return { catalogo, metadata: {} }; } },
    './aiInterpreter': { interpretarMensajeCliente: async () => ({ intencion: 'consulta_producto', accion: 'consultar', confianza: 0.99,
      producto, productos: [producto], consultaCatalogo: { necesaria: true, consulta: `${producto.marca} ${producto.referencia} ${producto.presentacion || ''}` } }) },
    './humanizer': { humanizarRespuesta: async (_m, base, opciones) => { contexto = opciones; return base; } },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || req(n), module: modulo, process, console: { log() {}, error() {} } });
  const respuesta = await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text: mensaje });
  return { estado: JSON.parse(guardado), respuesta, contexto, busqueda };
}

test('respuesta real con palabras adicionales conserva Spectra y resuelve 4kl', async () => {
  const r = await responderAclaracion({ mensaje: 'para perro, mi perrito pesa 4kl',
    producto: { marca: 'NEXGARD', referencia: 'NEXGARD SPECTRA', especie: 'perro', tamano: '4kg',
      presentacion: null, textoVisible: 'nexgard spectra para perro 4kl', mencionOriginal: null } });
  assert.match(r.respuesta, /56[.,]000/, r.respuesta);
  assert.equal(r.contexto.productoAutonomo.coincidencia.referencia, 'NEXGARD SPECTRA');
  assert.equal(r.contexto.productoAutonomo.presentacionSolicitada, '3.5-7.5kg');
  assert.equal(r.estado.carrito.length, 0);
  assert.doesNotMatch(r.respuesta, /no encuentro|PERRITO PESA/i);
});

test('aclaración larga conserva la acción de compra y la cantidad original', async () => {
  const r = await responderAclaracion({ marca: 'ADVOCATE', referencia: 'ADVOCATE', accion: 'agregar',
    mensaje: 'si claro es para mi perro, lo pesamos ayer y está en 30 kilos, muchas gracias por tu ayuda',
    producto: { marca: 'ADVOCATE', referencia: 'ADVOCATE', especie: 'perro', presentacion: '30kg' } });
  assert.equal(r.estado.carrito[0]?.peso, '25-40kg', r.respuesta);
  assert.equal(r.estado.carrito[0].cantidad, 2);
});

test('otro producto explícito cambia de consulta aunque haya una aclaración pendiente', async () => {
  const r = await responderAclaracion({ mensaje: 'mejor dime el precio del cutamycon spray de 50 ml por favor',
    producto: { marca: 'CUTAMYCON', referencia: 'CUTAMYCON SPRAY', presentacion: '50ml', mencionOriginal: 'cutamycon spray de 50 ml' } });
  assert.equal(r.contexto.productoAutonomo.coincidencia.referencia, 'CUTAMYCON SPRAY', r.respuesta);
  assert.equal(r.estado.carrito.length, 0);
});

test('funciona con identidad nueva de prueba y lenguaje largo, sin excepciones por marca', async () => {
  const marca = 'PROTECCIONPRUEBA';
  const catalogo = [{ marca, referencias: [{ nombre: `${marca} COMPLETA`, especie: 'perro', categoria: 'medicamento',
    presentaciones: [{ peso: '3.5-7.5kg', precio: 12345 }] }] }];
  const r = await responderAclaracion({ marca, referencia: `${marca} COMPLETA`, catalogo,
    mensaje: 'claro que si, es para el perrito de mi mamá, lo pesaron ayer y nos dijeron que pesa 4 kilos, te agradezco mucho',
    producto: { marca, referencia: `${marca} COMPLETA`, especie: 'perro', presentacion: '4kg' } });
  assert.equal(r.contexto.productoAutonomo.coincidencia.referencia, `${marca} COMPLETA`, r.respuesta);
  assert.equal(r.contexto.productoAutonomo.presentacionSolicitada, '3.5-7.5kg');
  assert.equal(r.estado.carrito.length, 0);
});

test('aclarar la etapa de un alimento también conserva la identidad, sin contar palabras', async () => {
  const marca = 'NUTRICIONPRUEBA';
  const catalogo = [{ marca, referencias: [{ nombre: marca, especie: 'perro', categoria: 'comida', etapa: 'adulto',
    presentaciones: [{ peso: '10kg', precio: 45000 }] }] }];
  const r = await responderAclaracion({ marca, referencia: marca, catalogo, campo: 'etapa', valores: ['adulto', 'cachorro'],
    mensaje: 'él ya es adulto, ya tiene tres años y siempre ha comido ese concentrado, muchas gracias',
    producto: { marca, referencia: marca, etapa: 'adulto' } });
  assert.equal(r.contexto.productoAutonomo.nivel, 'alta', r.respuesta);
  assert.equal(r.contexto.productoAutonomo.coincidencia.referencia, marca);
  assert.equal(r.estado.carrito.length, 0);
});
