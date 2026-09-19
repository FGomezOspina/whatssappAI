const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
const { dividirRespuestaMensajes, respuestaParaHistorial } = require('../src/utils/responseMessages');

function pedido() {
  return { ...crearEstadoInicial(),
    carrito: [{ marca: 'Prueba', referencia: 'Alimento cachorro', peso: '2kg', precio: 28000, cantidad: 1 }] };
}

function decision(datos = {}) {
  return { intencion: 'datos_envio', confianza: 0.99, continuarFlujo: false,
    consultaCatalogo: { necesaria: false }, entrega: { tipo: 'domicilio' }, ...datos };
}

function turno(estado, mensaje, datos) {
  return resolverConsultaCatalogo(mensaje, estado, [], decision(datos));
}

const datosCliente = { nombre: 'Cliente Prueba', cedula: '1000000000', celular: '3000000000', correo: 'cliente@example.com' };
const direccion = 'Calle 10 # 20-30';
const lote = `Nombre: ${datosCliente.nombre}\nCédula: ${datosCliente.cedula}\nCelular: ${datosCliente.celular}\nCorreo: ${datosCliente.correo}\nDirección: ${direccion}`;

test('domicilio pide todos los pendientes y al recibir el lote muestra resumen antes de confirmar', () => {
  const estado = pedido();
  const primera = turno(estado, 'Tienen domicilio');
  assert.doesNotMatch(primera, /en un solo mensaje/i);
  for (const campo of ['nombre', 'cedula', 'celular', 'correo', 'direccion completa', 'método de pago']) {
    assert.ok(primera.includes(`- ${campo}`), campo);
  }
  assert.equal(estado.esperandoDatosDomicilio, true);
  assert.equal(estado.esperandoMetodoPago, true);
  // Extract the entire batch, even without structured fields from the router.
  const resumen = turno(estado, `${lote}\nContra entrega`);
  for (const valor of [...Object.values(datosCliente), direccion]) assert.ok(resumen.includes(valor), valor);
  assert.match(resumen, /Total: \$28\.000/);
  assert.match(resumen, /Método de pago: efectivo/);
  assert.match(resumen, /¿Deseas agregar algo más o finalizamos el pedido así\?/);
  assert.equal(estado.pedidoConfirmado, false);
  assert.equal(estado.esperandoConfirmacionPedido, true);
  assert.equal(estado.esperandoMetodoPago, false);
  assert.equal(estado.esperandoDatosDomicilio, false);
});

test('respuesta parcial conserva datos y pide juntos solo los faltantes tras recargar estado', () => {
  let estado = pedido();
  turno(estado, 'Quiero domicilio');
  turno(estado, 'Dirección: Calle 10 # 20-30\nContra entrega', {
    entrega: { tipo: 'domicilio', direccion, metodoPago: 'efectivo' },
  });
  estado = JSON.parse(JSON.stringify(estado));
  const parcial = turno(estado, 'Nombre: Cliente Prueba\nCelular: 3000000000');
  assert.match(parcial, /- cedula/);
  assert.match(parcial, /- correo/);
  assert.doesNotMatch(parcial, /- nombre|- celular|- direccion|- método de pago/);
  const ultimo = turno(estado, 'Cédula: 1000000000');
  assert.doesNotMatch(ultimo, /en un solo mensaje/i);
  assert.match(ultimo, /- correo/);
  assert.doesNotMatch(ultimo, /- nombre|- celular|- cedula|- direccion|- método de pago/);
  const resumen = turno(estado, 'cliente@example.com');
  assert.match(resumen, /finalizamos el pedido así/);
  assert.equal(estado.datosDomicilio.direccion, direccion);
  assert.equal(estado.metodoPago, 'efectivo');
  assert.equal(estado.pedidoConfirmado, false);
});

test('datos completos sin pago se conservan y solo se solicita el metodo de pago', () => {
  const estado = pedido();
  turno(estado, 'Quiero domicilio');
  const respuesta = turno(estado, lote);
  assert.match(respuesta, /- método de pago/);
  assert.doesNotMatch(respuesta, /- nombre|- celular|- cedula|- correo|- direccion|finalizamos/);
  assert.equal(estado.esperandoConfirmacionPedido, false);
  const resumen = turno(estado, 'Transferencia', { intencion: 'metodo_pago' });
  assert.match(resumen, /Datos para transferencia/);
  assert.match(resumen, /finalizamos el pedido así/);
  assert.equal(estado.datosDomicilio.nombre, datosCliente.nombre);
  assert.equal(estado.instruccionesPagoEnviadas, true);
});

test('un pago aislado no se guarda como nombre cuando aun falta el cliente', () => {
  const estado = pedido();
  turno(estado, 'Quiero domicilio');
  const respuesta = turno(estado, 'Contra entrega', { intencion: 'metodo_pago' });
  assert.equal(estado.datosDomicilio.nombre, undefined);
  assert.match(respuesta, /- nombre/);
  assert.doesNotMatch(respuesta, /- método de pago/);
});

test('consignacion con y sin tilde envia las cuentas y llave una vez y conserva los faltantes', () => {
  for (const pago of ['Método de pago: consignacion', 'Consignación', 'Voy a consignar']) {
    const estado = pedido();
    turno(estado, 'Quiero domicilio');
    const respuesta = turno(estado, pago, { intencion: 'metodo_pago', entrega: { tipo: 'domicilio', metodoPago: 'consignacion' } });
    for (const dato of ['07300007105', '127200128222', '@luzg5604', 'luz merida gomez ospina', 'Enviar el comprobante']) {
      assert.ok(respuesta.includes(dato), dato);
    }
    assert.equal(estado.metodoPago, 'transferencia bancaria');
    assert.equal(estado.datosDomicilio.nombre, undefined);
    assert.match(respuesta, /- nombre/);
    assert.doesNotMatch(respuesta, /- método de pago|en un solo mensaje/i);
    const siguiente = turno(estado, 'Nombre: Cliente Prueba');
    assert.doesNotMatch(siguiente, /07300007105|127200128222|@luzg5604|- nombre/);
    assert.match(siguiente, /- correo/);
  }
});

test('consignacion semantica y cambio de pago en el resumen tambien envian instrucciones', () => {
  for (const enResumen of [false, true]) {
    const estado = pedido();
    if (enResumen) turno(estado, `${lote}\nContra entrega`, { datosCliente,
      entrega: { tipo: 'domicilio', direccion, metodoPago: 'efectivo' } });
    const respuesta = turno(estado, 'Prefiero hacerlo por el banco', {
      intencion: 'metodo_pago', datosCliente,
      entrega: { tipo: 'domicilio', direccion, metodoPago: 'consignación' },
    });
    assert.match(respuesta, /07300007105/);
    assert.match(respuesta, /127200128222/);
    assert.match(respuesta, /@luzg5604/);
    assert.match(respuesta, /finalizamos el pedido así/);
    const mensajes = dividirRespuestaMensajes(respuesta);
    assert.equal(mensajes.length, 2);
    assert.match(mensajes[0], /07300007105/);
    assert.match(mensajes[0], /@luzg5604/);
    assert.doesNotMatch(mensajes[0], /Pedido:|finalizamos/);
    assert.match(mensajes[1], /Total: \$28\.000/);
    assert.match(mensajes[1], /finalizamos el pedido así/);
    assert.doesNotMatch(mensajes[1], /07300007105|@luzg5604/);
    assert.doesNotMatch(respuestaParaHistorial(respuesta), /AIVANCE_MESSAGE_BREAK/);
    assert.equal(estado.metodoPago, 'transferencia bancaria');
    assert.equal(estado.pedidoConfirmado, false);
  }
});

test('router con pedido activo delega datos al motor y el humanizador no fragmenta su solicitud', async () => {
  const humanizerFile = require.resolve('../src/services/humanizer');
  const humanizerRequire = createRequire(humanizerFile);
  let llamadasHumanizador = 0;
  const humanizer = { exports: {} };
  vm.runInNewContext(fs.readFileSync(humanizerFile, 'utf8'), {
    require: name => name === 'openai' ? class {
      chat = { completions: { create: async () => {
        llamadasHumanizador++;
        return { choices: [{ message: { content: '¿Me compartes tu nombre?' } }] };
      } } };
    } : humanizerRequire(name), module: humanizer,
    process: { env: { OPENAI_API_KEY: 'synthetic', HUMANIZAR_IA: 'true' } }, console,
  });
  const archivo = require.resolve('../src/services/conversationService');
  const localRequire = createRequire(archivo);
  let estado = pedido();
  let lectura = decision({ respuestaConversacional: '¿Me compartes la dirección?' });
  let llamadasCatalogo = 0;
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'tenant-test', vertical: 'petshop' }) },
    '../conversation/conversationStore': {
      obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [],
      guardarConversacionPersistida: async (_user, valor, metadata) => {
        estado = JSON.parse(JSON.stringify(valor));
        if (metadata.respuesta) estado.ultimaPreguntaAsistente = metadata.respuesta;
      },
    },
    './aiInterpreter': { interpretarMensajeCliente: async () => lectura },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => { llamadasCatalogo++; throw new Error('Catalogo inesperado'); } },
    './humanizer': humanizer.exports,
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    require: name => mocks[name] || localRequire(name), module: modulo, process, console,
  });
  const evento = { channelUserId: 'usuario-test', phoneNumberId: 'canal-test' };
  const respuesta = await modulo.exports.responderEventoEntrante({ ...evento, text: 'Tienen domicilio', messageId: 'inicio' });
  for (const campo of ['nombre', 'cedula', 'celular', 'correo', 'direccion completa', 'método de pago']) {
    assert.ok(respuesta.includes(`- ${campo}`), campo);
  }
  lectura = decision({ datosCliente, entrega: { tipo: 'domicilio', direccion, metodoPago: 'efectivo' }, respuestaConversacional: '¿Finalizamos?' });
  const resumen = await modulo.exports.responderEventoEntrante({ ...evento, text: `${lote}\nContra entrega`, messageId: 'datos' });
  assert.match(resumen, /Total: \$28\.000/);
  assert.match(resumen, /finalizamos el pedido así/);
  assert.equal(estado.ultimaPreguntaAsistente, resumen);
  assert.equal(estado.esperandoConfirmacionPedido, true);
  assert.equal(estado.pedidoConfirmado, false);
  assert.equal(llamadasHumanizador, 0);
  assert.equal(llamadasCatalogo, 0);
  // A misclassified thank-you and echoed payment must not override an explicit
  // checkout decision in the same inbound batch.
  lectura = { intencion: 'agradecimiento', accion: null, confianza: 0.99, continuarFlujo: false,
    entrega: { metodoPago: 'transferencia bancaria' }, consultaCatalogo: { necesaria: false } };
  const cierre = await modulo.exports.responderEventosEntrantes([
    { ...evento, text: 'asi esta bien', messageId: 'confirmar' },
    { ...evento, text: 'gracias', messageId: 'gracias' },
  ]);
  assert.match(cierre, /pedido queda confirmado/);
  assert.doesNotMatch(cierre, /finalizamos el pedido/);
  assert.equal(estado.metodoPago, 'efectivo');
  assert.equal(estado.pedidoConfirmado, true);
  const confirmado = JSON.parse(JSON.stringify(estado));
  for (const continuarFlujo of [false, true]) {
    lectura = { intencion: 'metodo_pago', accion: 'consultar_pago', confianza: 0.99, continuarFlujo,
      consultaCatalogo: { necesaria: false }, entrega: { metodoPago: 'transferencia bancaria' } };
    const cuentas = await modulo.exports.responderEventoEntrante({ ...evento, text: 'a donde transfiero?', messageId: `cuentas-${continuarFlujo}` });
    assert.match(cuentas, /07300007105/);
    assert.match(cuentas, /127200128222/);
    assert.match(cuentas, /@luzg5604/);
    assert.doesNotMatch(cuentas, /Pedido:|finalizamos|pedido queda confirmado|Datos de facturación/);
    for (const campo of ['pedidoConfirmado', 'confirmacionPedidoId', 'esperandoConfirmacionPedido', 'pedidoConfirmadoPendienteGuardar']) {
      assert.equal(estado[campo], confirmado[campo], campo);
    }
    assert.deepEqual(estado.carrito, confirmado.carrito);
    assert.equal(llamadasCatalogo, 0);
    assert.equal(llamadasHumanizador, 0);
  }
});

test('cuentas acompanian la reutilizacion de datos y la consulta posterior no reabre el pedido', () => {
  let estado = { ...pedido(), datosDomicilio: { ...datosCliente, direccion },
    pedidoNuevoConDatosPrevios: true, datosPreviosConfirmados: false, instruccionesPagoEnviadas: true };
  const respuesta = turno(estado, `${direccion}\nMe regalas la cuenta para hacer la consignación`, {
    accion: 'consultar_pago', entrega: { tipo: 'domicilio', direccion, metodoPago: 'transferencia bancaria' },
  });
  assert.match(respuesta, /07300007105/);
  assert.match(respuesta, /@luzg5604/);
  assert.match(respuesta, /finalizamos el pedido así/);
  assert.equal(estado.esperandoConfirmacionPedido, true);
  assert.equal(estado.pedidoConfirmado, false);
  const confirmacion = turno(estado, 'Si por favor', { intencion: 'confirmacion', accion: 'confirmar' });
  assert.match(confirmacion, /pedido queda confirmado/);
  estado.pedidoConfirmadoPendienteGuardar = false;
  estado.ultimoPedidoGuardadoKey = estado.confirmacionPedidoId;
  estado = JSON.parse(JSON.stringify(estado));
  const guardado = structuredClone(estado);
  for (const accion of ['consultar_pago', null]) {
    const cuentas = turno(estado, 'a donde transfiero?', { intencion: 'metodo_pago', accion,
      entrega: { metodoPago: 'transferencia bancaria' } });
    assert.match(cuentas, /07300007105/);
    assert.doesNotMatch(cuentas, /Pedido:|finalizamos|confirmado con esos datos/);
    assert.deepEqual(estado, guardado);
  }
  const catalogo = [{ marca: 'Prueba', referencias: [{ nombre: 'Alimento cachorro', especie: 'perro',
    presentaciones: [{ peso: '2kg', precio: 28000 }] }] }];
  resolverConsultaCatalogo('Quiero otro pedido de Prueba Alimento cachorro 2kg', estado, catalogo, {
    intencion: 'pedido_producto', accion: 'nuevo_pedido', confianza: 0.99,
    consultaCatalogo: { necesaria: true, consulta: 'Prueba Alimento cachorro 2kg' },
    producto: { marca: 'Prueba', referencia: 'Alimento cachorro', presentacion: '2kg', cantidad: 1 },
  });
  assert.equal(estado.pedidoConfirmado, false);
  assert.notEqual(estado.confirmacionPedidoId, guardado.confirmacionPedidoId);
  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].cantidad, 1);
});

test('direccion y solicitud de cuenta avanzan al resumen aunque el router omita la direccion', () => {
  for (const entrega of [{}, { tipo: 'domicilio', direccion: 'barrio Prueba diagonal 30 # 1-35 dosquebradas' }]) {
    const estado = { ...pedido(), datosDomicilio: { ...datosCliente, direccion: 'Calle anterior # 2-10' },
      pedidoNuevoConDatosPrevios: true, datosPreviosConfirmados: false };
    const respuesta = turno(estado,
      'barrio Prueba diagonal 30 # 1-35 dosquebradas\nY me regalas la cuenta por favor para hacerte la consignación muchas gracias 🤗',
      { intencion: 'metodo_pago', accion: 'consultar_pago', entrega });
    assert.match(respuesta, /07300007105/);
    assert.match(respuesta, /127200128222/);
    assert.match(respuesta, /@luzg5604/);
    assert.match(respuesta, /Total: \$28\.000/);
    assert.match(respuesta, /diagonal 30 # 1-35 dosquebradas/);
    assert.doesNotMatch(respuesta, /Calle anterior/);
    assert.match(respuesta, /finalizamos el pedido así/);
    assert.equal(estado.esperandoConfirmacionPedido, true);
    assert.equal(estado.pedidoConfirmado, false);
    assert.equal(estado.metodoPago, 'transferencia bancaria');
    assert.equal((respuesta.match(/07300007105/g) || []).length, 1);
  }
});

test('cuentas durante pedido incompleto se acompanian solo de los datos faltantes', () => {
  const estado = pedido();
  const respuesta = turno(estado, 'Calle 10 # 20-30\nMe regalas la cuenta para consignar', {
    intencion: 'metodo_pago', accion: 'consultar_pago', entrega: {},
  });
  assert.match(respuesta, /07300007105/);
  for (const campo of ['nombre', 'cedula', 'correo', 'celular']) assert.ok(respuesta.includes(`- ${campo}`));
  assert.doesNotMatch(respuesta, /- direccion completa|- método de pago|finalizamos el pedido/);
  assert.equal(estado.esperandoDatosDomicilio, true);
  assert.equal(estado.pedidoConfirmado, false);
  const mensajes = dividirRespuestaMensajes(respuesta);
  assert.equal(mensajes.length, 2);
  assert.match(mensajes[0], /Datos para transferencia/);
  assert.match(mensajes[1], /- nombre/);
  assert.doesNotMatch(mensajes[1], /finalizamos/);
});
