const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEstadoInicial } = require('../src/conversation/conversationStore');
const { resolverConsultaCatalogo, aplicarDatosInterpretados } = require('../src/verticals/petshop/orderLogic');
function estado() { return { ...crearEstadoInicial(), carrito: [{ marca:'PRUEBA',referencia:'PRUEBA',peso:'22.7kg',precio:193962,cantidad:1 }], entrega:{tipo:'domicilio'}, esperandoDatosDomicilio:true }; }
const interpretar = entrega => ({ intencion:'datos_envio', consultaCatalogo:{necesaria:false}, entrega });
test('dirección anterior sin valor persistido no satisface el dato; dirección real sí', () => {
  for (const referencia of ['la misma dirección', 'la direcion que me habia creado', 'la anterior']) {
    const s = estado();
    const respuesta = resolverConsultaCatalogo('a la dirección anterior',s,[],interpretar({direccion:referencia,tipo:'domicilio'}));
    assert.ok(!s.datosDomicilio.direccion);
    assert.match(respuesta, /- direccion/);
    s.datosDomicilio.direccion = 'Calle 20 # 10-30';
    aplicarDatosInterpretados(s,interpretar({direccion:referencia}));
    assert.equal(s.datosDomicilio.direccion,'Calle 20 # 10-30');
  }
});
test('nombre dirección y pago en una línea se conservan aunque el modelo omita nombre o lo incluya en dirección', () => {
  for (const direccion of [null, 'Gustavo Correa Mz 1 cs 19 sakabuma Dosquebradas']) {
    let s=estado();
    const respuesta=resolverConsultaCatalogo('Gustavo Correa Mz 1 cs 19 sakabuma Dosquebradas pago transferencia',s,[],interpretar({direccion,metodoPago:'transferencia bancaria'}));
    s=JSON.parse(JSON.stringify(s));
    assert.equal(s.datosDomicilio.nombre,'Gustavo Correa');
    assert.equal(s.datosDomicilio.direccion,'Mz 1 cs 19 sakabuma Dosquebradas');
    assert.equal(s.metodoPago,'transferencia bancaria');
    assert.doesNotMatch(respuesta, /- nombre|- direccion/);
    for(const campo of ['cedula','correo','celular']) assert.ok(respuesta.includes(`- ${campo}`));
  }
});
test('la normalización recupera el nombre atrapado en dirección sin reemplazar un nombre confirmado', () => {
  for(const nombre of [null,'Ana Prueba']) {
    const s=estado();s.datosDomicilio={direccion:'Gustavo Correa Mz 1 cs 19 sakabuma Dosquebradas',...(nombre?{nombre}:{})};
    aplicarDatosInterpretados(s,{});
    assert.equal(s.datosDomicilio.nombre,nombre||'Gustavo Correa');
    assert.equal(s.datosDomicilio.direccion,'Mz 1 cs 19 sakabuma Dosquebradas');
  }
});
