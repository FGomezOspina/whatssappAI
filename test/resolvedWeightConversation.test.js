const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');

for (const [marca, corporal, rango] of [['ADVOCATE', '30kg', '25-40kg'], ['CREDELIO', '10kg', '5-11kg']]) {
  test(`lista resuelta entrega al redactor el rango de ${marca} y elimina aclaraciones anteriores`, async () => {
    const archivo = require.resolve('../src/services/conversationService');
    const req = createRequire(archivo);
    const catalogo = require('../productos.json').filter(m => ['CUTAMYCON', marca].includes(m.marca));
    const estado = crearEstadoInicial();
    estado.ultimaPreguntaAsistente = '¿Para perro o gato y cuánto pesa?';
    estado.ultimaSolicitudProductos = [{ marca, referencia: marca, estado: 'pendiente', pregunta: estado.ultimaPreguntaAsistente }];
    estado.ultimaConsultaProducto = { terminos: [marca.toLowerCase()], aclaracion: { campo: 'peso_mascota' }, nivel: 'media' };
    estado.coincidenciasProductoPendientes = { opciones: [], creadoEn: new Date().toISOString() };
    const solicitudes = [
      { marca: 'CUTAMYCON', referencia: 'CUTAMYCON SPRAY', textoVisible: 'cutamycon 100ml', presentacion: '100ml', cantidad: 1 },
      { marca, referencia: marca, textoVisible: `${marca} para perro de ${corporal}`, presentacion: corporal, especie: 'perro', cantidad: 1 },
    ];
    let contexto;
    let comprando = false;
    const mocks = {
      './clients.service': { obtenerClienteActual: async () => ({ id: 'synthetic', vertical: 'petshop' }) },
      '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado, obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async () => {} },
      '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
      './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo, resultadosPorProducto: solicitudes.map(s => ({ catalogo: catalogo.filter(m => m.marca === s.marca) })), metadata: {} }) },
      './aiInterpreter': { interpretarMensajeCliente: async args => args.clasificacion.decisionHerramientas
        ? { intencion: comprando ? 'pedido_producto' : 'consulta_producto', accion: comprando ? 'agregar' : 'consultar', consultaCatalogo: { necesaria: true, consulta: solicitudes.map(s => s.textoVisible).join(' y ') }, productos: solicitudes }
        : { intencion: comprando ? 'pedido_producto' : 'consulta_producto', accion: comprando ? 'agregar' : 'consultar', confianza: 1, producto: solicitudes.find(s => args.mensaje.toLowerCase().includes(s.marca.toLowerCase())) } },
      './humanizer': { humanizarRespuesta: async (_m, base, opciones) => { contexto = opciones; return base; } },
    };
    const modulo = { exports: {} };
    vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || req(n), module: modulo, process, console: { log() {}, error() {} } });
    const respuesta = await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text: solicitudes.map(s => s.textoVisible).join(', y ') });
    const validado = contexto.productoAutonomo.resultados.find(r => r.solicitud.marca === marca);
    assert.equal(validado.nivel, 'alta', JSON.stringify(validado));
    assert.equal(validado.solicitud.presentacion.replace(/\s/g, ''), rango);
    assert.equal(estado.ultimaConsultaProducto, null);
    assert.equal(estado.coincidenciasProductoPendientes, null);
    assert.ok(estado.ultimaSolicitudProductos.every(s => s.estado === 'identificado' && !s.pregunta));
    assert.equal(estado.carrito.length, 0);
    assert.match(respuesta, new RegExp(marca));
    comprando = true;
    solicitudes[1].presentacion = rango;
    solicitudes[1].textoVisible = `${marca} ${rango}`;
    await modulo.exports.responderEventoEntrante({ channelUserId: 'synthetic', text: 'si me lo envías' });
    assert.equal(estado.carrito.length, 2);
    assert.equal(contexto.interpretacionIA.preguntaPendiente, null);
    assert.ok(contexto.productoAutonomo.resultados.every(r => r.nivel === 'alta' && r.solicitud.presentacion));
    assert.equal(estado.ultimaConsultaProducto, null);
  });
}
