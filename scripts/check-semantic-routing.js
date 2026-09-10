// Prueba optativa contra OpenAI. No consulta Supabase ni envia WhatsApp.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { interpretarMensajeCliente } = require('../src/services/aiInterpreter');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
(async () => {
  for (const [mensaje, catalogoNecesario] of [
    ['Para solicitar un domicilio por favor', false],
    ['Qué precio tiene el proplan para gatos EN? Y arena de maíz de 20 kilos', true],
    ['Gracias, son muy amables', false],
    ['Ringo x20kl', true],
  ]) {
    const resultado = await interpretarMensajeCliente({ mensaje, estado: crearEstadoInicial(), catalogo: [],
      clasificacion: { decisionHerramientas: true, perfilContexto: 'pedido', limiteHistorial: 12 },
      model: process.env.OPENAI_ROUTER_MODEL || 'gpt-5.4' });
    assert.ok(resultado, 'El interprete debe responder');
    assert.equal(resultado.consultaCatalogo.necesaria, catalogoNecesario);
    if (catalogoNecesario && mensaje.includes('arena')) {
      assert.ok(resultado.productos.length >= 2, 'Debe conservar ambas solicitudes');
      assert.match(resultado.consultaCatalogo.consulta, /pro\s?plan/i);
      assert.match(resultado.consultaCatalogo.consulta, /arena/i);
    }
    console.log(JSON.stringify({ mensaje, consulta: resultado.consultaCatalogo, productos: resultado.productos, respuesta: resultado.respuestaConversacional }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
