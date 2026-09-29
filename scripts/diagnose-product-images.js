// Ejecuta el flujo real de vision, busqueda y respuesta sin guardar una
// conversacion ni enviar WhatsApp. Usa las credenciales configuradas en .env.
// node scripts/diagnose-product-images.js imagen.jpg [otra.png ...]
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const interprete = require('../src/services/aiInterpreter');
const buscador = require('../src/services/catalogContextService');

async function diagnosticarImagenes(archivos, { mensajes = [] } = {}) {
  if (!archivos.length) throw new Error('Indica una o varias imagenes locales.');
  const imagenes = archivos.map(archivo => {
    const extension = path.extname(archivo).toLowerCase();
    const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extension];
    if (!mime) throw new Error(`Formato no soportado: ${extension}`);
    return `data:${mime};base64,${fs.readFileSync(archivo).toString('base64')}`;
  });
  let estado = crearEstadoInicial();
  const lecturas = [], busquedas = [];
  const mocks = {
    '../conversation/conversationStore': {
      obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [],
      guardarConversacionPersistida: async (_id, nuevo) => { estado = JSON.parse(JSON.stringify(nuevo)); },
    },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './mediaProcessor': { procesarMultimedia: async evento => ({ text: evento.text,
      imageUrl: evento.media ? imagenes[evento.media.imageIndex] : null }) },
    './aiInterpreter': { ...interprete, interpretarMensajeCliente: async args => {
      const lectura = await interprete.interpretarMensajeCliente(args);
      lecturas.push(JSON.parse(JSON.stringify({ etapa: args.clasificacion.decisionHerramientas ? 'lectura_inicial' : 'mapeo',
        producto: lectura?.producto, productos: lectura?.productos })));
      return lectura;
    } },
    './catalogContextService': { ...buscador, seleccionarCatalogoParaIA: async args => {
      const resultado = await buscador.seleccionarCatalogoParaIA(args);
      busquedas.push({ consultas: args.consultas, candidatos: resultado.catalogo.map(m => ({ marca: m.marca,
        referencias: m.referencias.map(r => r.nombre) })) });
      return resultado;
    } },
  };
  const archivo = require.resolve('../src/services/conversationService');
  const req = createRequire(archivo), modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    require: nombre => mocks[nombre] || req(nombre), module: modulo, process, console,
  });
  const respuesta = await modulo.exports.responderEventosEntrantes(imagenes.map((_imagen, imageIndex) => ({
    channelUserId: 'diagnostico-imagenes-sin-envio', phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID,
    text: imageIndex === 0 ? 'Buenos días. ¿Tienen estos productos?' : '', media: { type: 'image', imageIndex },
  })));
  const continuaciones = [];
  for (const text of mensajes) continuaciones.push({ mensaje: text,
    respuesta: await modulo.exports.responderEventoEntrante({ channelUserId: 'diagnostico-imagenes-sin-envio',
      phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID, text }) });
  return { lecturas, busquedas, respuesta, continuaciones, solicitudes: estado.ultimaSolicitudProductos,
    cotizados: estado.productosConsultados, carrito: estado.carrito };
}

if (require.main === module) diagnosticarImagenes(process.argv.slice(2))
  .then(resultado => console.log(JSON.stringify(resultado, null, 2)))
  .catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { diagnosticarImagenes };
