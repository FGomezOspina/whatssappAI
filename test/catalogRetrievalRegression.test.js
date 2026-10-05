const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const catalogo = require('../productos.json');
const { validarCoincidenciaProducto, aplicarCoincidenciaValidada } = require('../src/services/productMatchValidator');
const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { resolverLibraComercial } = require('../src/utils/commercialPresentation');
const { _internals: { seleccionarCatalogoLocal } } = require('../src/services/catalogContextService');
const clasificacion = { requiereBusquedaProducto: true, perfilContexto: 'producto' };
const mensaje = 'Y tienes comida húmeda Purina pro plan para gatos adultos ?';
// Same entity fields recorded in the failing turn: no resolved reference or size.
const interpretacion = { accion: 'consultar', intencion: 'consulta_producto', producto: {
  marca: 'Purina Pro Plan', referencia: null, linea: null, etapa: 'adulto', especie: 'gato',
  categoria: 'comida', subcategoria: 'comida humeda', cantidad: 1, presentacion: null,
  textoVisible: 'comida húmeda Purina pro plan para gatos adultos',
} };
const candidatos = catalogo.filter(m => ['PRO PLAN', 'POUCH', 'WHISKAS'].includes(m.marca));

function comprobarConsulta(recuperado) {
  assert.ok(recuperado.some(m => m.marca === 'PRO PLAN'));
  assert.ok(!recuperado.some(m => m.marca === 'POUCH'), 'el sinonimo no constituye una marca solicitada');
  const validacion = validarCoincidenciaProducto({ mensaje, interpretacion, catalogo: recuperado, clasificacion });
  assert.equal(validacion.nivel, 'alta');
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo(mensaje, estado, recuperado, aplicarCoincidenciaValidada(interpretacion, validacion));
  assert.match(respuesta, /6\.200/);
  assert.equal(estado.ultimaSeleccion.referencia, 'PRO PLAN POUCH FELINO ADULT');
  assert.equal(validacion.coincidencia.presentaciones[0].precio, 6200);
  assert.equal(validacion.coincidencia.presentaciones[0].peso, '85gr');
  assert.equal(estado.carrito.length, 0);
}

test('recuperación local no convierte sinónimos en marcas y conserva precio y estado', () => {
  comprobarConsulta(seleccionarCatalogoLocal({ catalogo: candidatos, mensaje, clasificacion }).catalogo);
});

test('recuperación remota completa: resultados RPC mezclados no desplazan la marca original', async () => {
  const archivo = require.resolve('../src/services/catalogContextService');
  const req = createRequire(archivo);
  const modulo = { exports: {} };
  const consultas = [];
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    module: modulo, process: { env: { CATALOG_SEARCH_BACKEND: 'supabase', CATALOG_SEARCH_LOGS: 'false' } }, console,
    require: name => name === '../repositories/productRepository' ? {
      buscarProductosCatalogoCliente: async (_cliente, opciones) => {
        consultas.push(opciones.query);
        return { catalogo: candidatos, metadata: { totalResultados: 8 } };
      },
    } : req(name),
  });
  const resultado = await modulo.exports.seleccionarCatalogoParaIA({ mensaje, mensajeOriginal: mensaje, clasificacion, cliente: { id: 'fixture' } });
  assert.ok(consultas.some(q => q.includes('pouch')));
  comprobarConsulta(resultado.catalogo);
});

for (const presentacion of ['libra', '1 libra', '1lb']) test(`Diamond: ${presentacion} resuelve 500gr y $19.500 en estado`, () => {
  const texto = 'Tiene díamond naturals indoor cat de libra ?';
  const decision = { accion: 'consultar', intencion: 'consulta_producto', producto: {
    marca: 'DIAMOND', referencia: 'DIAMOND INDOOR CAT', especie: 'gato', categoria: 'comida',
    subcategoria: 'concentrado', condiciones: ['indoor'], cantidad: 1, presentacion,
    textoVisible: 'díamond naturals indoor cat de libra',
  } };
  const familia = catalogo.filter(m => m.marca === 'DIAMOND');
  const v = validarCoincidenciaProducto({ mensaje: texto, interpretacion: decision, catalogo: familia, clasificacion });
  assert.equal(v.nivel, 'alta');
  assert.equal(v.presentacionSolicitada, '500g');
  assert.equal(v.equivalenciaPresentacion.catalogo, '500gr');
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo(texto, estado, familia, aplicarCoincidenciaValidada(decision, v));
  assert.match(respuesta, /500gr: \$19\.500/);
  assert.doesNotMatch(respuesta, /no tengo|no.*presentaci[oó]n/i);
  assert.equal(estado.productosConsultados[0].peso, '500gr');
  assert.equal(estado.productosConsultados[0].precio, 19500);
  assert.equal(estado.carrito.length, 0);
});

test('libra comercial no convierte empaques lb, otras cantidades ni medicamentos', () => {
  const comida = { categoria: 'comida', presentaciones: [{ peso: '500gr' }] };
  assert.equal(resolverLibraComercial('libra', comida).peso, '500gr');
  for (const cantidad of ['2lb', '18lb', '0.5lb', '500g', '1-2lb']) assert.equal(resolverLibraComercial(cantidad, comida), null);
  assert.equal(resolverLibraComercial('1lb', { ...comida, presentaciones: [{ peso: '1lb' }, { peso: '500gr' }] }), null);
  assert.equal(resolverLibraComercial('libra', { ...comida, categoria: 'medicamento' }), null);
  assert.equal(resolverLibraComercial('libra', { ...comida, presentaciones: [{ peso: '450gr' }] }), null);
});
