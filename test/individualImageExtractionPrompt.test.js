const test = require('node:test');
const assert = require('node:assert/strict');
const { construirSolicitudInterprete } = require('../src/services/aiContextOptimizer');

const mensaje = 'Para Conjunto de Prueba Bloque 1 apto 101\nTe puedo pagar con tarjeta cuando lo lleven?';

test('la revisión por archivo recibe un contrato de extracción independiente de entrega/pago', () => {
  const args = { mensaje, clasificacion: { requiereVision: true, decisionHerramientas: true },
    estado: {}, catalogo: [], historialReciente: [] };
  const conjunta = construirSolicitudInterprete(args);
  const individual = construirSolicitudInterprete({ ...args,
    clasificacion: { ...args.clasificacion, revisionImagenIndividual: true,
      contextoPendiente: [{ mensajes: ['Puedo pagar con tarjeta?'] }] } });
  assert.equal(individual.contexto.mensaje, mensaje, 'no se sustituye por una pregunta de precio inventada');
  assert.match(conjunta.promptBase, /productos\[\] y entrega simultáneamente/);
  assert.match(individual.promptBase, /lectura de evidencia visual/);
  assert.match(individual.promptBase, /aunque el texto acompañante solo contenga dirección, pago o saludo/);
  assert.match(individual.promptBase, /observado.*presentacion/s);
  assert.match(individual.promptBase, /comprobante de pago/);
  assert.match(individual.promptBase, /productos=\[\]/);
  assert.doesNotMatch(individual.promptBase, /Antes de cualquier busqueda|Interpreta primero cualquier accion pendiente|Operaciones sobre carrito o cotizacion existente/);
  assert.ok(individual.promptBase.length < conjunta.promptBase.length / 2, 'no reenvía las reglas de clasificación del flujo');
});

test('texto sin imagen conserva el contrato de routing sin instrucciones visuales adicionales', () => {
  const r = construirSolicitudInterprete({ mensaje, estado: {}, catalogo: [],
    clasificacion: { decisionHerramientas: true } });
  assert.match(r.promptBase, /Operaciones sobre carrito o cotizacion existente/);
  assert.doesNotMatch(r.promptBase, /lectura de evidencia visual|productos\[\] y entrega simultáneamente/);
});
