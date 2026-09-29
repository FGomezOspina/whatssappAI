const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { _internals: { continuarSolicitudProducto } } = require('../src/services/conversationService');
const { resolverEvidenciaInterpretacion } = require('../src/services/productEvidenceService');
const producto = { marca: 'NUTRIPRUEBA', referencia: 'NUTRIPRUEBA CACH RG', especie: 'perro', etapa: 'cachorro', tamano: 'grande', cantidad: 1 };
function pendiente() {
  return { ...crearEstadoInicial(), ultimaConsultaProducto: { creadoEn: new Date().toISOString(),
    terminos: ['nutriprueba', 'cachorro', 'grande'], etiqueta: 'NUTRIPRUEBA cachorro grande',
    solicitudOriginal: { intencion: 'pedido_producto', accion: 'agregar', producto } } };
}
test('peso y confirmacion completan la solicitud pendiente sin borrar sus atributos', () => {
  let estado = pendiente();
  for (const mensaje of ['De un 1.5kg', 'De 1.5 kilos', 'De 1.5']) {
    const r = continuarSolicitudProducto({ intencion: 'pedido_producto', accion: 'agregar',
      producto: { presentacion: '1.5kg', marca: null, etapa: null } }, estado, mensaje);
    assert.equal(r.producto.etapa, 'cachorro');
    assert.equal(r.producto.presentacion, '1.5kg');
    assert.equal(r.consultaCatalogo.necesaria, true);
    estado.ultimaConsultaProducto.solicitudOriginal.producto = r.producto;
  }
  const si = continuarSolicitudProducto({ intencion: 'confirmacion', accion: 'confirmar' }, estado, 'Exactamente');
  assert.equal(si.accion, 'agregar');
  assert.equal(si.producto.etapa, 'cachorro');
  assert.equal(si.producto.presentacion, '1.5kg');
  const lectura = resolverEvidenciaInterpretacion({ producto: { marca: null, etapa: null, presentacion: null } }, si);
  assert.equal(lectura.producto.etapa, 'cachorro');
  assert.equal(lectura.producto.presentacion, '1.5kg');
});
test('no reutiliza identidad para un producto distinto, contexto vencido ni confirmacion tras ausencia', () => {
  const estado = pendiente();
  const nueva = { intencion: 'pedido_producto', accion: 'agregar', producto: { marca: 'OTRA', referencia: 'OTRA ADULTO' } };
  assert.equal(continuarSolicitudProducto(nueva, estado, 'OTRA adulto'), nueva);
  const si = { intencion: 'confirmacion', accion: 'confirmar' };
  estado.ultimaConsultaProducto.sinCoincidenciaInformada = true;
  assert.equal(continuarSolicitudProducto(si, estado, 'si'), si);
  estado.ultimaConsultaProducto.creadoEn = '2000-01-01';
  assert.equal(continuarSolicitudProducto(si, estado, 'si'), si);
});
test('producto existente pasa de peso faltante a carrito aunque router no solicite buscar', async () => {
  let estado = crearEstadoInicial();
  let turno = 0;
  const catalogo = [{ marca: producto.marca, referencias: [{ nombre: producto.referencia,
    especie: 'perro', etapa: 'cachorro', presentaciones: [{ peso: '1.5kg', precio: 37000 }, { peso: '3kg', precio: 70000 }] }] }];
  const file = require.resolve('../src/services/conversationService'), req = createRequire(file), moduleMock = { exports: {} };
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'atributos', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async (_id,s,meta) => {
        estado = JSON.parse(JSON.stringify(s)); estado.ultimaPreguntaAsistente = meta.respuesta;
      } },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo, metadata: {} }) },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      if (args.clasificacion.decisionHerramientas) {
        turno++;
        if (turno >= 3) return { intencion: 'confirmacion', accion: 'confirmar', confianza: 0.9,
          consultaCatalogo: { necesaria: false } };
        return { intencion: 'pedido_producto', accion: 'agregar', confianza: 0.9,
          producto: turno === 1 ? { ...producto, referencia: null } : { presentacion: '1.5kg' },
          continuarFlujo: false, consultaCatalogo: { necesaria: false }, respuestaConversacional: '¿Cuántos kilos?' };
      }
      return { intencion: 'pedido_producto', accion: 'agregar', confianza: 0.9,
        producto: turno === 1 ? { ...producto } : { ...producto, presentacion: null } };
    } },
    './humanizer': { humanizarRespuesta: async (_m,base) => base },
  };
  vm.runInNewContext(fs.readFileSync(file,'utf8'), { module: moduleMock, require: n => mocks[n] || req(n), process, console: { log() {}, error() {} } });
  await moduleMock.exports.responderEventoEntrante({ channelUserId: 'test', text: 'Me gustaría pedir NUTRIPRUEBA para cachorros de razas grandes' });
  assert.equal(estado.carrito.length, 0);
  const respuesta = await moduleMock.exports.responderEventoEntrante({ channelUserId: 'test', text: 'De un 1.5kg' });
  assert.equal(estado.carrito.length, 1, respuesta);
  assert.equal(estado.carrito[0].peso, '1.5kg');
  assert.match(respuesta, /37\.000/);
  assert.equal(estado.ultimaConsultaProducto, null);
  const siguiente = await moduleMock.exports.responderEventoEntrante({ channelUserId: 'test', text: 'si' });
  assert.equal(estado.carrito.length, 1, siguiente);
  assert.equal(estado.carrito[0].cantidad, 1, siguiente);
  assert.match(siguiente, /domicilio|recoger/i);
});


test('descripcion natural se vincula a nombres abreviados sin exigir referencia literal', () => {
  const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
  for (const marca of ['NUTRIPRUEBA', 'OTRAMARCA']) {
    const catalogo = [{ marca, referencias: ['CACH RG', 'CACH RP', 'ADUL RG'].map(variante => ({
      nombre: `${marca} ${variante}`, especie: 'perro', etapa: null,
      presentaciones: [{ peso: '1.5kg', precio: 37000 }],
    })) }];
    const validar = mensaje => validarCoincidenciaProducto({ mensaje, catalogo,
      clasificacion: { perfilContexto: 'pedido', intencion: 'busqueda_producto' } });
    const resultado = validar(`Me gustaría pedir un ${marca} para cachorros de razas grandes`);
    assert.equal(resultado.nivel, 'alta');
    assert.equal(resultado.coincidencia.referencia, `${marca} CACH RG`);
    const ambiguo = validar(`Quiero ${marca} para cachorros`);
    assert.notEqual(ambiguo.nivel, 'alta');
    assert.equal(ambiguo.aclaracion.campo, 'tamano');
    assert.deepEqual(ambiguo.aclaracion.valores.sort(), ['grande', 'pequeno']);
  }
});

test('responder especie conserva cachorro y pregunta solo tamano sin cambiar a premios', async () => {
  let estado = crearEstadoInicial();
  estado.ultimaConsultaProducto = {creadoEn:new Date().toISOString(),terminos:['agility','cachorro'],
    etiqueta:'Agility cachorro',aclaracion:{campo:'especie',valores:['perro','gato']},
    solicitudOriginal:{intencion:'pedido_producto',accion:'agregar',producto:{marca:'AGILITY',etapa:'cachorro',cantidad:1}}};
  const catalogo = require('../productos.json').filter(m=>m.marca==='AGILITY');
  const file = require.resolve('../src/services/conversationService'), req=createRequire(file), mod={exports:{}};
  const { _internals:{seleccionarCatalogoLocal} } = require('../src/services/catalogContextService');
  const consultas=[];
  const mocks={
    './clients.service':{obtenerClienteActual:async()=>({id:'especie',vertical:'petshop'})},
    '../conversation/conversationStore':{obtenerConversacionPersistida:async()=>estado,obtenerHistorialRecientePersistido:async()=>[],
      guardarConversacionPersistida:async(_id,s)=>{estado=JSON.parse(JSON.stringify(s));}},
    '../repositories/trainingExampleRepository':{obtenerEjemplosEntrenamiento:async()=>[]},
    './catalogContextService':{seleccionarCatalogoParaIA:async args=>{
      consultas.push(args.mensajeOriginal);
      return seleccionarCatalogoLocal({catalogo,mensaje:args.mensajeOriginal,clasificacion:args.clasificacion});
    }},
    './aiInterpreter':{interpretarMensajeCliente:async args=>({intencion:'pedido_producto',accion:'agregar',confianza:0.9,
      producto:args.clasificacion.decisionHerramientas
        ? {marca:'AGILITY',referencia:'AGILITY PERROS PREMIO',especie:'perro',etapa:'adulto',presentacion:'150gr',textoVisible:'Para perro'}
        : {marca:'AGILITY',especie:'perro',etapa:null},
      consultaCatalogo:{necesaria:true,consulta:'Agility premios perro 150gr'}})},
    './humanizer':{humanizarRespuesta:async(_m,base)=>base},
  };
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,require:n=>mocks[n]||req(n),process,console:{log(){},error(){}}});
  const respuesta=await mod.exports.responderEventoEntrante({channelUserId:'test',text:'Para perro'});
  assert.match(consultas[0],/cachorro.*perro/);
  assert.doesNotMatch(consultas[0],/premio|adulto|150/);
  assert.equal(estado.ultimaConsultaProducto.solicitudOriginal.producto.etapa,'cachorro');
  assert.equal(estado.ultimaConsultaProducto.aclaracion?.campo,'tamano',JSON.stringify({respuesta,consulta:estado.ultimaConsultaProducto}));
  assert.match(respuesta,/pequeno|pequeño/);
  assert.match(respuesta,/grande/);
  assert.doesNotMatch(respuesta,/adulto|premio|150|gato/i);
  assert.equal(estado.carrito.length,0);
});

test('tamano solo se pregunta cuando distingue variantes compatibles del catalogo', () => {
  const {validarCoincidenciaProducto} = require('../src/services/productMatchValidator');
  const validar = nombres => validarCoincidenciaProducto({mensaje:'PRUEBA para cachorros perro',
    catalogo:[{marca:'PRUEBA',referencias:nombres.map(nombre=>({nombre,especie:'perro',
      presentaciones:[{peso:'3kg',precio:100}]}))}],
    clasificacion:{intencion:'busqueda_producto',perfilContexto:'pedido'}});
  // Una variante de adultos por tamano no obliga a discriminar el cachorro generico.
  const generico = validar(['PRUEBA CACH','PRUEBA ADUL RG','PRUEBA ADUL RP']);
  assert.equal(generico.nivel,'alta');
  assert.equal(generico.coincidencia.referencia,'PRUEBA CACH');
  assert.equal(generico.aclaracion,null);
  const sabores = validar(['PRUEBA CACH POLLO','PRUEBA CACH CORDERO']);
  assert.equal(sabores.aclaracion.campo,'sabores');
  const tamanos = validar(['PRUEBA CACH RG','PRUEBA CACH RP']);
  assert.equal(tamanos.aclaracion.campo,'tamano');
  assert.deepEqual(tamanos.aclaracion.valores.sort(),['grande','pequeno']);
});
