const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const CLIENT = '11111111-1111-4111-8111-111111111111';
function cargar(name, request, env = {}) {
  const file = require.resolve(`../src/repositories/${name}`), req = createRequire(file), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, process: { env }, AbortSignal,
    console: { error() {} }, require: n => n === './supabaseClient' ? { requestSupabase: request, supabaseConfigurado: () => true } : req(n) });
  return module.exports;
}
function caso() {
  return { estado: { _turnoEntrante: { turnId: 'synthetic-event' }, datosDomicilio: { nombre: 'Persona Prueba' },
    _interpretacionTurno: { intencion: 'consulta_producto', accion: 'consultar', productos: [
      { marca: 'PRUEBA', textoVisible: 'Persona Prueba correo: prueba@example.org', cantidad: 3, estado: 'pendiente', precio: 9000 },
    ] } }, metadatos: { cliente: { id: CLIENT }, mensaje: 'Me refiero al otro producto' } };
}

test('captura inactiva, sin precios ni contacto, idempotente y aislada por empresa', async () => {
  const calls = [];
  const repo = cargar('learningRepository', async (...args) => { calls.push(args); });
  const { estado, metadatos } = caso(), before = JSON.stringify(estado);
  const a = repo.construirCandidato(estado, metadatos);
  assert.equal(a.active, false);
  assert.ok(a.tags.includes('learning:pending'));
  assert.equal(a.id, repo.construirCandidato(estado, metadatos).id);
  assert.notEqual(a.id, repo.construirCandidato(estado, { ...metadatos, cliente: { id: '22222222-2222-4222-8222-222222222222' } }).id);
  assert.doesNotMatch(a.customer_message, /Persona Prueba|example.org|9000/);
  await repo.capturarAprendizaje(estado, metadatos);
  assert.match(calls[0][1].headers.Prefer, /ignore-duplicates/);
  assert.equal(JSON.stringify(estado), before);
});

test('fallo de captura y modo desactivado no alteran el pedido', async () => {
  const { estado, metadatos } = caso();
  estado.carrito = [{ referencia: 'PRUEBA', cantidad: 3 }];
  const before = JSON.stringify(estado);
  const repo = cargar('learningRepository', async () => { throw Error('sin conexión'); });
  await assert.doesNotReject(repo.capturarAprendizaje(estado, metadatos));
  assert.equal(JSON.stringify(estado), before);
  let llamadas = 0;
  await cargar('learningRepository', async () => { llamadas++; }, { LEARNING_CAPTURE_ENABLED: 'false' }).capturarAprendizaje(estado, metadatos);
  assert.equal(llamadas, 0);
});

test('aprobar requiere revisión, controla empresa y permite revocar sin borrar historial', async () => {
  const { estado, metadatos } = caso();
  let row;
  const calls = [];
  const repo = cargar('learningRepository', async (url, options) => {
    calls.push(url);
    if (!options) return [row];
    row = { ...row, ...JSON.parse(options.body) }; return [row];
  });
  row = { ...repo.construirCandidato(estado, metadatos), updated_at: '2026-10-01T00:00:00Z' };
  await assert.rejects(repo.revisarCandidato(CLIENT, row.id, 'approve', {}), /requiere/);
  const revision = { customer_message: 'Tres latas de producto', ideal_response: 'Conservar cantidad y validar catálogo.', notes: 'El envase no equivale al peso.', reviewed_by: 'operador' };
  await assert.rejects(repo.revisarCandidato(CLIENT, row.id, 'approve', { ...revision, ideal_response: 'Cuesta $8000' }), /retira precios/);
  await repo.revisarCandidato(CLIENT, row.id, 'approve', revision);
  assert.equal(row.active, true);
  assert.ok(row.tags.includes('learning:approved'));
  await repo.revisarCandidato(CLIENT, row.id, 'revoke', { reason: 'Ejemplo corregido' });
  assert.equal(row.active, false);
  assert.ok(row.notes.includes('operador'));
  assert.ok(calls.every(url => url.includes(`client_id=eq.${CLIENT}`)));
  assert.ok(calls.every(url => decodeURIComponent(url).includes('tags=cs.{learning:v1}')));
  assert.ok(calls.some(url => url.includes('updated_at=eq.')));
});

test('recuperación excluye no aprobados incluso activos; permite apagar solo aprendizaje', async () => {
  const base = { intent: 'consulta', customer_message: 'tres latas producto', ideal_response: 'Consultar catálogo', priority: 0 };
  const rows = ['pending', 'approved', 'rejected', 'revoked'].map(status => ({ ...base, tags: ['learning:v1', `learning:${status}`] }));
  const urls = [];
  const repo = cargar('trainingExampleRepository', async url => { urls.push(url); return rows; });
  const examples = await repo.obtenerEjemplosEntrenamiento('latas producto', 8, { id: CLIENT });
  assert.equal(examples.length, 1);
  assert.ok(examples[0].tags.includes('learning:approved'));
  assert.equal(urls.length, 2);
  assert.ok(decodeURIComponent(urls[1]).includes('tags=cs.{learning:v1,learning:approved}'));
  const disabled = cargar('trainingExampleRepository', async () => [...rows, { ...base, tags: ['curado'] }], { LEARNING_RETRIEVAL_ENABLED: 'false' });
  assert.equal((await disabled.obtenerEjemplosEntrenamiento('latas producto', 8, { id: CLIENT })).length, 1);
  const anonymousUrls = [];
  await cargar('trainingExampleRepository', async url => { anonymousUrls.push(url); return []; }).obtenerEjemplosEntrenamiento('producto');
  assert.ok(anonymousUrls.every(url => url.includes('client_id=is.null')));
});

test('recuperación tolera fallos y no usa ejemplos aprendidos irrelevantes', async () => {
  const repo = cargar('trainingExampleRepository', async () => { throw Error('sin conexión'); });
  assert.equal((await repo.obtenerEjemplosEntrenamiento('producto', 8, { id: CLIENT })).length, 0);
  const irrelevant = cargar('trainingExampleRepository', async () => [{ customer_message: 'vacaciones', tags: ['learning:v1', 'learning:approved'], priority: 100 }]);
  assert.equal((await irrelevant.obtenerEjemplosEntrenamiento('alimento', 8, { id: CLIENT })).length, 0);
});
