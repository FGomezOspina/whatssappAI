const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { _internals: { normalizarInterpretacion } } = require('../src/services/aiInterpreter');

function escenario(accion = 'agregar', opciones = {}) {
  const productos = [
    { marca: 'ALIMENTOPRUEBA', presentacion: '20kg', cantidad: 1, precio: 116000 },
    { marca: 'GRANOPRUEBA', presentacion: '1kg', cantidad: 4, precio: 2400 },
    { marca: 'BOCADOPRUEBA', presentacion: '100g', cantidad: 3, precio: 3000 },
  ];
  const catalogo = productos.map(p => ({ marca: p.marca, referencias: [{ nombre: p.marca,
    categoria: 'comida', presentaciones: [{ peso: p.presentacion, precio: p.precio }] }] }));
  const solicitudes = productos.map(p => ({ marca: p.marca, textoVisible: p.marca,
    presentacion: p.presentacion, cantidad: p.cantidad }));
  if (opciones.pendiente !== false) solicitudes.splice(1, 0, { textoVisible: 'producto por aclarar', cantidad: 2 });
  let guardado = crearEstadoInicial();
  let turnos = 0;
  const archivo = require.resolve('../src/services/conversationService');
  const localRequire = createRequire(archivo);
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'prueba-multiple', vertical: 'petshop' }) },
    '../conversation/conversationStore': {
      // Simula lectura/escritura JSON de la conversacion entre cada mensaje.
      obtenerConversacionPersistida: async () => JSON.parse(JSON.stringify(guardado)),
      obtenerHistorialRecientePersistido: async () => [],
      guardarConversacionPersistida: async (_id, estado) => { guardado = JSON.parse(JSON.stringify(estado)); },
    },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo,
      resultadosPorProducto: solicitudes.map(s => ({ catalogo: catalogo.filter(c => c.marca === s.marca) })), metadata: {} }) },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      if (args.clasificacion.decisionHerramientas) {
        if (++turnos === 1) return normalizarInterpretacion({ intencion: accion === 'consultar' ? 'consulta_producto' : 'pedido_producto',
          accion, confianza: 1, entrega: opciones.entrega || {}, consultaCatalogo: { necesaria: true, consulta: 'pedido multiple' }, productos: solicitudes });
        if (opciones.aclaracion) return normalizarInterpretacion({ intencion: 'pedido_producto', accion: 'agregar',
          confianza: 1, consultaCatalogo: { necesaria: true, consulta: 'aclaracion de productos' }, productos: solicitudes,
          carrito: { operacion: 'modificar_cantidad', cantidadObjetivo: 1 } });
        assert.deepEqual(JSON.parse(JSON.stringify(args.estado.ultimaSolicitudProductos.map(p => p.cantidad))), solicitudes.map(p => p.cantidad));
        return normalizarInterpretacion({ intencion: args.mensaje === 'domicilio' ? 'datos_envio' : 'confirmacion',
          accion: args.mensaje.includes('todo') ? 'consultar' : 'confirmar', continuarFlujo: true, confianza: 1,
          consultaCatalogo: { necesaria: false }, entrega: args.mensaje === 'domicilio' ? { tipo: 'domicilio' } : {} });
      }
      const p = productos.find(p => args.mensaje.includes(p.marca));
      if (p?.marca === opciones.falloProducto) return null;
      // Simula el mapeo que encuentra la referencia pero pierde accion y cantidad.
      return normalizarInterpretacion({ intencion: 'consulta_producto', accion: 'consultar', confianza: 1,
        producto: p ? { marca: p.marca, referencia: p.marca, presentacion: p.presentacion, cantidad: 1 } : {} });
    } },
    './humanizer': { humanizarRespuesta: async (_mensaje, base) => base },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || localRequire(n),
    module: modulo, process, console: { log() {}, error() {} } });
  return { enviar: text => modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text }),
    estado: () => guardado };
}

test('pedido multiple conserva accion, cantidades, pendientes y carrito al recargar entre turnos', async () => {
  const caso = escenario();
  const respuesta = await caso.enviar('Quiero ALIMENTOPRUEBA 20kg, producto por aclarar, GRANOPRUEBA y BOCADOPRUEBA');
  assert.deepEqual(caso.estado().carrito.map(p => p.cantidad), [1, 4, 3]);
  assert.match(respuesta, /134\.600/);
  assert.equal((respuesta.match(/Pedido:/g) || []).length, 1);
  assert.equal(caso.estado().ultimaSolicitudProductos[1].estado, 'pendiente');
  const original = JSON.parse(JSON.stringify(caso.estado().carrito));
  for (const mensaje of ['asi esta bien', 'Cuanto seria todo', 'domicilio']) {
    const siguiente = await caso.enviar(mensaje);
    assert.deepEqual(caso.estado().carrito, original, mensaje);
    assert.match(siguiente, /134\.600/, mensaje);
    assert.match(siguiente, /3 x BOCADOPRUEBA/, mensaje);
  }
});

test('cotizacion multiple conserva cantidades sin convertir la consulta en compra', async () => {
  const caso = escenario('consultar');
  await caso.enviar('Precio de ALIMENTOPRUEBA, GRANOPRUEBA y BOCADOPRUEBA');
  assert.equal(caso.estado().carrito.length, 0);
  assert.deepEqual(caso.estado().productosConsultados.map(p => p.cantidad), [1, 4, 3]);
});


test('pedido multiple con domicilio conserva el siguiente paso del flujo existente', async () => {
  const caso = escenario('agregar', { pendiente: false, entrega: { tipo: 'domicilio' } });
  const respuesta = await caso.enviar('Quiero ALIMENTOPRUEBA, GRANOPRUEBA y BOCADOPRUEBA a domicilio');
  assert.equal(caso.estado().carrito.length, 3);
  assert.equal((respuesta.match(/Pedido:/g) || []).length, 1);
  assert.match(respuesta, /134\.600/);
  assert.match(respuesta, /Para completar tu domicilio/);
});

test('memoria compacta conserva asociacion original de cantidades en correcciones elipticas', async () => {
  const { _internals: { compactarEstado } } = require('../src/services/aiContextOptimizer');
  const caso = escenario();
  await caso.enviar('Quiero ALIMENTOPRUEBA, GRANOPRUEBA y BOCADOPRUEBA');
  const memoria = compactarEstado(caso.estado(), 'pedido');
  assert.equal(memoria.ultimaSolicitudProductos.find(p => p.marca === 'BOCADOPRUEBA').cantidad, 3);
  assert.equal(memoria.ultimaSolicitudProductos.find(p => p.marca === 'ALIMENTOPRUEBA').cantidad, 1);
  assert.equal(memoria.ultimaSolicitudProductos[1].estado, 'pendiente');
});


test('fallo de un producto no descarta los otros y conserva la solicitud pendiente', async () => {
  const caso = escenario('agregar', { falloProducto: 'GRANOPRUEBA' });
  const respuesta = await caso.enviar('Quiero ALIMENTOPRUEBA, GRANOPRUEBA y BOCADOPRUEBA');
  assert.deepEqual(caso.estado().carrito.map(p => p.cantidad), [1, 3]);
  const pendiente = caso.estado().ultimaSolicitudProductos.find(p => p.marca === 'GRANOPRUEBA');
  assert.equal(pendiente.cantidad, 4);
  assert.equal(pendiente.estado, 'pendiente');
  assert.match(respuesta, /problema temporal/);
  assert.doesNotMatch(respuesta, /avanzamos con la entrega/);
});

test('redaccion conserva completo el resumen calculado incluso con aclaraciones pendientes', async () => {
  const archivo = require.resolve('../src/services/humanizer');
  const localRequire = createRequire(archivo);
  const modulo = { exports: {} };
  let llamadas = 0;
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    require: n => n === 'openai' ? class {
      chat = { completions: { create: async () => { llamadas++; throw new Error('No debe reescribir el carrito'); } } };
    } : localRequire(n), module: modulo, process: { env: { OPENAI_API_KEY: 'synthetic' } }, console,
  });
  const { humanizarRespuesta } = modulo.exports;
  const base = 'Necesito aclarar otro producto.\n\nPedido:\n- 1 x ALIMENTOPRUEBA 20kg: $116.000\n- 3 x BOCADOPRUEBA 100g: $9.000\nTotal: $125.000';
  assert.equal(await humanizarRespuesta('Cuanto seria todo', base, {}), base);
  assert.equal(llamadas, 0);
});


test('aclaracion conserva operacion del router y no duplica ni uniforma cantidades existentes', async () => {
  const caso = escenario('agregar', { aclaracion: true });
  await caso.enviar('Quiero ALIMENTOPRUEBA, GRANOPRUEBA y BOCADOPRUEBA');
  const antes = JSON.parse(JSON.stringify(caso.estado().carrito));
  await caso.enviar('ALIMENTOPRUEBA 20kg, GRANOPRUEBA y BOCADOPRUEBA');
  assert.deepEqual(caso.estado().carrito, antes);
  assert.deepEqual(caso.estado().carrito.map(p => p.cantidad), [1, 4, 3]);
});

test('pregunta de un producto incierto muestra el carrito guardado sin reescribirlo', async () => {
  const archivo = require.resolve('../src/services/humanizer');
  const localRequire = createRequire(archivo);
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    require: n => n === 'openai' ? class {
      chat = { completions: { create: async () => ({ choices: [{ message: { content: '¿De qué marca necesitas el producto pendiente?' } }] }) } };
    } : localRequire(n), module: modulo, process: { env: { OPENAI_API_KEY: 'synthetic' } }, console,
  });
  const estado = crearEstadoInicial();
  estado.carrito = [{ marca: 'BOCADOPRUEBA', referencia: 'BOCADOPRUEBA', peso: '100g', precio: 3000, cantidad: 3 }];
  estado.ultimaSolicitudProductos = [{ estado: 'pendiente', cantidad: 2 }];
  const respuesta = await modulo.exports.humanizarRespuesta('¿Y el otro producto?', 'Falta la marca.', {
    estado, vertical: require('../src/verticals/petshop'), productoAutonomo: { nivel: 'media', alternativas: [] },
  });
  assert.match(respuesta, /¿De qué marca/);
  assert.match(respuesta, /3 x BOCADOPRUEBA 100g: \$9\.000/);
  assert.match(respuesta, /Total: \$9\.000/);
});
