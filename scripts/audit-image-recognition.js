// Diagnóstico de solo lectura: visión y búsqueda reales; estado/historial local,
// sin guardar conversaciones/pedidos ni enviar mensajes. No modifica el motor.
// node scripts/audit-image-recognition.js primera.png segunda.png informe.json
require('dotenv').config({ quiet: true });
process.env.PRODUCT_RECOGNITION_TRACE = 'true';
const fs = require('node:fs'), vm = require('node:vm');
const { createRequire } = require('node:module');
const { contexto, crearContexto } = require('../src/services/pipelineTelemetry');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { obtenerClienteActual } = require('../src/services/clients.service');
const { respuestaParaHistorial } = require('../src/utils/responseMessages');
const { normalizar } = require('../src/utils/text');

async function main() {
  const [primera, segunda, destino] = process.argv.slice(2);
  if (!primera || !segunda || !destino) throw Error('Indica dos PNG y el archivo JSON de salida');
  const imagenes = [primera, segunda].map(p => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'));
  const cliente = await obtenerClienteActual({ phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID, channelUserId: 'auditoria-local' });
  let estado = crearEstadoInicial(), historial = [];
  const resultados = [], trazas = [];
  const originalLog = console.log;
  console.log = (...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith('[PRODUCT_TRACE] ')) trazas.push(JSON.parse(args[0].slice(16)));
    originalLog(...args);
  };
  const archivo = require.resolve('../src/services/conversationService'), req = createRequire(archivo), modulo = { exports: {} };
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => cliente },
    '../conversation/conversationStore': {
      obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => historial,
      guardarConversacionPersistida: async (_u, e, meta = {}) => {
        estado = e;
        // Simular entrega del resultado: el store real marca las cotizaciones
        // respondidas al confirmar el envío. No dejar pendientes artificiales.
        if (meta.respuesta) {
          estado.ultimaPreguntaAsistente = respuestaParaHistorial(meta.respuesta);
          for (const p of estado.historialProductosConsultados || []) {
            if (p.pendienteRespuesta && p.referencia && normalizar(estado.ultimaPreguntaAsistente).includes(normalizar(p.referencia))) p.pendienteRespuesta = false;
          }
        }
      },
    },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './humanizer': { humanizarRespuesta: async (_m, base) => base },
    './mediaProcessor': { procesarMultimedia: async e => ({ text: e.text || '', imageUrl: e.media?.url || null }) },
  };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: n => mocks[n] || req(n), module: modulo, process, console });
  const casos = [
    ['sola-1', [0], true, '¿Qué precio tiene?'],
    ['sola-2', [0], true, '¿Qué precio tiene?'],
    ['juntas', [0, 1], true, '¿Qué precio tienen?'],
    ['reenviada', [0], false, '¿Qué precio tiene?'],
    ['imagen-con-peso', [0], true, 'Max cat 10kg'],
    ['reenviada-tras-peso', [0], false, '¿Qué precio tiene?'],
    ['seguimiento-foto', [0], true, 'Qué precio tiene'],
    ['seguimiento-10', [], false, 'x10kg'],
    ['seguimiento-10-repetido', [], false, 'x10kg'],
    ['seguimiento-10.1', [], false, 'x10.1kg'],
    ['seguimiento-envio', [], false, 'me lo envias por favor'],
    ['dos-fotos-inicial', [1, 0], true, 'Qué precio tienen estos productos? Para Villanova del campo Bloque 39 apto 202. Te puedo pagar con tarjeta de crédito cuando lo lleven?'],
    ['dos-fotos-10', [], false, 'x10kg'],
    ['dos-fotos-10-repetido', [], false, 'x10kg'],
    ['dos-fotos-envio', [], false, 'me los envias por favor'],
    ['fotos-entrega-inicial', [1, 0], true, 'Para Bloque 1 apto 101\nTe puedo pagar con tarjeta cuando lo lleven?'],
    ['fotos-entrega-repeticion', [1, 0], true, 'Para Bloque 1 apto 101\nTe puedo pagar con tarjeta cuando lo lleven?'],
    ['fotos-entrega-10', [], false, 'x10kg'],
    ['fotos-entrega-envio', [], false, 'me los envias por favor'],
  ].filter(c => !process.env.AUDIT_CASE_FILTER || c[0].includes(process.env.AUDIT_CASE_FILTER));
  for (const [caso, indices, reset, texto] of casos) {
    if (reset) { estado = crearEstadoInicial(); historial = []; }
    const inicio = trazas.length;
    const ctx = crearContexto(caso);
    let respuesta, error;
    try {
      respuesta = await contexto.run(ctx, () => modulo.exports.responderEventosEntrantes((indices.length ? indices : [null]).map((i, j) => ({
        channelUserId: 'auditoria-local', phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID,
        text: j === 0 ? texto : '', media: i === null ? null : { type: 'image', url: imagenes[i] },
      }))));
    } catch (e) { error = e.message; }
    historial.push({ direction: 'inbound', body: texto }, { direction: 'outbound', body: respuestaParaHistorial(respuesta) });
    resultados.push({ caso, respuesta, error, trazas: trazas.slice(inicio),
      solicitudes: JSON.parse(JSON.stringify(estado.ultimaSolicitudProductos)),
      carrito: JSON.parse(JSON.stringify(estado.carrito)),
      productosConsultados: JSON.parse(JSON.stringify(estado.productosConsultados)),
      ultimaConsulta: JSON.parse(JSON.stringify(estado.ultimaConsultaProducto)) });
    fs.writeFileSync(destino, JSON.stringify(resultados, null, 2));
    originalLog('AUDIT_CASE ' + JSON.stringify({ caso, error, respuesta }));
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
