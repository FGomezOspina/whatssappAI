const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { _internals: { normalizarInterpretacion } } = require('../src/services/aiInterpreter');
const { respuestaParaHistorial } = require('../src/utils/responseMessages');

const excellent = { marca: 'EXCELLENT', referencia: 'EXCELLENT GATO URINARY', peso: '1kg', precio: 34000, cantidad: 1 };
const urinary = { marca: 'VETSOLUTION', referencia: 'VETSOLUTION CAT URINARY', peso: '100gr', precio: 8400, cantidad: 3 };
const gastro = { marca: 'VETSOLUTION', referencia: 'VETSOLUTION CAT GASTROINTES', peso: '100gr', precio: 8400, cantidad: 1 };
const arena = { marca: 'KITTEN', referencia: 'ARENA KITTEN TALCO', peso: '8kg', precio: 23800, cantidad: 1 };
const nexgard = { marca: 'NEXGARD', referencia: 'NEXGARD', peso: '10mg', precio: 50000, cantidad: 1 };
const copia = value => JSON.parse(JSON.stringify(value));
const quitar = producto => ({ intencion: 'carrito', accion: 'quitar', confianza: .99, producto,
  continuarFlujo: false, consultaCatalogo: { necesaria: false },
  respuestaConversacional: 'Perfecto, ya lo quité, te envío solo el resto.' });

// Usar el store real, incluida su normalizacion al cargar. El repositorio
// simulado serializa las escrituras y cada turno crea un store sin cache.
function escenario(items, { cotizacion = false, contexto = {}, catalogoItems = items } = {}) {
  let persistido = copia({ ...crearEstadoInicial(), carrito: cotizacion ? [] : items,
    ultimaSolicitudProductos: items.map(item => ({ estado: 'identificado', accion: 'consultar', cotizacion: [item] })),
    productosConsultados: items, ...contexto });
  let decision;
  let busquedas = 0;
  let humanizaciones = 0;
  const repository = {
    supabaseConfigurado: () => true,
    buscarConversacion: async () => ({ state: copia(persistido) }),
    guardarConversacion: async (_id, estado) => { persistido = copia(estado); return { id: 'conversation-test' }; },
    guardarMensaje: async () => {}, buscarMensajesRecientes: async () => [], guardarPedidoConfirmado: async () => null,
  };
  const cargar = (path, mocks) => {
    const file = require.resolve(path), req = createRequire(file), module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
      require: name => mocks[name] || req(name), module, process, console: { log() {}, error() {} },
    });
    return module.exports;
  };
  return {
    estado: () => copia(persistido), busquedas: () => busquedas, humanizaciones: () => humanizaciones,
    enviar: async (text, interpretacion) => {
      decision = interpretacion;
      const store = cargar('../src/conversation/conversationStore', {
        '../repositories/supabaseConversationRepository': repository,
        '../repositories/learningRepository': { capturarAprendizaje: async () => {} },
      });
      const service = cargar('../src/services/conversationService', {
        './clients.service': { obtenerClienteActual: async () => ({ id: 'entity-test', vertical: 'petshop' }) },
        '../conversation/conversationStore': store,
        './aiInterpreter': { interpretarMensajeCliente: async args => normalizarInterpretacion(
          args.clasificacion?.revisionOperacion ? decision._revision ?? decision : decision) },
        './catalogContextService': { seleccionarCatalogoParaIA: async () => {
          busquedas++;
          const catalogo = [...new Set(catalogoItems.map(p => p.marca))].map(marca => ({ marca,
            referencias: catalogoItems.filter(p => p.marca === marca).map(p => ({ nombre: p.referencia,
              presentaciones: [{ peso: p.peso, precio: p.precio }] })) }));
          return { catalogo, metadata: {} };
        } },
        '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
        './humanizer': { humanizarRespuesta: async (_m, base) => { humanizaciones++; return base; } },
      });
      return respuestaParaHistorial(await service.responderEventoEntrante({ channelUserId: 'entity-test', text }));
    },
  };
}

for (const [nombre, items, mensaje, producto, esperados] of [
  ['A: eliminación explícita', [excellent, urinary, arena], 'saca el excellent', { marca: 'EXCELLENT' }, [urinary, arena]],
  ['B: exclusión y resto', [excellent, urinary, gastro, arena], 'ya no necesito el excellent, solo envíame el resto', { marca: 'EXCELLENT' }, [urinary, gastro, arena]],
  ['C: entidad genérica', [nexgard, arena], 'quita la arena', { referencia: 'arena' }, [nexgard]],
]) test(nombre, async () => {
  const caso = escenario(items);
  const respuesta = await caso.enviar(mensaje, quitar(producto));
  assert.deepEqual(caso.estado().carrito, esperados);
  assert.match(respuesta, /retiré/);
  assert.equal(caso.busquedas(), 0);
  assert.equal(caso.humanizaciones(), 0);
  for (const item of esperados) assert.ok(respuesta.includes(item.referencia));
});

test('D: ordinal usa opciones vigentes mostradas, no orden del carrito', async () => {
  const caso = escenario([excellent, urinary, arena], { contexto: {
    referenciasPendientes: { opciones: [arena, excellent, urinary].map((p, i) => ({ ...p, indice: i + 1,
      presentaciones: [{ peso: p.peso }] })), turnosRestantes: 3, expiraEn: new Date(Date.now() + 60000).toISOString() },
  } });
  await caso.enviar('quite el segundo', quitar(null));
  assert.deepEqual(caso.estado().carrito, [urinary, arena]);
});

test('D: referente ausente, ambiguo o vencido pide aclaración sin adivinar', async () => {
  for (const contexto of [
    { productosConsultados: [] },
    { productosConsultados: [excellent, urinary] },
    { referenciasPendientes: { opciones: [excellent, urinary], turnosRestantes: 3, expiraEn: '2000-01-01' } },
  ]) {
    const caso = escenario([excellent, urinary, arena], { contexto });
    const mensaje = contexto.productosConsultados?.length ? 'ya no quiero ese' : 'quite el segundo';
    const respuesta = await caso.enviar(mensaje, quitar(null));
    assert.deepEqual(caso.estado().carrito, [excellent, urinary, arena]);
    assert.match(respuesta, /Cuál producto/);
    assert.doesNotMatch(respuesta, /retiré|ya lo quité/);
  }
});

test('referencia deíctica inequívoca utiliza última selección', async () => {
  const caso = escenario([excellent, urinary, arena], { contexto: { ultimaSeleccion: excellent } });
  await caso.enviar('no necesito ese producto', quitar(null));
  assert.deepEqual(caso.estado().carrito, [urinary, arena]);
});

test('E: objetivo inexistente no muta ni confirma una eliminación', async () => {
  const caso = escenario([nexgard, arena]);
  const antes = caso.estado();
  const respuesta = await caso.enviar('quita Excellent', quitar({ marca: 'EXCELLENT' }));
  assert.deepEqual(caso.estado().carrito, antes.carrito);
  assert.deepEqual(caso.estado().ultimaSolicitudProductos, antes.ultimaSolicitudProductos);
  assert.match(respuesta, /no encontré/);
  assert.doesNotMatch(respuesta, /retiré|ya lo quité|envío solo/);
});

test('F: consultar precio no modifica carrito', async () => {
  const caso = escenario([excellent, nexgard, arena]);
  await caso.enviar('¿cuánto vale Excellent?', { intencion: 'consulta_producto', accion: 'consultar', confianza: .99,
    producto: { ...excellent, presentacion: excellent.peso }, continuarFlujo: true,
    consultaCatalogo: { necesaria: true, consulta: 'EXCELLENT GATO URINARY 1kg' } });
  assert.deepEqual(caso.estado().carrito, [excellent, nexgard, arena]);
});

const entrega = { intencion: 'datos_envio', accion: null, confianza: .99, continuarFlujo: true,
  consultaCatalogo: { necesaria: false }, entrega: { direccion: 'Mz 1 cs 19 Sakabuma', tipo: 'domicilio', metodoPago: 'efectivo' } };

test('G: persistencia y carga del siguiente turno conservan eliminación y total 57.400', async () => {
  const caso = escenario([excellent, urinary, gastro, arena]);
  await caso.enviar('saca el excellent', quitar({ marca: 'EXCELLENT' }));
  const respuesta = await caso.enviar('mz 1 cs 19 Sakabuma, efectivo por favor', entrega);
  assert.deepEqual(caso.estado().carrito, [urinary, gastro, arena]);
  assert.doesNotMatch(respuesta, /EXCELLENT/);
  assert.equal(caso.estado().carrito.reduce((total, p) => total + p.precio * p.cantidad, 0), 57400);
  const resumen = await caso.enviar('muestra el carrito', { intencion: 'carrito', accion: 'consultar', confianza: .99,
    consultaCatalogo: { necesaria: false } });
  assert.match(resumen, /57\.400/);
  assert.doesNotMatch(resumen, /EXCELLENT/);
});

test('cotización excluida se persiste sin compra y se acepta después sin resucitar Excellent', async () => {
  const caso = escenario([excellent, urinary, gastro, arena], { cotizacion: true });
  const respuesta = await caso.enviar('ya no necesito el excellent, solo envíame el resto', quitar({ marca: 'EXCELLENT' }));
  assert.equal(caso.estado().carrito.length, 0);
  assert.deepEqual(caso.estado().ultimaSolicitudProductos.flatMap(p => p.cotizacion), [urinary, gastro, arena]);
  assert.match(respuesta, /Cotización:[\s\S]*57\.400/);
  assert.doesNotMatch(respuesta, /EXCELLENT/);
  await caso.enviar('mz 1 cs 19 Sakabuma, efectivo por favor', entrega);
  assert.deepEqual(caso.estado().carrito.map(p => p.referencia), [urinary, gastro, arena].map(p => p.referencia));
  assert.deepEqual(caso.estado().carrito.map(p => p.cantidad), [3, 1, 1]);
});

test('eliminar último producto limpia cotización activa y no reaparece con dirección', async () => {
  for (const cotizacion of [false, true]) {
    const caso = escenario([excellent], { cotizacion });
    await caso.enviar('saca el excellent', quitar({ marca: 'EXCELLENT' }));
    await caso.enviar('mz 1 cs 19 Sakabuma, efectivo por favor', entrega);
    assert.deepEqual(caso.estado().carrito, []);
    assert.deepEqual(caso.estado().productosConsultados, []);
    assert.deepEqual(caso.estado().ultimaSolicitudProductos, []);
  }
});

test('MODIFY y KEEP conservan entidad sin catálogo y sincronizan cotización', async () => {
  const caso = escenario([excellent, urinary, arena]);
  await caso.enviar('deja dos latas', { ...quitar({ referencia: urinary.referencia }), accion: 'modificar_cantidad',
    carrito: { cantidadObjetivo: 2 } });
  assert.equal(caso.estado().carrito[1].cantidad, 2);
  assert.equal(caso.estado().ultimaSolicitudProductos[1].cotizacion[0].cantidad, 2);
  await caso.enviar('deja solo la arena', { ...quitar({ referencia: 'arena' }), accion: 'mantener_solo' });
  assert.deepEqual(caso.estado().carrito, [arena]);
  assert.equal(caso.busquedas(), 0);
});

test('productos[] conserva varios objetivos y falla sin eliminación parcial', async () => {
  for (const falta of [false, true]) {
    const caso = escenario([excellent, urinary, arena]);
    const respuesta = await caso.enviar('quita estos dos', { ...quitar(null), productos: [
      { marca: 'EXCELLENT' }, { referencia: falta ? 'INEXISTENTE' : 'arena' },
    ] });
    assert.deepEqual(caso.estado().carrito, falta ? [excellent, urinary, arena] : [urinary]);
    if (falta) assert.match(respuesta, /no encontré/);
  }
});

test('baja confianza y carrito vacío no permiten una confirmación generada', async () => {
  for (const items of [[excellent], []]) {
    const caso = escenario(items);
    const respuesta = await caso.enviar('saca el excellent', { ...quitar({ marca: 'EXCELLENT' }), confianza: .4 });
    assert.deepEqual(caso.estado().carrito, items);
    assert.doesNotMatch(respuesta, /retiré|ya lo quité|envío solo/);
    assert.equal(caso.humanizaciones(), 0);
  }
});

test('última selección conserva su presentación aunque otra consulta aparezca primero', async () => {
  const caso = escenario([excellent, arena], { contexto: { ultimaSeleccion: { ...arena, presentacion: arena.peso } } });
  await caso.enviar('ya no quiero ese', quitar(null));
  assert.deepEqual(caso.estado().carrito, [excellent]);
});

test('entidad de categoría y operación siguen separadas de búsqueda solicitada por router', async () => {
  const arenaConCategoria = { ...arena, categoria: 'arena_sustrato' };
  const caso = escenario([nexgard, arenaConCategoria]);
  await caso.enviar('quita la arena', { ...quitar({ categoria: 'arena_sustrato' }),
    intencion: 'pedido_producto', consultaCatalogo: { necesaria: true, consulta: 'arena' } });
  assert.deepEqual(caso.estado().carrito, [nexgard]);
  assert.equal(caso.busquedas(), 0);
});

test('un ajuste ya aplicado no afirma una nueva mutación ni reinicia checkout', async () => {
  const caso = escenario([arena], { contexto: { esperandoConfirmacionPedido: true } });
  const respuesta = await caso.enviar('deja solo la arena', { ...quitar({ referencia: 'arena' }), accion: 'mantener_solo' });
  assert.deepEqual(caso.estado().carrito, [arena]);
  assert.equal(caso.estado().esperandoConfirmacionPedido, true);
  assert.match(respuesta, /ya tiene ese ajuste/);
  assert.doesNotMatch(respuesta, /dejé|retiré|ajusté/);
});

const falloReal = require('./fixtures/cart-removal-real-interpretation.json');
// Los campos de identidad son los persistidos del turno real. Confianza y
// decision de herramientas no estaban en esa traza: se fijan para el replay.
const interpretacionReal = () => ({ ...copia(falloReal.interpretacion), confianza: .99,
  continuarFlujo: false, consultaCatalogo: { necesaria: false } });

for (const cotizacion of [false, true]) test(`interpretación real completa: exclusión persistida en ${cotizacion ? 'cotización' : 'carrito'}`, async () => {
  const caso = escenario(falloReal.carrito, { cotizacion });
  const respuesta = await caso.enviar(falloReal.mensaje, interpretacionReal());
  const seleccion = cotizacion ? caso.estado().ultimaSolicitudProductos.flatMap(p => p.cotizacion) : caso.estado().carrito;
  assert.deepEqual(seleccion, falloReal.carrito.slice(1));
  assert.doesNotMatch(respuesta, /EXCELLENT|no encontré/);
  assert.match(respuesta, /57\.400/);
  await caso.enviar('mz 1 cs 19 Sakabuma, efectivo por favor', entrega);
  assert.deepEqual(caso.estado().carrito.map(p => [p.referencia, p.cantidad]), falloReal.carrito.slice(1).map(p => [p.referencia, p.cantidad]));
});

test('identidad fuerte prevalece sobre metadata distinta sin depender de marca o sinónimos', async () => {
  const item = { ...excellent, marca: 'MARCA PRUEBA', referencia: 'FORMULA ALFA', categoria: 'comida' };
  const caso = escenario([item, arena]);
  await caso.enviar('quita formula alfa 1kg', quitar({ marca: item.marca, referencia: item.referencia,
    presentacion: '1kg', categoria: 'clasificacion ajena', condiciones: ['atributo auxiliar diferente'] }));
  assert.deepEqual(caso.estado().carrito, [arena]);
});

const rangos = [{ ...nexgard, peso: '4-10kg' }, { ...nexgard, peso: '10-25kg' }];
test('misma referencia: presentación explícita selecciona solo el rango correcto', async () => {
  const caso = escenario(rangos);
  await caso.enviar('quita el NexGard 10-25kg', quitar({ marca: 'NEXGARD', referencia: 'NEXGARD', presentacion: '10-25kg', categoria: 'auxiliar' }));
  assert.deepEqual(caso.estado().carrito, [rangos[0]]);
});

test('misma referencia sin presentación pregunta y no elimina ninguna variante', async () => {
  const caso = escenario(rangos);
  const respuesta = await caso.enviar('quita el NexGard', quitar({ marca: 'NEXGARD', referencia: 'NEXGARD' }));
  assert.deepEqual(caso.estado().carrito, rangos);
  assert.match(respuesta, /Cuál producto/);
});

test('marca compartida: un objetivo parcial único se resuelve y uno ambiguo pregunta', async () => {
  const items = [urinary, gastro];
  for (const referencia of ['URINARY', null]) {
    const caso = escenario(items);
    const respuesta = await caso.enviar('quita Vet Solution', quitar({ marca: 'VETSOLUTION', referencia }));
    assert.deepEqual(caso.estado().carrito, referencia ? [gastro] : items);
    if (!referencia) assert.match(respuesta, /Cuál producto/);
  }
});

test('nombre inexistente más largo y presentación inexistente no retroceden a coincidencia amplia', async () => {
  for (const producto of [
    { marca: 'EXCELLENT', referencia: `${excellent.referencia} OTRA VARIANTE`, presentacion: '1kg' },
    { marca: 'EXCELLENT', referencia: excellent.referencia, presentacion: '3kg' },
  ]) {
    const caso = escenario([excellent]);
    await caso.enviar('quita esa referencia', quitar(producto));
    assert.deepEqual(caso.estado().carrito, [excellent]);
  }
});

test('especie discrimina líneas de la misma referencia cuando ambas existen', async () => {
  const gato = { ...excellent, referencia: 'FORMULA', especie: 'gato' };
  const perro = { ...gato, especie: 'perro' };
  const caso = escenario([gato, perro]);
  await caso.enviar('quita formula para gato', quitar({ marca: gato.marca, referencia: 'FORMULA', especie: 'gato' }));
  assert.deepEqual(caso.estado().carrito, [perro]);
  assert.deepEqual(caso.estado().ultimaSolicitudProductos.flatMap(p => p.cotizacion), [perro]);
});

for (const accion of ['modificar_cantidad', 'mantener_solo']) test(`${accion} usa identidad comercial con fixture completo`, async () => {
  const caso = escenario(falloReal.carrito);
  const decision = { ...interpretacionReal(), accion, carrito: accion === 'modificar_cantidad' ? { cantidadObjetivo: 2 } : {} };
  await caso.enviar('ajusta esa selección', decision);
  const esperado = accion === 'mantener_solo' ? [falloReal.carrito[0]]
    : falloReal.carrito.map((p, i) => i === 0 ? { ...p, cantidad: 2 } : p);
  assert.deepEqual(caso.estado().carrito, esperado);
});

test('múltiples targets resuelven líneas individuales; uno ambiguo impide mutación parcial', async () => {
  for (const ambiguo of [false, true]) {
    const items = [excellent, ...rangos];
    const caso = escenario(items);
    const respuesta = await caso.enviar('quita los indicados', { ...interpretacionReal(), productos: [
      falloReal.interpretacion.productos[0], { marca: 'NEXGARD', presentacion: ambiguo ? null : '10-25kg' },
    ] });
    assert.deepEqual(caso.estado().carrito, ambiguo ? items : [rangos[0]]);
    if (ambiguo) assert.match(respuesta, /Cuál producto/);
  }
});

test('discriminantes contradictorios mantienen ambigüedad sin depender del orden de atributos', async () => {
  const items = [{ ...excellent, referencia: 'FORMULA UNO', especie: 'gato', categoria: 'comida' },
    { ...excellent, referencia: 'FORMULA DOS', especie: 'perro', categoria: 'medicamento' }];
  const caso = escenario(items);
  const respuesta = await caso.enviar('quita la formula', quitar({ marca: 'EXCELLENT', referencia: 'FORMULA',
    especie: 'gato', categoria: 'medicamento' }));
  assert.deepEqual(caso.estado().carrito, items);
  assert.match(respuesta, /Cuál producto/);
});

test('referencia exacta tiene prioridad sobre otra que extiende su nombre', async () => {
  const items = [nexgard, { ...nexgard, referencia: 'NEXGARD SPECTRA' }];
  const caso = escenario(items);
  await caso.enviar('quita NexGard', quitar({ marca: 'NEXGARD', referencia: 'NEXGARD', presentacion: '10mg' }));
  assert.deepEqual(caso.estado().carrito, [items[1]]);
});

const variantesOperacion = require('./fixtures/cart-operation-language.json');
for (const caso of variantesOperacion) test(`contrato normalizado y estado: ${caso.mensaje}`, async () => {
  const items = copia(falloReal.carrito);
  const indice = caso.target === 'arena' ? 3 : 0;
  if (caso.inicial) items[indice].cantidad = caso.inicial;
  const target = items[indice];
  const contexto = caso.contextual ? { ultimaSeleccion: { ...target, presentacion: target.peso } }
    : caso.ordinal ? { referenciasPendientes: { opciones: [items[3],items[0],items[1]].map(p => ({ ...p, presentaciones:[{peso:p.peso}] })), turnosRestantes:3 } } : {};
  const prueba = escenario(items, { cotizacion: true, contexto });
  const producto = caso.contextual || caso.ordinal ? null : { marca:target.marca, referencia:target.referencia, presentacion:target.peso };
  await prueba.enviar(caso.mensaje, { ...quitar(producto), accion:caso.accion,
    ...(caso.targets ? {productos:caso.targets.map(i=>({marca:items[i].marca,referencia:items[i].referencia,presentacion:items[i].peso}))} : {}),
    carrito:{operacion:caso.accion,cantidadObjetivo:caso.cantidadObjetivo??null,cantidadDelta:caso.cantidadDelta??null} });
  let esperado = items;
  if(caso.accion==='quitar') esperado=items.filter((_,i)=>!(caso.targets || [indice]).includes(i));
  if(caso.accion==='mantener_solo') esperado=items.filter((_,i)=>(caso.targets || [indice]).includes(i));
  if(['agregar','modificar_cantidad'].includes(caso.accion)) esperado=items.map((p,i)=>i===indice?{...p,cantidad:caso.cantidadObjetivo??p.cantidad+caso.cantidadDelta}:p);
  assert.deepEqual(prueba.estado().ultimaSolicitudProductos.flatMap(p=>p.cotizacion), esperado);
  assert.deepEqual(prueba.estado().carrito, []);
});

test('la operación errónea realmente registrada reproduce la inversión; quitar produce su complemento', async () => {
  for (const accion of ['mantener_solo','quitar']) {
    const caso = escenario(falloReal.carrito, {cotizacion:true});
    await caso.enviar(falloReal.mensaje, {...interpretacionReal(),accion,productos:[]});
    assert.deepEqual(caso.estado().ultimaSolicitudProductos.flatMap(p=>p.cotizacion),
      accion==='mantener_solo'?[falloReal.carrito[0]]:falloReal.carrito.slice(1));
  }
});

test('campos operativos contradictorios no eligen silenciosamente KEEP ni mutan', async () => {
  const caso=escenario(falloReal.carrito);
  const respuesta=await caso.enviar(falloReal.mensaje,{...interpretacionReal(),carrito:{operacion:'mantener_solo'}});
  assert.deepEqual(caso.estado().carrito,falloReal.carrito);
  assert.match(respuesta,/aclarar/);
});

test('KEEP_ONLY conserva cantidades previas aunque el producto interpretado copie cantidad 1', async () => {
  const caso=escenario([excellent,urinary,arena]);
  await caso.enviar('mándame solo las latas', {...quitar({...urinary,presentacion:urinary.peso,cantidad:1}),accion:'mantener_solo'});
  assert.deepEqual(caso.estado().carrito,[urinary]);
});

test('incrementos y decrementos persisten; decremento hasta cero retira únicamente la línea', async () => {
  const caso=escenario([excellent,urinary,arena]);
  const producto={referencia:urinary.referencia};
  await caso.enviar('agrégale dos más a las latas',{...quitar(producto),accion:'agregar',carrito:{cantidadDelta:2}});
  assert.equal(caso.estado().carrito[1].cantidad,5);
  await caso.enviar('bájale una a las latas',{...quitar(producto),accion:'modificar_cantidad',carrito:{cantidadDelta:-1}});
  assert.equal(caso.estado().carrito[1].cantidad,4);
  await caso.enviar('quita las cuatro latas',{...quitar(producto),accion:'modificar_cantidad',carrito:{cantidadDelta:-4}});
  assert.deepEqual(caso.estado().carrito,[excellent,arena]);
});

test('delta inválido, contradictorio o sin referente no altera selección', async () => {
  for(const [producto,carrito] of [[{marca:'EXCELLENT'},{cantidadDelta:-2}], [{marca:'EXCELLENT'},{cantidadDelta:1,cantidadObjetivo:3}],
    [{marca:'EXCELLENT'},{cantidadDelta:'dos'}], [null,{cantidadDelta:1}]]) {
    const caso=escenario([excellent,urinary,arena]);
    await caso.enviar('cambia esa cantidad',{...quitar(producto),accion:'modificar_cantidad',carrito});
    assert.deepEqual(caso.estado().carrito,[excellent,urinary,arena]);
  }
});

test('ADD nuevo mantiene anteriores y usa la ruta de catálogo existente', async () => {
  const caso=escenario([excellent],{catalogoItems:[excellent,arena]});
  const producto={marca:arena.marca,referencia:arena.referencia,presentacion:arena.peso,cantidad:1};
  await caso.enviar('agrégame una arena kitten talco 8kg',{...quitar(producto),intencion:'pedido_producto',accion:'agregar',
    consultaCatalogo:{necesaria:true,consulta:'ARENA KITTEN TALCO 8kg'}});
  assert.deepEqual(caso.estado().carrito.map(p=>p.referencia),[excellent.referencia,arena.referencia]);
  assert.ok(caso.busquedas()>0);
});

test('revisión semántica corrige el KEEP real antes de mutar y conserva resultado al siguiente turno', async () => {
  const caso=escenario(falloReal.carrito,{cotizacion:true});
  for(const turno of require('./fixtures/cart-inverted-operation.json').turnos) {
    await caso.enviar(turno.mensaje,{...turno.interpretacion,confianza:.99,consultaCatalogo:{necesaria:false},
      _revision:interpretacionReal()});
    assert.deepEqual(caso.estado().ultimaSolicitudProductos.flatMap(p=>p.cotizacion),falloReal.carrito.slice(1));
  }
  await caso.enviar('mz 1 cs 19 Sakabuma, efectivo por favor',entrega);
  assert.deepEqual(caso.estado().carrito.map(p=>[p.referencia,p.cantidad]),falloReal.carrito.slice(1).map(p=>[p.referencia,p.cantidad]));
});

test('revisión incierta detiene una operación destructiva sin tocar estado', async () => {
  const caso=escenario(falloReal.carrito);
  await caso.enviar(falloReal.mensaje,{...interpretacionReal(),_revision:{...interpretacionReal(),confianza:.3}});
  assert.deepEqual(caso.estado().carrito,falloReal.carrito);
});

test('contexto del intérprete conserva las opciones ordinales y su vigencia', () => {
  const {construirSolicitudInterprete}=require('../src/services/aiContextOptimizer');
  const opciones=[arena,excellent].map((p,i)=>({...p,indice:i+1,presentaciones:[{peso:p.peso}]}));
  const solicitud=construirSolicitudInterprete({mensaje:'el segundo no',estado:{...crearEstadoInicial(),referenciasPendientes:{opciones,turnosRestantes:2,expiraEn:'2099-01-01'}},
    clasificacion:{decisionHerramientas:true,perfilContexto:'pedido'},model:'test'});
  assert.deepEqual(solicitud.contexto.contextoActivo.referenciasPendientes.opciones.map(p=>p.referencia),[arena.referencia,excellent.referencia]);
  assert.equal(solicitud.contexto.contextoActivo.referenciasPendientes.expiraEn,'2099-01-01');
});

test('una operación de conjunto no descarta silenciosamente instrucciones de cantidad', async () => {
  for(const accion of ['quitar','mantener_solo','agregar']) {
    const caso=escenario([excellent,arena]);
    await caso.enviar('cambia ese producto',{...quitar({marca:'EXCELLENT'}),accion,carrito:{cantidadObjetivo:2}});
    assert.deepEqual(caso.estado().carrito,[excellent,arena]);
  }
});

test('ADD de un producto nuevo transporta su incremento hasta el catálogo', async () => {
  const caso=escenario([excellent],{catalogoItems:[excellent,arena]});
  await caso.enviar('agrégame dos arenas kitten talco 8kg',{...quitar({marca:arena.marca,referencia:arena.referencia,presentacion:arena.peso}),
    intencion:'pedido_producto',accion:'agregar',carrito:{cantidadDelta:2},consultaCatalogo:{necesaria:true,consulta:'ARENA KITTEN TALCO 8kg'}});
  assert.deepEqual(caso.estado().carrito.map(p=>[p.referencia,p.cantidad]),[[excellent.referencia,1],[arena.referencia,2]]);
});

// Interpretaciones completas capturadas del interprete+revision GPT-5.4,
// reproducidas con el normalizador, orquestador y store reales sin red.
for (const capturada of require('./fixtures/cart-operations-reviewed.json')) test(`replay GPT-5.4: ${capturada.mensaje}`, async () => {
  const caso=variantesOperacion.find(c=>c.mensaje===capturada.mensaje);
  assert.ok(caso);
  const items=copia(falloReal.carrito);
  const indice=caso.target==='arena'?3:0;
  if(caso.inicial)items[indice].cantidad=caso.inicial;
  const contexto=caso.contextual?{ultimaSeleccion:{...items[indice],presentacion:items[indice].peso}}
    :caso.ordinal?{referenciasPendientes:{opciones:[items[3],items[0],items[1]].map(p=>({...p,presentaciones:[{peso:p.peso}]})),turnosRestantes:3}}:{};
  const prueba=escenario(items,{cotizacion:caso.cotizacion===true,contexto});
  await prueba.enviar(caso.mensaje,capturada.interpretacion);
  let esperado=items;
  if(caso.accion==='quitar')esperado=items.filter((_,i)=>!(caso.targets||[indice]).includes(i));
  if(caso.accion==='mantener_solo')esperado=items.filter((_,i)=>(caso.targets||[indice]).includes(i));
  if(['agregar','modificar_cantidad'].includes(caso.accion))esperado=items.map((p,i)=>i===indice?{...p,cantidad:caso.cantidadObjetivo??p.cantidad+caso.cantidadDelta}:p);
  const seleccion=caso.cotizacion?prueba.estado().ultimaSolicitudProductos.flatMap(p=>p.cotizacion):prueba.estado().carrito;
  assert.deepEqual(seleccion,esperado);
});
