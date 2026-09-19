// Prueba optativa autorizada: OpenAI y catalogo configurado; estado solo en memoria.
// No usa proveedores de WhatsApp ni escribe conversaciones/pedidos en Supabase.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const interprete = require('../src/services/aiInterpreter');
const mensajes = [
  'Gracias\n📍1 bulto de 20 kilos de RINGO + PRO (bolsa negra con blanco).🐶\n- 4 kilos de cuchuco.\n- 1 kilo de Ponedora.\n- 3 paquetes de carnitas Pedigree para perros adultos razas pequeñas (sabor pollo en filetes o carne).',
  'Ringo premium 20kl y finca ponedora gruesa 1kl',
  'asi esta bien',
  'huevo quebrado',
];
let estado = crearEstadoInicial();
const historial = [];
const archivo = require.resolve('../src/services/conversationService');
const localRequire = createRequire(archivo);
const registros = [];
const mocks = {
  '../conversation/conversationStore': {
    obtenerConversacionPersistida: async () => JSON.parse(JSON.stringify(estado)),
    obtenerHistorialRecientePersistido: async () => historial,
    guardarConversacionPersistida: async (_usuario, actual, meta = {}) => {
      estado = JSON.parse(JSON.stringify(actual));
      if (meta.respuesta) {
        estado.ultimaPreguntaAsistente = meta.respuesta;
        historial.push({ direction: 'inbound', body: meta.mensaje }, { direction: 'outbound', body: meta.respuesta });
      }
    },
  },
  '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
  './aiInterpreter': { interpretarMensajeCliente: async args => {
    const resultado = await interprete.interpretarMensajeCliente(args);
    registros.push({ mensaje: args.mensaje, router: !!args.clasificacion.decisionHerramientas,
      candidatos: args.catalogo?.map(m => ({ marca: m.marca, referencias: m.referencias.map(r => r.nombre) })), resultado });
    return resultado;
  } },
};
const modulo = { exports: {} };
vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || localRequire(n), module: modulo, process, console });
(async () => {
  for (const mensaje of mensajes.slice(0, Number(process.argv[2] || 1))) {
    const respuesta = await modulo.exports.responderEventoEntrante({ channelUserId: 'prueba-aislada-carrito',
      phoneNumberId: process.env.KAPSO_SANDBOX_PHONE_NUMBER_ID || process.env.KAPSO_PHONE_NUMBER_ID, text: mensaje });
    console.log('RESULTADO_PRUEBA', JSON.stringify({ mensaje, respuesta, carrito: estado.carrito, solicitudes: estado.ultimaSolicitudProductos }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => fs.writeFileSync('/tmp/multi-cart-live-readings.json', JSON.stringify(registros, null, 2)));
