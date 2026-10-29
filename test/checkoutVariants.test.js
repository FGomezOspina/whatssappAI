const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { resolverConsultaCatalogo, camposDomicilioFaltantes, registrarDatosCierre } = require('../src/verticals/petshop/orderLogic');
const { solicitudFacturaElectronica } = require('../src/verticals/petshop/checkoutData');
const carrito = [{ marca: 'Prueba', referencia: 'Producto', peso: '1kg', precio: 12000, cantidad: 2 }];
const normal = 'Celular: +57 300 000 0000; Dirección: Calle 20 # 30-40; Nombre: Ana Prueba; pago: contraentrega';
const fiscal = 'Correo: compras@example.com; NIT: 900.000.001-1; razón social: Empresa Prueba SAS';
function pedido() { return { ...crearEstadoInicial(), carrito: structuredClone(carrito), entrega: { tipo: 'domicilio' }, esperandoDatosDomicilio: true }; }
function turno(s, texto, datos = {}) { return resolverConsultaCatalogo(texto, s, [], { intencion: 'datos_envio', consultaCatalogo: { necesaria: false }, ...datos }); }

test('normal completo desordenado pasa al resumen sin documento ni email y confirma una vez', () => {
  const s = pedido(); const r = turno(s, normal);
  assert.match(r, /finalizamos el pedido/); assert.doesNotMatch(r, /c[eé]dula|correo|factur/i);
  assert.equal(s.datosDomicilio.celular, '3000000000'); assert.equal(s.facturacionElectronica, false);
  assert.equal(s.pedidoConfirmado, false);
  const clave = s.confirmacionPedidoId;
  turno(s, 'así está bien', { intencion: 'confirmacion', accion: 'confirmar', confianza: 1 });
  assert.equal(s.pedidoConfirmado, true); assert.equal(s.confirmacionPedidoId, clave);
  turno(s, 'confirmo', { intencion: 'confirmacion', accion: 'confirmar', confianza: 1 });
  assert.equal(s.confirmacionPedidoId, clave); assert.equal(s.carrito[0].cantidad, 2);
});

test('electrónica completa con razón social, NIT y datos juntos', () => {
  const s = pedido(); const r = turno(s, `Necesito factura electrónica; ${normal}; ${fiscal}`);
  assert.equal(s.facturacionElectronica, true); assert.equal(s.datosDomicilio.cedula, '900000001-1');
  assert.equal(s.datosDomicilio.nombre, 'Empresa Prueba SAS');
  assert.match(r, /facturación electrónica/); assert.match(r, /finalizamos el pedido/);
  assert.deepEqual(camposDomicilioFaltantes(s), []);
});

test('datos previos, parciales, factura sobrevenida y cancelada conservan entrega y pago', () => {
  let s = pedido();
  turno(s, 'Nombre: Ana Prueba; celular: 3000000000');
  s = JSON.parse(JSON.stringify(s));
  let r = turno(s, 'Dirección: Calle 20 # 30-40; efectivo');
  assert.match(r, /finalizamos el pedido/);
  r = turno(s, 'Ahora necesito factura electrónica');
  assert.match(r, /- cedula o NIT/); assert.match(r, /- correo/);
  assert.doesNotMatch(r, /- nombre|- celular|- direccion|- método/);
  assert.equal(s.pedidoConfirmado, false);
  turno(s, 'NIT: 900000001-1');
  r = turno(s, 'No necesito factura electrónica');
  assert.equal(s.facturacionElectronica, false); assert.match(r, /finalizamos el pedido/);
  assert.equal(s.datosDomicilio.nombre, 'Ana Prueba'); assert.equal(s.metodoPago, 'efectivo');
});

test('no infiere factura por datos ni consultas y respeta negación/corrección', () => {
  for (const texto of ['necesito factura', '¿Hacen factura electrónica?', '¿Qué es factura electrónica?', 'si necesito factura electrónica les aviso', 'correo: test@example.com; NIT: 900000001']) {
    assert.equal(solicitudFacturaElectronica(texto), null, texto);
    const s = pedido(); turno(s, texto); assert.equal(s.facturacionElectronica, false);
  }
  for (const texto of ['No necesito factura electrónica', 'sin factura electrónica', 'Cancela la factura electrónica', 'ya no quiero factura electrónica']) assert.equal(solicitudFacturaElectronica(texto), false, texto);
  assert.equal(solicitudFacturaElectronica('No necesito factura electrónica, pero ahora sí quiero factura electrónica'), true);
  assert.equal(solicitudFacturaElectronica('Necesito factura electrónica; no quiero factura electrónica'), false);
});

test('inválidos no completan campos; correcciones válidas y null no borran memoria', () => {
  const s = pedido();
  let r = turno(s, 'necesito factura electrónica; nombre: Ana; celular: 123; correo: sin-arroba; cédula: abc; dirección: Calle 20; pago: bitcoin');
  assert.equal(s.esperandoConfirmacionPedido, false); assert.equal(camposDomicilioFaltantes(s).length, 5);
  r = turno(s, normal + '; correo: ana@example.com; cédula: 1234567890');
  assert.match(r, /finalizamos/);
  r = turno(s, 'nombre: Ana Corregida; celular: 3010000000; dirección: Calle 21 # 30-40');
  assert.equal(s.datosDomicilio.nombre, 'Ana Corregida'); assert.equal(s.datosDomicilio.celular, '3010000000');
  assert.equal(s.datosDomicilio.direccion, 'Calle 21 # 30-40');
  const copia = structuredClone(s.datosDomicilio);
  turno(s, 'gracias', { datosCliente: { nombre: null, cedula: null, correo: null, celular: null }, entrega: { direccion: null, metodoPago: null } });
  assert.deepEqual(s.datosDomicilio, copia);
  turno(s, 'celular: abc; correo: incorrecto'); assert.deepEqual(s.datosDomicilio, copia);
});

test('no confunde NIT que empieza por 3, números en email o dirección con celular', () => {
  const s = pedido();
  const r = turno(s, 'necesito factura electrónica; NIT: 3000000000; correo: 3010000000@example.com; dirección: Calle 20 # 30-40; nombre: Ana Prueba; efectivo');
  assert.equal(s.datosDomicilio.cedula, '3000000000'); assert.equal(s.datosDomicilio.celular, undefined);
  assert.match(r, /- celular/); assert.doesNotMatch(r, /finalizamos/);
  turno(s, 'celular: 3020000000'); assert.deepEqual(camposDomicilioFaltantes(s), []);
});

for (const [entrada, esperado] of [['contraentrega','efectivo'],['transferencia','transferencia bancaria'],['tarjeta débito','tarjeta debito o credito'],['tarjeta crédito','tarjeta debito o credito'],['llave Bre-B','llave Bre-B']]) {
  test(`pago ${entrada} no solicita credenciales y permite continuar`, () => {
    const s = pedido(); const r = turno(s, normal.replace('contraentrega', entrada));
    assert.equal(s.metodoPago, esperado); assert.match(r, /finalizamos/);
    assert.doesNotMatch(r, /CVV|número de tarjeta|clave de acceso/i);
  });
}

test('datos anteriores a carrito se conservan; teléfono del canal nunca se toma automáticamente', () => {
  const s = crearEstadoInicial();
  registrarDatosCierre('Nombre: Ana Prueba; dirección: Calle 20 # 30-40', s, { intencion: 'datos_envio' });
  s.carrito = structuredClone(carrito);
  const r = turno(s, 'efectivo');
  assert.match(r, /- celular/); assert.doesNotMatch(r, /- nombre|- direccion/);
  assert.equal(s.datosDomicilio.celular, undefined);
});

test('confirmación semántica no salta datos inválidos de un estado legado', () => {
  const s = pedido(); turno(s, normal);
  s.datosDomicilio.celular = '123';
  const r = turno(s, 'sí', { intencion: 'confirmacion', accion: 'confirmar', confianza: 1 });
  assert.equal(s.pedidoConfirmado, false); assert.match(r, /- celular/);
});

test('formato libre, sin etiquetas, de varios mensajes y de una sola línea', () => {
  for (const texto of ['Ana Prueba\nCalle 20 # 30-40\n3000000000\nefectivo',
    '3000000000, efectivo, Ana Prueba, Calle 20 # 30-40',
    'Ana Prueba Calle 20 # 30-40 celular 3000000000 pago efectivo']) {
    const s = pedido(); const r = turno(s, texto);
    assert.match(r, /finalizamos/, texto); assert.equal(s.datosDomicilio.nombre, 'Ana Prueba');
    assert.deepEqual(camposDomicilioFaltantes(s), []);
  }
});

test('cambio de dirección completa conserva resto y pasa directamente a revisión', () => {
  const s = pedido(); turno(s, normal);
  s.esperandoConfirmacionPedido = false; s.esperandoCambioDireccion = true;
  const r = turno(s, 'Dirección: Calle 22 # 30-40');
  assert.match(r, /finalizamos/); assert.doesNotMatch(r, /siguen iguales|pásame|compárteme/i);
  assert.equal(s.datosDomicilio.nombre, 'Ana Prueba');
});

test('pedido posterior no hereda factura electrónica; acepta una petición nueva explícita', () => {
  for (const quiere of [false, true]) {
    const s = pedido(); turno(s, `Necesito factura electrónica; ${normal}; ${fiscal}`);
    turno(s, 'así está bien', { intencion: 'confirmacion', accion: 'confirmar', confianza: 1 });
    const claveAnterior = s.confirmacionPedidoId;
    turno(s, `Nuevo pedido${quiere ? ' con factura electrónica' : ''}`, { accion: 'nuevo_pedido' });
    assert.equal(s.facturacionElectronica, quiere);
    assert.notEqual(s.confirmacionPedidoId, claveAnterior);
    assert.equal(s.pedidoConfirmado, false);
    assert.equal(s.ultimoPedidoConfirmado.facturacionElectronica, true);
  }
});

test('ráfagas simultáneas, factura sobrevenida y confirmación duplicada conservan un solo cierre por cliente', async t => {
  const { crearCoordinador } = require('../src/services/conversationScheduler');
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const estados = new Map(); const cierres = new Set(); const enviados = [];
  const micro = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
  const c = crearCoordinador({ ventanaMs: 5,
    procesar: async eventos => {
      const key = `${eventos[0].phoneNumberId}:${eventos[0].channelUserId}`;
      const s = estados.get(key) || pedido(); estados.set(key, s);
      const mensaje = eventos.map(e => e.text).join('\n');
      const r = turno(s, mensaje, /^así está bien/.test(mensaje)
        ? { intencion: 'confirmacion', accion: 'confirmar', confianza: 1 } : {});
      // Simulated repository unique constraint; persistence itself is tested
      // with the real repository and mocked Supabase in the store tests.
      if (s.pedidoConfirmadoPendienteGuardar) { cierres.add(`${key}:${s.confirmacionPedidoId}`); s.pedidoConfirmadoPendienteGuardar = false; }
      estados.set(key, JSON.parse(JSON.stringify(s))); return r;
    }, enviar: async evento => enviados.push(evento.text), typing: async () => {}, dividir: r => [r] });
  t.after(() => c.cerrar());
  const evento = (phoneNumberId, messageId, text) => ({ phoneNumberId, channelUserId: 'cliente-sintetico', recipientId: 'cliente-sintetico', messageId, text });
  await Promise.all([
    c.recibir(evento('tenant-a', '1', 'Nombre: Ana Prueba; Celular: 3000000000')),
    c.recibir(evento('tenant-a', '2', 'Dirección: Calle 20 # 30-40; efectivo')),
    c.recibir(evento('tenant-b', '1', 'Nombre: Otra Persona')),
  ]);
  t.mock.timers.tick(5); await micro();
  assert.equal(estados.get('tenant-a:cliente-sintetico').esperandoConfirmacionPedido, true);
  assert.equal(estados.get('tenant-b:cliente-sintetico').datosDomicilio.celular, undefined);
  await Promise.all([
    c.recibir(evento('tenant-a', '3', 'Necesito factura electrónica')),
    c.recibir(evento('tenant-a', '4', fiscal)),
  ]);
  t.mock.timers.tick(5); await micro();
  assert.equal(estados.get('tenant-a:cliente-sintetico').facturacionElectronica, true);
  const confirmar = evento('tenant-a', '5', 'así está bien');
  await Promise.all([c.recibir(confirmar), c.recibir(confirmar)]);
  t.mock.timers.tick(5); await micro();
  assert.equal(cierres.size, 1);
  assert.equal(estados.get('tenant-a:cliente-sintetico').carrito[0].cantidad, 2);
  assert.equal(estados.get('tenant-b:cliente-sintetico').facturacionElectronica, false);
  assert.equal(enviados.filter(r => /pedido queda confirmado/.test(r)).length, 1);
});

test('paráfrasis semántica de electrónica necesita evidencia textual; datos fiscales no bastan', () => {
  const s = pedido(); turno(s, normal);
  const texto = 'Para esta compra necesito que me hagan la factura electrónica a nombre de mi empresa';
  const r = turno(s, texto, { facturacion: { electronica: true, evidencia: texto } });
  assert.equal(s.facturacionElectronica, true); assert.match(r, /- cedula/);
  for (const evidencia of ['necesito factura electrónica', 'NIT: 900000001', null]) {
    const otro = pedido(); turno(otro, 'NIT: 900000001', { facturacion: { electronica: true, evidencia } });
    assert.equal(otro.facturacionElectronica, false);
  }
  turno(s, 'ya no la necesito'); assert.equal(s.facturacionElectronica, false);
});

test('etiquetas explícitas prevalecen si el intérprete confunde documento o email con celular', () => {
  for (const texto of ['NIT: 3000000000', 'Correo: 3000000000@example.com']) {
    const s = pedido();
    const r = turno(s, texto, { datosCliente: { celular: '3000000000' } });
    assert.equal(s.datosDomicilio.celular, undefined, texto);
    assert.match(r, /- celular/);
  }
});
