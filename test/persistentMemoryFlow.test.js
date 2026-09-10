const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const repository = require('../src/repositories/supabaseConversationRepository');
const { construirSolicitudInterprete } = require('../src/services/aiContextOptimizer');
const { respuestaValidacionProducto } = require('../src/services/productMatchValidator');
const { esSenalReferenciaProducto, _internals } = require('../src/services/pendingProductMatchService');

function baseSimulada(t) {
  const anteriores = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: 'https://memory.example', SUPABASE_SECRET_KEY: 'synthetic', SUPABASE_REQUEST_RETRIES: '0' });
  t.after(() => {
    for (const key of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_REQUEST_RETRIES']) {
      if (anteriores[key] === undefined) delete process.env[key]; else process.env[key] = anteriores[key];
    }
  });
  const conversaciones = new Map();
  const mensajes = new Map();
  const solicitudes = [];
  let reloj = Date.parse('2026-09-01T00:00:00Z');
  t.mock.method(global, 'fetch', async (url, options) => {
    solicitudes.push({ url, options });
    const u = new URL(url);
    const tabla = u.pathname.split('/').pop();
    if (options.method === 'POST') {
      const payload = JSON.parse(options.body);
      if (tabla === 'whatsapp_conversations') {
        const key = `${payload.client_id}:${payload.channel_user_id}`;
        const row = { id: `conversation-${key}`, ...conversaciones.get(key), ...payload };
        conversaciones.set(key, row);
        return new Response(JSON.stringify([row]));
      }
      if (tabla === 'whatsapp_messages') {
        const id = payload.id || `legacy-${mensajes.size}`;
        const row = { id, created_at: new Date(reloj += 1000).toISOString(), ...mensajes.get(id), ...payload };
        mensajes.set(id, row);
        return new Response(JSON.stringify([row]));
      }
      return new Response('[]');
    }
    const cliente = u.searchParams.get('client_id')?.slice(3);
    const usuario = u.searchParams.get('channel_user_id')?.slice(3);
    if (tabla === 'whatsapp_conversations') {
      const row = conversaciones.get(`${cliente}:${usuario}`);
      return new Response(JSON.stringify(row ? [row] : []));
    }
    let filas = [...mensajes.values()].filter(row => row.client_id === cliente && row.channel_user_id === usuario);
    const filtros = u.searchParams.get('and') || '';
    for (const op of ['lt', 'gt']) {
      const fecha = filtros.match(new RegExp(`created_at\\.${op}\\.([^,]+)`))?.[1];
      const id = filtros.match(new RegExp(`id\\.${op}\\.([^),]+)`))?.[1];
      if (fecha) filas = filas.filter(row => op === 'lt'
        ? row.created_at < fecha || row.created_at === fecha && row.id < id
        : row.created_at > fecha || row.created_at === fecha && row.id > id);
    }
    const excluido = (u.searchParams.get('or') || '').match(/turnId\.neq\.([^)]*)/)?.[1];
    if (excluido) filas = filas.filter(row => row.metadata?.turnId !== excluido);
    filas.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    if (u.searchParams.get('order').startsWith('created_at.desc')) filas.reverse();
    return new Response(JSON.stringify(filas.slice(0, Number(u.searchParams.get('limit')))));
  });
  return { conversaciones, mensajes, solicitudes };
}

function cargarStore() {
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/conversation/conversationStore'), 'utf8'), {
    require: () => repository, module: modulo, process, console: { error() {} },
  });
  return modulo.exports;
}

test('foto → pregunta → x2kl mantiene producto tras reiniciar y consulta Supabase antes de OpenAI', async t => {
  const base = baseSimulada(t);
  const cliente = { id: 'tenant-a', vertical: 'petshop' };
  const usuario = '573001234567';
  let store = cargarStore();
  let estado = await store.obtenerConversacionPersistida(usuario, cliente);
  const visual = { marca: 'NUTRIVA', referencia: 'NUTRIVA ADULTO', especie: 'perro', etapa: 'adulto',
    observado: { nombre: 'NUTRIVA ADULTO', presentacion: null, confianzaIdentidad: 0.98, confianzaPresentacion: 0 } };
  // Persist an ambiguous visual turn just like the screenshot, not a confirmed cart item.
  const validacion = { nivel: 'media', requiereVision: true, alternativas: [
    { marca: visual.marca, referencia: visual.referencia, presentaciones: [{ peso: '2kg', precio: 25000 }] },
  ] };
  const pregunta = respuestaValidacionProducto(validacion);
  assert.match(pregunta, /Qué peso estabas buscando/);
  assert.doesNotMatch(pregunta, /identific|disting|imagen|foto|OCR/i);
  await store.guardarConversacionPersistida(usuario, estado, { fase: 'entrada', cliente,
    idsEventos: ['canal:foto'], eventos: [{ messageId: 'foto', text: '¿Qué precio tiene?', messageType: 'image', media: { mediaId: 'media-1' } }] });
  Object.defineProperty(estado, '_interpretacionTurno', { value: { intencion: 'consulta_producto', producto: visual } });
  await store.guardarConversacionPersistida(usuario, estado, { cliente, idsEventos: ['canal:foto'], respuesta: pregunta });
  // Another tenant uses the same phone; its history must not leak.
  await repository.guardarMensaje(usuario, 'inbound', 'OTRO TENANT', null, { id: 'tenant-b' });
  store = cargarStore();
  estado = await store.obtenerConversacionPersistida(usuario, cliente);
  assert.equal(estado.ultimaPreguntaAsistente, pregunta);
  const archivo = require.resolve('../src/services/conversationService');
  const localRequire = createRequire(archivo);
  const catalogo = [{ marca: visual.marca, referencias: [{ nombre: visual.referencia, especie: 'perro',
    presentaciones: [{ peso: '2kg', precio: 25000 }, { peso: '5kg', precio: 50000 }] }] }];
  let llamadasIA = 0;
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => cliente },
    '../conversation/conversationStore': store,
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async args => {
      assert.match(args.mensaje, /NUTRIVA ADULTO.*2kg/);
      return { catalogo, metadata: {} };
    } },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      llamadasIA++;
      const entradas = [...base.mensajes.values()].filter(row => row.body === 'x2kl');
      assert.equal(entradas.length, 1, 'inbound persisted before model call');
      assert.equal(args.historialReciente.length, 2, 'current inbound is supplied separately');
      assert.deepEqual(args.historialReciente.map(row => row.direction), ['inbound', 'outbound']);
      assert.equal(args.historialReciente[0].metadata.interpretacion.producto.referencia, visual.referencia);
      assert.equal(args.historialReciente[1].body, pregunta);
      const contexto = construirSolicitudInterprete(args).contexto;
      assert.match(JSON.stringify(contexto), /NUTRIVA ADULTO/);
      assert.doesNotMatch(JSON.stringify(contexto), /OTRO TENANT/);
      return { intencion: 'consulta_producto', accion: 'consultar', confianza: 0.99,
        consultaCatalogo: { necesaria: true, consulta: 'NUTRIVA ADULTO 2kg' },
        producto: { marca: visual.marca, referencia: visual.referencia, presentacion: '2kg' } };
    } },
    './humanizer': { humanizarRespuesta: async (_mensaje, respuesta) => respuesta },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
    require: name => mocks[name] || localRequire(name), module: modulo, process,
    console: { log() {}, error() {} },
  });
  const respuesta = await modulo.exports.responderEventoEntrante({ channelUserId: usuario, phoneNumberId: 'canal', messageId: 'peso', text: 'x2kl' });
  assert.match(respuesta, /25\.000/);
  assert.doesNotMatch(respuesta, /Qué producto|50\.000/);
  assert.ok(llamadasIA > 0);
  const recuperado = await cargarStore().obtenerConversacionPersistida(usuario, cliente);
  assert.equal(recuperado.carrito.length, 0);
  assert.equal(recuperado.productosConsultados[0].peso, '2kg');
  assert.equal([...base.mensajes.values()].filter(row => row.body === 'x2kl').length, 1);
  const imagen = [...base.mensajes.values()].find(row => row.metadata?.mediaId === 'media-1');
  assert.equal(imagen.body, '¿Qué precio tiene?');
  assert.equal(imagen.conversation_id, `conversation-${cliente.id}:${usuario}`);
});

test('abreviaturas de presentacion y referencias cortas conservan el foco', () => {
  for (const texto of ['x2kl', 'x 7 kg', 'por 12kg', '2 kg', 'sí', 'ese', 'el grande']) {
    assert.equal(esSenalReferenciaProducto(texto), true, texto);
  }
  assert.equal(_internals.pesoSolicitado('x2kl'), '2kg');
});

test('Supabase vuelve a leerse en cada turno y un fallo de historial no se convierte en memoria vacia', async t => {
  const base = baseSimulada(t);
  const store = cargarStore();
  const cliente = { id: 'a' };
  const estado = await store.obtenerConversacionPersistida('usuario', cliente);
  await store.guardarConversacionPersistida('usuario', estado, { cliente });
  base.conversaciones.get('a:usuario').state = { marca: 'ACTUALIZADA DESDE SUPABASE' };
  assert.equal((await store.obtenerConversacionPersistida('usuario', cliente)).marca, 'ACTUALIZADA DESDE SUPABASE');
  t.mock.method(global, 'fetch', async () => { throw new Error('network failed'); });
  await assert.rejects(store.obtenerHistorialRecientePersistido('usuario', 60, cliente), /network/);
});

test('audio y texto agrupados conservan origen, transcripcion y un solo registro por evento al reintentar', async t => {
  const base = baseSimulada(t);
  const store = cargarStore();
  const cliente = { id: 'audio-tenant' };
  const estado = await store.obtenerConversacionPersistida('usuario', cliente);
  const entrada = { fase: 'entrada', cliente, idsEventos: ['canal:audio', 'canal:texto'], eventos: [
    { messageId: 'audio', messageType: 'audio', media: { mediaId: 'voz-original' } },
    { messageId: 'texto', messageType: 'text', text: 'En dos paquetes' },
  ] };
  for (let intento = 0; intento < 2; intento++) {
    await store.guardarConversacionPersistida('usuario', estado, entrada);
    estado._turnoEntrante.contenidos = [{ text: 'Quiero consultar el alimento' }, { text: 'En dos paquetes' }];
    await store.guardarConversacionPersistida('usuario', estado, { cliente, respuesta: '¿Qué presentación necesitas?' });
  }
  assert.equal(base.mensajes.size, 3);
  const audio = [...base.mensajes.values()].find(row => row.metadata.mediaId === 'voz-original');
  assert.equal(audio.body, '[audio]');
  assert.equal(audio.metadata.transcripcion, 'Quiero consultar el alimento');
  const texto = [...base.mensajes.values()].find(row => row.body === 'En dos paquetes');
  assert.equal(audio.metadata.turnId, texto.metadata.turnId);
  assert.notEqual(audio.id, texto.id);
  assert.equal(audio.metadata.alcanceInterpretacion, 'turno');
});

test('historial antiguo se resume por paginas cronologicas y el cursor persistido evita resumirlo de nuevo', async t => {
  const base = baseSimulada(t);
  const cliente = { id: 'summary-tenant', vertical: 'petshop' };
  for (let i = 0; i < 85; i++) {
    const id = `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
    base.mensajes.set(id, { id, client_id: cliente.id, channel_user_id: 'usuario',
      // Timestamp ties exercise the second cursor field.
      created_at: new Date(Date.parse('2020-01-01T00:00:00Z') + Math.floor(i / 2) * 1000).toISOString(),
      direction: i % 2 ? 'outbound' : 'inbound', body: `hecho historico ${i}`, metadata: {} });
  }
  const resumidos = [];
  let cantidadRecientes;
  function cargarServicio() {
    const archivo = require.resolve('../src/services/conversationService');
    const localRequire = createRequire(archivo);
    const mocks = {
      './clients.service': { obtenerClienteActual: async () => cliente },
      '../conversation/conversationStore': cargarStore(),
      './aiInterpreter': { interpretarMensajeCliente: async args => {
        if (args.clasificacion.resumirHistorial) {
          for (const row of args.historialReciente) {
            assert.ok(!resumidos.includes(row.id), 'cursor must not repeat archived rows');
            resumidos.push(row.id);
          }
          return { resumenMemoria: [args.estado.memoriaConversacional?.resumen,
            ...args.historialReciente.map(row => row.body)].filter(Boolean).join('; ') };
        }
        cantidadRecientes = args.historialReciente.length;
        assert.ok(args.estado.memoriaConversacional.resumen.includes('hecho historico 0'));
        const contexto = construirSolicitudInterprete(args).contexto;
        assert.ok(contexto.contextoActivo.memoriaConversacional.includes('hecho historico 0'));
        assert.equal(contexto.historial.length, args.historialReciente.length);
        return { continuarFlujo: false, consultaCatalogo: { necesaria: false }, respuestaConversacional: 'Claro, seguimos.' };
      } },
      './humanizer': { humanizarRespuesta: async (_mensaje, respuesta) => respuesta },
    };
    const modulo = { exports: {} };
    vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { require: name => mocks[name] || localRequire(name),
      module: modulo, process, console: { log() {}, error() {} } });
    return modulo.exports;
  }
  await cargarServicio().responderEventoEntrante({ channelUserId: 'usuario', messageId: 'nuevo', text: 'Sigamos' });
  assert.equal(cantidadRecientes, 60);
  assert.equal(resumidos.length, 25);
  const cursorAnterior = base.conversaciones.get(`${cliente.id}:usuario`).state.memoriaConversacional.hasta;
  await cargarServicio().responderEventoEntrante({ channelUserId: 'usuario', messageId: 'siguiente', text: 'Gracias' });
  assert.equal(resumidos.length, 27);
  const cursor = base.conversaciones.get(`${cliente.id}:usuario`).state.memoriaConversacional.hasta;
  assert.notEqual(cursor.id, cursorAnterior.id);
  assert.equal(base.mensajes.size, 89, 'raw archive plus two turns is preserved');
});
