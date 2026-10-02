const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { validarCoincidenciaProducto } = require('../src/services/productMatchValidator');
const clasificacion = { intencion: 'busqueda_producto', perfilContexto: 'pedido' };
const chunky = require('../productos.json').filter(m => m.marca === 'CHUNKY');

test('nombre comercial completo no exige sabor ni se confunde con gatitos', () => {
  for (const mensaje of ['Chunky cats gatos x8kg', 'No, es chunky cats gatos x8kg original']) {
    const v = validarCoincidenciaProducto({ mensaje, catalogo: chunky, clasificacion });
    assert.equal(v.nivel, 'alta');
    assert.equal(v.coincidencia.referencia, 'CHUNKY CATS GATOS');
    assert.equal(v.coincidencia.presentaciones.find(p => require("../src/utils/text").normalizarPeso(p.peso) === "8kg").precio, 70900);
    assert.equal(v.aclaracion, null);
  }
  const catalogo = [{ marca: 'PRUEBA', referencias: [
    { nombre: 'PRUEBA CATS GATOS', especie: 'gato', presentaciones: [{ peso: '8kg', precio: 100 }] },
    { nombre: 'PRUEBA GATOS POLLO', especie: 'gato', presentaciones: [{ peso: '8kg', precio: 200 }] },
    { nombre: 'PRUEBA GATITOS', especie: 'gato', etapa: 'cachorro', presentaciones: [{ peso: '8kg', precio: 300 }] },
  ] }];
  const v = validarCoincidenciaProducto({ mensaje: 'PRUEBA CATS GATOS 8kg original', catalogo, clasificacion });
  assert.equal(v.coincidencia.referencia, 'PRUEBA CATS GATOS');
});

test('lista parcialmente extraida se revisa, conserva carrito al aclarar y completa sin duplicar', async () => {
  const catalogo = [...chunky, ...['SEGUNDA', 'TERCERA'].map((marca, i) => ({ marca, referencias: [{ nombre: marca,
    especie: 'gato', presentaciones: [{ peso: i ? '4kg' : '3kg', precio: i ? 20000 : 80000 }] }] }))];
  const solicitudes = [
    { marca: 'CHUNKY', especie: 'gato', presentacion: '8kg', cantidad: 1 },
    { marca: 'SEGUNDA', referencia: 'SEGUNDA', presentacion: '3kg', cantidad: 2 },
    { marca: 'TERCERA', referencia: 'TERCERA', presentacion: '4kg', cantidad: 1 },
  ];
  let estado = crearEstadoInicial(), turno = 0, revisiones = 0;
  const archivo = require.resolve('../src/services/conversationService'), req = createRequire(archivo);
  const lectura = producto => ({ intencion: 'pedido_producto', accion: 'agregar', confianza: 0.74,
    producto, consultaCatalogo: { necesaria: true, consulta: [producto.marca, producto.referencia, producto.presentacion].filter(Boolean).join(' ') } });
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'multi-continuidad', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async (_id, e) => { estado = JSON.parse(JSON.stringify(e)); } },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo, metadata: {} }) },
    './humanizer': { humanizarRespuesta: async (_m, base) => base },
    './aiInterpreter': { interpretarMensajeCliente: async args => {
      if (args.clasificacion.revisionLista) { revisiones++; return { ...lectura(solicitudes[0]), productos: solicitudes }; }
      if (args.clasificacion.decisionHerramientas) {
        turno++;
        return { ...lectura(turno === 3 ? { ...solicitudes[0], referencia: 'CHUNKY CATS GATOS' } : solicitudes[0]), solicitudesProductoDetectadas: turno === 1 ? 3 : 1 };
      }
      if (turno === 1) return lectura(solicitudes.find(p => args.mensaje.includes(p.marca)) || solicitudes[0]);
      return lectura(turno === 3 ? { ...solicitudes[0], referencia: 'CHUNKY CATS GATOS' } : solicitudes[0]);
    } },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { module: modulo, require: n => mocks[n] || req(n), process,
    console: { log() {}, error() {} } });
  const enviar = text => modulo.exports.responderEventoEntrante({ channelUserId: 'test', text });
  const primera = await enviar('Para pedir chunky gatos 8kg\nDos SEGUNDA 3kg\nUna TERCERA 4kg');
  assert.equal(revisiones, 1);
  assert.deepEqual(estado.carrito.map(p => [p.referencia, p.cantidad]), [['SEGUNDA', 2], ['TERCERA', 1]], primera);
  assert.match(primera, /Pedido:/);
  assert.match(primera, /180\.000/);
  const segunda = await enviar('Chunky gatos 8kg');
  assert.match(segunda, /Pedido:/);
  assert.match(segunda, /SEGUNDA/);
  assert.match(segunda, /TERCERA/);
  const tercera = await enviar('No, es chunky cats gatos x8kg original');
  assert.deepEqual(estado.carrito.map(p => [p.referencia, p.cantidad]), [['SEGUNDA', 2], ['TERCERA', 1], ['CHUNKY CATS GATOS', 1]], tercera);
  assert.equal(estado.ultimaSolicitudProductos.filter(p => p.estado === 'pendiente').length, 0);
  assert.match(tercera, /250\.900/);
  assert.doesNotMatch(tercera, /qué sabor|que sabor|cuál sabor/i);
});

test('atributos de la lista real validan BR y arena sin repetir sus nombres comerciales', () => {
  const { _internals: { consultaSolicitudProducto } } = require('../src/services/conversationService');
  const catalogo = require('../productos.json');
  const mensaje = 'cuido br para gatos castrados de pollo de 3 kilos\n1 arena de maiz de 4 kilos';
  const solicitudes = [
    { marca: 'BR', textoVisible: 'cuido br para gatos castrados de pollo de 3 kilos', especie: 'gato',
      sabores: ['pollo'], condiciones: ['castrados'], presentacion: '3 kilos' },
    { textoVisible: 'arena de maiz de 4 kilos', categoria: 'arena', especie: 'gato', presentacion: '4 kilos' },
  ];
  const esperados = ['BR CAT CASTRADO POLLO', 'ARENA MAIZ CAT'];
  solicitudes.forEach((s, i) => {
    const texto = consultaSolicitudProducto(s, mensaje);
    const candidatos = catalogo.filter(m => i ? /ARENA/.test(m.marca) : /BR/.test(m.marca));
    const v = validarCoincidenciaProducto({ mensaje: texto, catalogo: candidatos, clasificacion });
    assert.equal(v.nivel, 'alta', texto);
    assert.equal(v.coincidencia.referencia, esperados[i]);
  });
  const v = validarCoincidenciaProducto({ mensaje: 'chunky cats pollo 8kl', catalogo: chunky, clasificacion });
  assert.equal(v.nivel, 'alta');
  assert.equal(v.coincidencia.referencia, 'CHUNKY GATOS POLLO');
  assert.equal(v.coincidencia.presentaciones.find(p => require('../src/utils/text').normalizarPeso(p.peso) === '8kg').precio, 107000);
});

test('lista real agrega BR y arena antes de aclarar Chunky sin inferir una marca de arena', async () => {
  let estado = crearEstadoInicial();
  const catalogo = require('../productos.json').filter(m => /CHUNKY|BR CAT|ARENA/.test(m.marca));
  const solicitudes = [
    { marca: 'CHUNKY', textoVisible: 'cuido chunky de 8 kilos para gatos del empaque naranja', especie: 'gato', presentacion: '8kg', cantidad: 1 },
    { marca: 'BR', textoVisible: 'cuido br para gatos castrados de pollo de 3 kilos', especie: 'gato', sabores: ['pollo'], condiciones: ['castrados'], presentacion: '3kg', cantidad: 1 },
    { marca: null, textoVisible: 'arena de maiz de 4 kilos', especie: 'gato', categoria: 'arena', presentacion: '4kg', cantidad: 1 },
  ];
  const archivo = require.resolve('../src/services/conversationService'), req = createRequire(archivo), modulo = { exports: {} };
  const mocks = {
    './clients.service': { obtenerClienteActual: async () => ({ id: 'real-list', vertical: 'petshop' }) },
    '../conversation/conversationStore': { obtenerConversacionPersistida: async () => estado,
      obtenerHistorialRecientePersistido: async () => [], guardarConversacionPersistida: async (_id, e) => { estado = JSON.parse(JSON.stringify(e)); } },
    '../repositories/trainingExampleRepository': { obtenerEjemplosEntrenamiento: async () => [] },
    './catalogContextService': { seleccionarCatalogoParaIA: async () => ({ catalogo, metadata: {},
      resultadosPorProducto: solicitudes.map((s, i) => ({ catalogo: catalogo.filter(m => i === 0 ? m.marca === 'CHUNKY' : i === 1 ? m.marca === 'BR CAT' : m.marca.includes('ARENA')) })) }) },
    './humanizer': { humanizarRespuesta: async (_m, base) => base },
    './aiInterpreter': { interpretarMensajeCliente: async a => {
      const base = { intencion: 'pedido_producto', accion: 'agregar', confianza: 0.8 };
      if (a.clasificacion.decisionHerramientas) return { ...base, productos: solicitudes, consultaCatalogo: { necesaria: true, consulta: 'lista de productos' } };
      const i = a.mensaje.includes('CHUNKY') ? 0 : a.mensaje.includes('BR') ? 1 : 2;
      const referencia = [null, 'BR CAT CASTRADO POLLO', 'ARENA MAIZ CAT'][i];
      return { ...base, producto: { ...solicitudes[i], referencia, marca: i === 2 ? 'ARENA MAIZ CAT' : solicitudes[i].marca } };
    } },
  };
  vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), { module: modulo, require: n => mocks[n] || req(n), process, console: { log() {}, error() {} } });
  const respuesta = await modulo.exports.responderEventoEntrante({ channelUserId: 'test', text: 'Para pedir chunky gatos 8kg\nBR para gatos castrados pollo 3kg\n1 arena de maiz 4kg' });
  assert.deepEqual(estado.carrito.map(p => [p.referencia, p.cantidad]), [['BR CAT CASTRADO POLLO', 1], ['ARENA MAIZ CAT', 1]], respuesta);
  assert.match(respuesta, /104\.800/);
  assert.equal(estado.ultimaSolicitudProductos.filter(p => p.estado === 'pendiente').length, 1);
});
