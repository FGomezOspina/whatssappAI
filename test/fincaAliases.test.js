const test = require('node:test');
const assert = require('node:assert/strict');
const { validarCoincidenciaProducto, aplicarCoincidenciaValidada } = require('../src/services/productMatchValidator');
const { _internals: { seleccionarCatalogoLocal } } = require('../src/services/catalogContextService');
const { _internals: { compactarCatalogo } } = require('../src/services/aiContextOptimizer');
const { consolidarCatalogo } = require('../src/services/catalogConsolidationService');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
const { actualizarAliases, construirPatch } = require('../scripts/update-catalog-aliases');
const config = require('../data/catalog-aliases/distrifinca-finca.json');
const catalogo = consolidarCatalogo(require('../productos.json'));
const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'pedido', requiereBusquedaProducto: true };

for (const [referencia, frases] of [
  ['FINCA HUEVO QUEBRADA', ['ponedora', 'ponedora gruesa', 'finca huevo grueso', 'huevo grueso', 'finca ponedora gruesa']],
  ['FINCA POLLO CAMP LEV', ['es para un pollo levante', 'pollo delgado', 'pollo campesino levante', 'finca pollo campesino levante']],
  ['FINCA POLLO CAMP ENG', ['es para un pollo engorde', 'pollo grueso', 'pollo campesino engorde', 'finca pollo campesino engorde']],
]) {
  test(`${referencia}: recupera y valida los nombres comerciales con presentacion`, () => {
    for (const frase of frases) {
      const mensaje = `${frase} 1kg`;
      const candidatos = seleccionarCatalogoLocal({ catalogo, mensaje, clasificacion }).catalogo;
      const validacion = validarCoincidenciaProducto({ mensaje, catalogo: candidatos, catalogoCandidatos: candidatos, clasificacion });
      assert.equal(validacion.nivel, 'alta', mensaje);
      assert.equal(validacion.coincidencia.referencia, referencia, mensaje);
    }
  });
}

test('descriptores aislados no eligen producto y una marca explicita no cambia a FINCA', () => {
  for (const mensaje of ['grueso', 'delgado', 'pollo']) {
    const r = validarCoincidenciaProducto({ mensaje, catalogo: catalogo.filter(m => m.marca === 'FINCA'), clasificacion });
    assert.notEqual(r.nivel, 'alta', mensaje);
  }
  const otro = { marca: 'OTRAPRUEBA', referencias: [{ nombre: 'OTRAPRUEBA POLLO', especie: 'ave', categoria: 'comida', presentaciones: [{ peso: '1kg', precio: 9000 }] }] };
  const r = validarCoincidenciaProducto({ mensaje: 'OTRAPRUEBA pollo delgado 1kg', catalogo: [...catalogo, otro], clasificacion });
  assert.notEqual(r.coincidencia?.marca, 'FINCA');
});

test('el contexto de pollo permite completar una aclaracion corta', () => {
  const r = validarCoincidenciaProducto({ mensaje: 'delgado 1kg', catalogo, clasificacion,
    contextoProducto: { terminos: ['FINCA', 'pollo'], presentacion: '1kg', creadoEn: new Date().toISOString(), aclaracion: { campo: 'referencia', valores: ['delgado', 'grueso'] } } });
  assert.equal(r.nivel, 'alta');
  assert.equal(r.coincidencia.referencia, 'FINCA POLLO CAMP LEV');
});

test('aliases conservan cantidades y no cambian precios ni presentaciones del motor', () => {
  const mensaje = 'pollo delgado 1kg';
  const finca = catalogo.filter(m => m.marca === 'FINCA');
  const validacion = validarCoincidenciaProducto({ mensaje, catalogo: finca, clasificacion });
  const interpretacion = aplicarCoincidenciaValidada({ intencion: 'pedido_producto', accion: 'agregar', confianza: 1,
    producto: { marca: 'FINCA', referencia: 'FINCA POLLO CAMP LEV', presentacion: '1kg', cantidad: 4 } }, validacion);
  const estado = crearEstadoInicial();
  resolverConsultaCatalogo(mensaje, estado, finca, interpretacion);
  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].cantidad, 4);
  assert.equal(estado.carrito[0].precio, 2400);
});

test('el interprete recibe aliases y contexto de uso del catalogo', () => {
  const compacto = compactarCatalogo(catalogo.filter(m => m.marca === 'FINCA'));
  const producto = compacto[0].productos.find(r => r.nombre === 'FINCA POLLO CAMP ENG');
  assert.ok(producto.aliases.includes('pollo grueso'));
  assert.match(producto.contextoUso, /engorde/);
  assert.equal(producto.especie, 'ave');
});

test('actualizacion de metadatos es aditiva e idempotente', () => {
  const anterior = { species: 'perro', metadata: { codigo: 'original', aliases: ['nombre anterior'] } };
  const patch = construirPatch(anterior, config.references[0]);
  assert.equal(patch.species, 'ave');
  assert.equal(patch.metadata.codigo, 'original');
  assert.ok(patch.metadata.aliases.includes('nombre anterior'));
  assert.deepEqual(construirPatch({ ...anterior, ...patch }, config.references[0]), patch);
  assert.deepEqual(Object.keys(patch).sort(), ['metadata', 'species']);
});

test('no modifica nada si falta una referencia o si solo se solicita dry run', async () => {
  let escrituras = 0;
  const request = async (path, opciones) => {
    if (opciones) { escrituras++; return []; }
    if (path.startsWith('aivance_clients')) return [{ id: 'cliente', slug: config.client }];
    if (path.startsWith('catalog_brands')) { assert.match(path, /client_id=eq.cliente/); return [{ id: 'marca', name: 'FINCA' }]; }
    return config.references.map((r, i) => ({ id: String(i), name: r.name, species: 'perro', metadata: {} }));
  };
  await actualizarAliases(config, { request });
  await assert.rejects(actualizarAliases({ ...config, references: [...config.references, { name: 'INEXISTENTE', aliases: [] }] }, { request, apply: true }), /inexistente/);
  assert.equal(escrituras, 0);
});

test('un alias compartido sigue requiriendo aclaracion', () => {
  const referencias = ['FORMULA CRECIMIENTO', 'MEZCLA TERMINACION'].map(nombre => ({ nombre, especie: 'ave', categoria: 'comida',
    metadata: { aliases: ['pollo comun'] }, presentaciones: [{ peso: '1kg', precio: 2000 }] }));
  const r = validarCoincidenciaProducto({ mensaje: 'pollo comun 1kg', catalogo: [{ marca: 'PRUEBA', referencias }], clasificacion });
  assert.notEqual(r.nivel, 'alta');
});

test('un alias no autoriza sustituir una presentacion que no existe', () => {
  const r = validarCoincidenciaProducto({ mensaje: 'ponedora 25kg', catalogo: catalogo.filter(m => m.marca === 'FINCA'), clasificacion });
  assert.equal(r.presentacionSolicitada, '25kg');
  assert.equal(r.presentacionValida, false);
});
