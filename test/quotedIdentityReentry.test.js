const test = require('node:test'), assert = require('node:assert/strict');
const { recuperarConsultaCotizada: recover } = require('../src/services/productRequestContext');
function fixture() {
  const quoted = { marca: 'NOVAS', referencia: 'NOVAS FEL A/B', especie: 'gato', estado: 'cotizado',
    observado: { nombre: "Nova's a/b Complete Care" }, cotizacion: [{ peso: '2kg', precio: 10 }],
    contextoCreadoEn: new Date().toISOString() };
  const state = { ultimaConsultaProducto: { solicitudOriginal: { producto: { marca: 'OTRA', referencia: 'OTRA DIETA' } } },
    seleccionesProducto: [quoted] };
  const decision = { accion: 'consultar', intencion: 'consulta_producto', seguimientoProducto: 'aclaracion', confianza: .99,
    producto: { marca: "Nova's", referencia: 'a/b Complete Care', especie: 'gato', intencionPresentaciones: 'todas' } };
  return { state, decision, quoted };
}
test('returning to an earlier quote retains its protected code and re-queries without cached prices', () => {
  const { state, decision } = fixture(), before = JSON.stringify(state);
  const r = recover(decision, state, 'qué presentaciones tienes de Novas');
  assert.equal(r.producto.referencia, 'NOVAS FEL A/B');
  assert.match(r._consultaContinuada, /A\/B/);
  assert.equal(r.producto.presentacion, null);
  assert.equal(r.producto.cotizacion, undefined);
  assert.equal(r.producto.precio, undefined);
  assert.equal(JSON.stringify(state), before);
});
test('re-entry respects code, variant, species, format, explicit new request and expiry', () => {
  for (const change of [d => d.producto.referencia = 'x/y', d => d.producto.referencia = 'a/b OtraVariante',
    d => d.producto.especie = 'perro', d => d.seguimientoProducto = 'nueva', d => d.accion = 'agregar']) {
    const { state, decision } = fixture(); change(decision);
    assert.equal(recover(decision, state, 'otra consulta'), decision);
  }
  const { state, decision, quoted } = fixture();
  quoted.contextoCreadoEn = '2020-01-01';
  assert.equal(recover(decision, state, 'presentaciones'), decision);
  state.historialProductosConsultados = [{ marca: quoted.marca, referencia: quoted.referencia, actualizadoEn: new Date().toISOString() }];
  assert.notEqual(recover(decision, state, 'presentaciones'), decision);
  quoted.subcategoria = 'concentrado'; decision.producto.subcategoria = 'comida_humeda';
  assert.equal(recover(decision, state, 'lata'), decision);
});
test('brand-only clarification cannot select between two previously quoted references', () => {
  const { state, decision, quoted } = fixture();
  state.seleccionesProducto.push({ ...quoted, referencia: 'NOVAS FEL X/Y' });
  decision.producto.referencia = null;
  assert.equal(recover(decision, state, 'qué presentaciones de Novas'), decision);
});
test('actual saved failing router/state recovers C/D after Advance at the original episode time', () => {
  const fs = require('node:fs'), vm = require('node:vm'), { createRequire } = require('node:module');
  const rows = fs.readFileSync(require.resolve('../docs/reports/multimedia-2026-10-30/api-followups-v1.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const prior = rows[1], failure = rows[2], file = require.resolve('../src/services/productRequestContext');
  class EpisodeDate extends Date { static now() { return Date.parse(failure.at); } }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require: createRequire(file), Date: EpisodeDate });
  const decision = failure.interpretations.find(i => i.router).result;
  const result = module.exports.recuperarConsultaCotizada(decision, prior.state, failure.text);
  assert.equal(result.producto.referencia, 'HILLS FEL C/D');
  assert.match(result.consultaCatalogo.consulta, /C\/D/);
  assert.doesNotMatch(result.consultaCatalogo.consulta, /I\/D/);
});
test('pending image identity survives a shorter question and switching to another item', () => {
  const { recuperarSolicitudPendiente, identidadCompatibleAlAclarar } = require('../src/services/productRequestContext');
  const prior = { marca: 'NOVAS', referencia: 'A/B', linea: 'Nutrition', especie: 'gato', estado: 'pendiente',
    observado: { nombre: 'NOVAS Nutrition A/B', confianzaIdentidad: .95 }, contextoCreadoEn: new Date().toISOString() };
  const state = { ultimaSolicitudProductos: [prior], ultimaConsultaProducto: { solicitudOriginal: { producto: { marca: 'OTRA' } } } };
  const decision = { accion: 'consultar', seguimientoProducto: 'aclaracion', confianza: .9,
    producto: { marca: 'NOVAS', linea: 'Nutrition', referencia: null, intencionPresentaciones: 'todas' } };
  const r = recuperarSolicitudPendiente(decision, state, 'presentaciones de Novas');
  assert.match(r._consultaContinuada, /A\/B/);
  assert.equal(r.producto.observado.nombre, prior.observado.nombre);
  assert.equal(r.producto.cotizacion, undefined);
  assert.equal(identidadCompatibleAlAclarar(prior, { ...decision.producto, referencia: 'X/Y' }, [], true), false);
  state.ultimaSolicitudProductos.push({ ...prior, referencia: 'X/Y' });
  assert.equal(recuperarSolicitudPendiente(decision, state, 'Novas'), decision);
});
test('actual pending router with omitted reference retains the original image code', () => {
  const fs = require('node:fs'), vm = require('node:vm'), { createRequire } = require('node:module');
  const rows = fs.readFileSync(require.resolve('../docs/reports/multimedia-2026-10-30/api-v2-full.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const prior = rows[1], failure = rows[2], file = require.resolve('../src/services/productRequestContext');
  class EpisodeDate extends Date { static now() { return Date.parse(failure.at); } }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require: createRequire(file), Date: EpisodeDate });
  const decision = failure.interpretations.find(i => i.router).result;
  const r = module.exports.recuperarSolicitudPendiente(decision, prior.state, failure.text);
  assert.match(r.producto.referencia, /c\/d/i);
  assert.match(r._consultaContinuada, /c\/d/i);
});
test('structured requested species cannot endorse a conflicting explicit catalog species', () => {
  const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
  const v = validarCoincidenciaProducto({ mensaje: 'NOVAS Urinary perro', catalogo: [{ marca: 'NOVAS', referencias: [
    { nombre: 'NOVAS CAT URINARY', especie: null, categoria: 'comida', subcategoria: 'concentrado', presentaciones: [{ peso: '3kg', precio: 10 }] } ] }],
    interpretacion: { confianza: .99, producto: { marca: 'NOVAS', referencia: 'URINARY', especie: 'perro' } },
    clasificacion: { intencion: 'busqueda_producto', perfilContexto: 'producto' } });
  assert.notEqual(v.nivel, 'alta');
});
test('image species requires its own evidence, and explicit customer species takes priority', () => {
  const { resolverEvidenciaProducto } = require('../src/services/productEvidenceService');
  const p = { especie: 'perro', observado: { nombre: 'NOVAS Urinary', confianzaIdentidad: .98,
    especie: 'perro', evidenciaEspecie: null, confianzaEspecie: .95 }, solicitud: {} };
  assert.equal(resolverEvidenciaProducto(p).especie, null);
  p.observado.evidenciaEspecie = 'animal ilegible'; p.observado.confianzaEspecie = .4;
  assert.equal(resolverEvidenciaProducto(p).especie, null);
  p.solicitud.especieTexto = 'gato';
  assert.equal(resolverEvidenciaProducto(p).especie, 'gato');
  p.solicitud = {}; p.observado.evidenciaEspecie = 'DOG'; p.observado.confianzaEspecie = .99;
  assert.equal(resolverEvidenciaProducto(p).especie, 'perro');
});
test('retained image evidence uses the same guarded identity matching on a later text turn', () => {
  const fs = require('node:fs');
  const r = fs.readFileSync(require.resolve('../docs/reports/multimedia-2026-10-30/api-v4-image-context.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const p = require('../src/services/productEvidenceService').resolverEvidenciaProducto(
    r[0].state.ultimaConsultaProducto.solicitudOriginal.producto);
  const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
  const catalogo = require('../docs/reports/sandbox-e2e-2026-10-30/catalog-current.json');
  const v = validarCoincidenciaProducto({ mensaje: require('../src/services/productRequestContext').consultaEstructurada(p), catalogo,
    interpretacion: { confianza: .95, producto: p }, clasificacion: { evidenciaVisualContextual: true, intencion: 'busqueda_producto', perfilContexto: 'producto' } });
  assert.equal(v.nivel, 'media');
  assert.equal(v.aclaracion.campo, 'forma_alimento');
  assert.ok(v.alternativas.length > 0);
  assert.ok(v.alternativas.every(a => /C\/D/.test(a.referenciaCatalogo)));
  assert.ok(v.alternativas.every(a => !/I\/D/.test(a.referenciaCatalogo)));
});
test('catalog species abbreviations in a router restatement do not discard the prior code', () => {
  const { identidadCompatibleAlAclarar } = require('../src/services/productRequestContext');
  const p = { marca: "Nova's", referencia: 'Care a/b Complete', linea: 'Nutrition', especie: 'gato' };
  assert.equal(identidadCompatibleAlAclarar(p, { marca: 'NOVAS', referencia: 'NOVAS FEL A/B', especie: 'gato' }, ['subcategoria'], true), true);
  assert.equal(identidadCompatibleAlAclarar(p, { marca: 'NOVAS', referencia: 'NOVAS FEL X/Y', especie: 'gato' }, ['subcategoria'], true), false);
});
test('brand-only presentation question re-enters a unique recent pending item even if router calls it new', () => {
  const { recuperarSolicitudPendiente: r } = require('../src/services/productRequestContext');
  const p = { marca: 'NOVAS', referencia: 'NOVAS A/B', estado: 'pendiente', contextoCreadoEn: new Date().toISOString() };
  const state = { ultimaSolicitudProductos: [p] };
  const d = { accion: 'consultar', seguimientoProducto: 'nueva', confianza: .95,
    producto: { marca: 'NOVAS', referencia: null, intencionPresentaciones: 'todas' } };
  assert.match(r(d, state, 'qué presentaciones tienes de Novas')._consultaContinuada, /A\/B/);
  for (const text of ['otras referencias de Novas', 'qué presentaciones de Novas cachorro']) assert.equal(r(d, state, text), d);
  state.ultimaSolicitudProductos.push({ ...p, referencia: 'NOVAS X/Y' });
  assert.equal(r(d, state, 'qué presentaciones tienes de Novas'), d);
});
