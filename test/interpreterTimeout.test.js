const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');

test('el interprete usa un timeout independiente y un solo reintento del SDK', async () => {
  const archivo = require.resolve('../src/services/aiInterpreter');
  const localRequire = createRequire(archivo);
  let opciones;
  class OpenAI {
    chat = { completions: { create: async (_payload, options) => {
      opciones = options;
      return { choices: [{ message: { content: JSON.stringify({ intencion: 'otro', consultaCatalogo: { necesaria: false } }) } }] };
    } } };
  }
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    require: name => name === 'openai' ? OpenAI : localRequire(name), module: modulo,
    process: { env: { OPENAI_API_KEY: 'synthetic', OPENAI_TIMEOUT_MS: '7000' } },
    console: { log() {}, warn() {} },
  });
  const resultado = await modulo.exports.interpretarMensajeCliente({ mensaje: 'prueba', estado: {}, catalogo: [], clasificacion: {} });
  assert.ok(resultado);
  assert.equal(opciones.timeout, 30000);
  assert.equal(opciones.maxRetries, 1);
});
