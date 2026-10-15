const test = require('node:test');
const assert = require('node:assert/strict');
const { validarCoincidenciaProducto, aplicarCoincidenciaValidada } = require('../src/services/productMatchValidator');
const { resolverEvidenciaProducto } = require('../src/services/productEvidenceService');

// Instantánea mínima del caso diagnosticado, independiente del inventario vivo.
function catalogo(marca = 'MAX CAT', pesos = ['1kg', '3kg', '10.1kg']) {
  return [{ marca, referencias: [
    { nombre: `${marca} ADUL FRANGO`, especie: 'gato', categoria: 'comida', etapa: 'adulto',
      presentaciones: pesos.map(peso => ({ peso, precio: 178600 })) },
    { nombre: `${marca} CASTRADO FRANGO`, especie: 'gato', categoria: 'comida', etapa: 'adulto',
      presentaciones: [{ peso: '10kg', precio: 190000 }] },
  ] }];
}
function validar({ marca = 'MAX CAT', solicitada = null, fuente = 'texto', visible = null, pesos, nombre } = {}) {
  const producto = resolverEvidenciaProducto({ marca, referencia: nombre || `${marca} PROFESSIONAL LINE FRANGO ARROZ ADULTO`,
    especie: 'gato', categoria: 'comida', etapa: 'adulto', sabores: ['pollo', 'arroz'],
    observado: { nombre: nombre || `${marca} PROFESSIONAL LINE FRANGO ARROZ ADULTO`,
      presentacion: visible, confianzaIdentidad: .99, confianzaPresentacion: visible ? .99 : 0 },
    solicitud: { presentacionTexto: fuente === 'texto' ? solicitada : null,
      presentacionContexto: fuente === 'contexto' ? solicitada : null, contextoVigente: fuente === 'contexto' },
  });
  const entrada = { mensaje: fuente === 'texto' && solicitada ? `${marca} ${solicitada}` : '¿Qué precio tiene?',
    interpretacion: { accion: 'consultar', intencion: 'consulta_producto', confianza: .99, producto },
    catalogo: catalogo(marca, pesos), clasificacion: { requiereVision: true, intencion: 'imagen', perfilContexto: 'multimedia' } };
  const antes = structuredClone(entrada);
  const resultado = validarCoincidenciaProducto(entrada);
  assert.deepEqual(entrada, antes, 'matching no muta la entrada compartida');
  return { resultado, producto };
}

for (const marca of ['MAX CAT', 'NUBELIA', 'VERDANIA']) {
  test(`${marca}: imagen sin peso identifica la referencia y todas sus presentaciones`, () => {
    const { resultado: r } = validar({ marca });
    assert.equal(r.nivel, 'alta');
    assert.equal(r.coincidencia.referencia, `${marca} ADUL FRANGO`);
    assert.deepEqual(r.coincidencia.presentaciones.map(p => p.peso), ['1kg', '3kg', '10.1kg']);
    assert.equal(r.presentacionSolicitada, null);
  });
  for (const fuente of ['texto', 'contexto']) test(`${marca}: 10kg desde ${fuente} no invalida identidad visual sin peso`, () => {
    const base = validar({ marca }).resultado;
    const { resultado: r, producto } = validar({ marca, solicitada: '10kg', fuente });
    assert.equal(r.nivel, 'alta');
    assert.equal(r.coincidencia.referencia, base.coincidencia.referencia);
    assert.equal(r.score, base.score, 'peso solicitado no se trata como evidencia visual');
    assert.equal(r.presentacionValida, true);
    assert.equal(r.presentacionSolicitada, '10.1kg');
    assert.deepEqual(r.equivalenciaPresentacion, { solicitada: '10kg', catalogo: '10.1kg' });
    assert.equal(producto.observado.presentacion, null);
    assert.equal(producto.fuentePresentacion, fuente);
  });
}

test('peso aproximado visible se evalúa antes de penalizar la identidad', () => {
  const { resultado: r } = validar({ visible: '10kg' });
  assert.equal(r.nivel, 'alta');
  assert.equal(r.presentacionSolicitada, '10.1kg');
});

for (const pesos of [['1kg', '3kg'], ['10.05kg', '10.1kg']]) {
  test(`identidad se mantiene sin inventar equivalencia: ${pesos}`, () => {
    const { resultado: r } = validar({ solicitada: '10kg', fuente: 'contexto', pesos });
    assert.equal(r.nivel, 'alta');
    assert.equal(r.presentacionValida, false);
    assert.equal(r.equivalenciaPresentacion, undefined);
    assert.equal(r.presentacionSolicitada, '10kg');
  });
}
test('presentación exacta prevalece sobre otra cercana', () => {
  const { resultado: r } = validar({ solicitada: '10kg', pesos: ['10kg', '10.1kg'] });
  assert.equal(r.nivel, 'alta');
  assert.equal(r.presentacionSolicitada, '10kg');
  assert.equal(r.equivalenciaPresentacion, undefined);
});
test('un peso cercano no confirma una variante comercial desconocida', () => {
  const { resultado: r } = validar({ solicitada: '10kg', nombre: 'MAX CAT RENAL TERAPEUTICO' });
  assert.notEqual(r.nivel, 'alta');
  assert.equal(r.coincidencia, null);
});

for (const accion of ['consultar', 'agregar']) test(`peso validado 10.1kg no vuelve a 1kg al ${accion}`, () => {
  const { crearEstadoInicial } = require('../src/conversation/conversationStore');
  const { resolverConsultaCatalogo } = require('../src/verticals/petshop/orderLogic');
  const datos = catalogo();
  datos[0].referencias[0].presentaciones = [
    { peso: '1kg', precio: 27400 }, { peso: '3kg', precio: 67900 }, { peso: '10.1kg', precio: 178600 },
  ];
  const { resultado, producto } = validar({ solicitada: '10kg' });
  const interpretacion = aplicarCoincidenciaValidada({ accion,
    intencion: accion === 'consultar' ? 'consulta_producto' : 'pedido_producto', producto }, resultado);
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo('Max cat 10kg', estado, datos, interpretacion);
  assert.match(respuesta, /10\.1kg.*178\.600/);
  assert.doesNotMatch(respuesta, /27\.400|67\.900/);
  const seleccionados = accion === 'consultar' ? estado.productosConsultados : estado.carrito;
  assert.equal(seleccionados.length, 1);
  assert.equal(seleccionados[0].peso, '10.1kg');
  assert.equal(seleccionados[0].precio, 178600);
});
