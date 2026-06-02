const test = require("node:test");
const assert = require("node:assert/strict");

const { resolverConsultaCatalogo } = require("../src/conversation/conversationEngine");
const { crearEstadoInicial } = require("../src/conversation/conversationStore");
const { cargarProductos } = require("../src/repositories/productRepository");
const { asegurarRespuestaCatalogo } = require("../src/services/responseGuard");

test("niega una presentacion inexistente aunque la referencia este ambigua", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  const mensaje = "necesito un domicilio para car 10 17.28 de un bulto de dog chow razas pequeñas x 8 kilos";

  const respuesta = resolverConsultaCatalogo(mensaje, estado, catalogo, null);

  assert.match(respuesta, /no tengo presentación de 8kg/i);
  assert.match(respuesta, /Adulto Mini y Pequeño/i);
  assert.match(respuesta, /Cachorros Mini y Pequeño/i);
  assert.equal(estado.carrito.length, 0);
});

test("niega una presentacion inexistente cuando la IA detecta la referencia exacta", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  const mensaje = "necesito un domicilio para car 10 17.28 de un bulto de dog chow razas pequeñas x 8 kilos";
  const interpretacionIA = {
    intencion: "pedido_producto",
    accion: "consultar",
    confianza: 0.95,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion: "8kg",
      cantidad: 1,
    },
    entrega: {
      tipo: "domicilio",
      direccion: "car 10 17.28",
      direccionCompleta: true,
      sector: null,
      metodoPago: null,
      sede: null,
    },
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: "presentacion",
  };

  const respuesta = resolverConsultaCatalogo(mensaje, estado, catalogo, interpretacionIA);

  assert.match(respuesta, /no tengo presentación de 8kg/i);
  assert.match(respuesta, /- 4kg: \$68\.000/i);
  assert.equal(estado.carrito.length, 0);
});

test("bloquea una respuesta humanizada que afirma agregar una presentacion inexistente", () => {
  const catalogo = cargarProductos();
  const mensaje = "necesito un domicilio para car 10 17.28 de un bulto de dog chow razas pequeñas x 8 kilos";
  const respuestaHumanizada =
    "Perfecto, ya dejé 1 paquete de Dog Chow para razas pequeñas de 8 kilos. ¿Quieres que continuemos con algún otro producto?";

  const respuesta = asegurarRespuestaCatalogo(mensaje, respuestaHumanizada, {
    catalogo,
    interpretacionIA: {
      producto: {
        marca: "Dog Chow",
        referencia: "Adulto Mini y Pequeño",
        presentacion: "8kg",
      },
    },
  });

  assert.match(respuesta, /no tengo presentación de 8kg/i);
  assert.doesNotMatch(respuesta, /ya dejé/i);
});

test("avanza a pago cuando el cliente cierra el carrito aunque la IA reinterprete el producto anterior", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  estado.entrega = { tipo: "domicilio", sede: null };
  estado.carrito = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "4kg",
      precio: 68000,
      cantidad: 1,
    },
  ];
  estado.esperandoConfirmacionDomicilio = true;

  const interpretacionEquivocada = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.92,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion: null,
      cantidad: null,
    },
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo("asi esta bien", estado, catalogo, interpretacionEquivocada);

  assert.match(respuesta, /método de pago|metodo de pago/i);
  assert.doesNotMatch(respuesta, /presentaciones/i);
  assert.equal(estado.esperandoMetodoPago, true);
});

test("no trata una apertura de pedido como marca desconocida", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();

  const respuesta = resolverConsultaCatalogo("hola, para hacer un pedido", estado, catalogo, null);

  assert.doesNotMatch(respuesta, /no manejamos/i);
  assert.match(respuesta, /Dog Chow|Chunky|marca|producto/i);
});

test("usa la raza de la mascota como contexto de recomendacion", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  const interpretacionIA = {
    intencion: "recomendacion",
    accion: "consultar",
    confianza: 0.95,
    producto: {
      marca: null,
      referencia: null,
      especie: "perro",
      etapa: "adulto",
      tamano: "grande",
      presentacion: null,
      cantidad: null,
    },
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  resolverConsultaCatalogo("hola necesito un pedido", estado, catalogo, null);
  const respuesta = resolverConsultaCatalogo("tengo un labrador adulto", estado, catalogo, interpretacionIA);

  assert.doesNotMatch(respuesta, /no manejamos/i);
  assert.match(respuesta, /Adulto Mediano y Grande|Adulto Todas las Razas/i);
  assert.equal(estado.criterios.especie, "perro");
  assert.equal(estado.criterios.etapa, "adulto");
  assert.equal(estado.criterios.tamano, "grande");
});

test("responde con alternativas cuando una recomendacion no tiene coincidencias exactas", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();

  const respuesta = resolverConsultaCatalogo(
    "recomiendame alimento economico para gato senior",
    estado,
    catalogo,
    null
  );

  assert.match(respuesta, /no tengo una referencia exacta|no encuentro una opción exacta/i);
});

test("agrega varios productos interpretados desde un mismo mensaje", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  const mensaje = [
    "Hola buenos días",
    "Por favor un pedido a domicilio p Arreboles Bl 1 Apto 102 Belmonte",
    "Dog chow a. rp 1kl",
    "dog choe a grande 2kl",
  ].join("\n");
  const interpretacionIA = {
    intencion: "pedido_producto",
    accion: "agregar",
    confianza: 0.96,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion: "1kg",
      cantidad: 1,
    },
    productos: [
      {
        marca: "Dog Chow",
        referencia: "Adulto Mini y Pequeño",
        especie: "perro",
        etapa: "adulto",
        tamano: "pequeno",
        presentacion: "1kg",
        cantidad: 1,
      },
      {
        marca: "Dog Chow",
        referencia: "Adulto Mediano y Grande",
        especie: "perro",
        etapa: "adulto",
        tamano: "grande",
        presentacion: "2kg",
        cantidad: 1,
      },
    ],
    entrega: {
      tipo: "domicilio",
      direccion: "Arreboles Bl 1 Apto 102 Belmonte",
      direccionCompleta: true,
      sector: null,
      metodoPago: null,
      sede: null,
    },
    datosCliente: {},
    carrito: { operacion: "agregar" },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo(mensaje, estado, catalogo, interpretacionIA);

  assert.equal(estado.carrito.length, 2);
  assert.match(respuesta, /Adulto Mini y Pequeño 1kg/i);
  assert.match(respuesta, /Adulto Mediano y Grande 2kg/i);
  assert.doesNotMatch(respuesta, /Adulto Mediano y Grande 1kg/i);
});

test("consultar precios no agrega productos al carrito", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  const interpretacionIA = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.96,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion: "1kg",
      cantidad: 1,
    },
    productos: [
      {
        marca: "Dog Chow",
        referencia: "Adulto Mini y Pequeño",
        especie: "perro",
        etapa: "adulto",
        tamano: "pequeno",
        presentacion: "1kg",
        cantidad: 1,
      },
      {
        marca: "Dog Chow",
        referencia: "Adulto Mediano y Grande",
        especie: "perro",
        etapa: "adulto",
        tamano: "grande",
        presentacion: "2kg",
        cantidad: 1,
      },
    ],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo(
    "precio dog chow a rp 1kl y dog chow adulto grande 2kl",
    estado,
    catalogo,
    interpretacionIA
  );

  assert.equal(estado.carrito.length, 0);
  assert.equal(estado.productosConsultados.length, 2);
  assert.match(respuesta, /Estos son los precios/i);
  assert.match(respuesta, /Adulto Mini y Pequeño 1kg/i);
  assert.match(respuesta, /Adulto Mediano y Grande 2kg/i);
});

test("despues de cotizar puede agregar los productos consultados", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  estado.productosConsultados = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "1kg",
      precio: 19000,
      cantidad: 1,
    },
    {
      marca: "Dog Chow",
      referencia: "Adulto Mediano y Grande",
      peso: "2kg",
      precio: 38000,
      cantidad: 1,
    },
  ];
  const interpretacionIA = {
    intencion: "pedido_producto",
    accion: "agregar",
    confianza: 0.95,
    producto: {},
    productos: [],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: "agregar" },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo("agregame los dos", estado, catalogo, interpretacionIA);

  assert.equal(estado.carrito.length, 2);
  assert.equal(estado.productosConsultados.length, 0);
  assert.match(respuesta, /agregué al pedido/i);
});

test("consulta de precio de un solo producto no agrega al carrito", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  const interpretacionIA = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.96,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion: "4kg",
      cantidad: 1,
    },
    productos: [],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo(
    "Que precio tienen el cuido Purina dog chow a r pequeña de 4kl?",
    estado,
    catalogo,
    interpretacionIA
  );

  assert.equal(estado.carrito.length, 0);
  assert.equal(estado.productosConsultados.length, 1);
  assert.match(respuesta, /\$68\.000/);
  assert.doesNotMatch(respuesta, /Pedido:/);
});

test("otra pregunta de precio despues de cotizar sigue sin agregar", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  estado.productosConsultados = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "4kg",
      precio: 68000,
      cantidad: 1,
    },
  ];
  const interpretacionIA = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.95,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mediano y Grande",
      especie: "perro",
      etapa: "adulto",
      tamano: "grande",
      presentacion: "1kg",
      cantidad: 1,
    },
    productos: [],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo("y el dog chow a raza grande 1kl?", estado, catalogo, interpretacionIA);

  assert.equal(estado.carrito.length, 0);
  assert.equal(estado.productosConsultados.length, 1);
  assert.match(respuesta, /\$20\.000/);
  assert.doesNotMatch(respuesta, /agregué|Pedido:/i);
});

test("una direccion despues de cotizar continua el pedido con el producto consultado", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  estado.productosConsultados = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "4kg",
      precio: 68000,
      cantidad: 1,
    },
  ];
  const interpretacionIA = {
    intencion: "pedido_producto",
    accion: "agregar",
    confianza: 0.97,
    producto: {},
    productos: [],
    entrega: {
      tipo: "domicilio",
      direccion: "calle 18 # 10-40, CENTRO",
      direccionCompleta: true,
      sector: null,
      metodoPago: null,
      sede: null,
    },
    datosCliente: {},
    carrito: { operacion: "agregar" },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo(
    "para calle 18 # 10-40, CENTRO",
    estado,
    catalogo,
    interpretacionIA
  );

  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.productosConsultados.length, 0);
  assert.equal(estado.entrega.tipo, "domicilio");
  assert.equal(estado.datosDomicilio.direccion, "calle 18 # 10-40, CENTRO");
  assert.match(respuesta, /agregué al pedido/i);
  assert.doesNotMatch(respuesta, /no estamos realizando domicilios|recoger/i);
});

test("un metodo de pago no reemplaza el nombre confirmado del domicilio", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  estado.carrito = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "2kg",
      precio: 36000,
      cantidad: 2,
    },
  ];
  estado.entrega = { tipo: "domicilio", sede: null };
  estado.datosDomicilio = {
    nombre: "Dora Inés Zapata",
    cedula: "42105604",
    correo: "luz@gmail.com",
    celular: "3124138191",
    direccion: "Carrera 21 No 20b22 barrio providencia",
  };
  estado.esperandoDatosDomicilio = true;
  estado.esperandoMetodoPago = true;
  const interpretacionIA = {
    intencion: "metodo_pago",
    accion: null,
    confianza: 0.99,
    producto: {},
    productos: [],
    entrega: {
      tipo: null,
      direccion: null,
      direccionCompleta: null,
      sector: null,
      metodoPago: "efectivo",
      sede: null,
    },
    datosCliente: {
      nombre: null,
      cedula: null,
      correo: null,
      celular: null,
    },
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo("efectivo", estado, catalogo, interpretacionIA);

  assert.equal(estado.datosDomicilio.nombre, "Dora Inés Zapata");
  assert.equal(estado.metodoPago, "efectivo");
  assert.match(respuesta, /Nombre: Dora Inés Zapata/);
  assert.match(respuesta, /¿Está todo correcto para confirmar el pedido?/);
  assert.doesNotMatch(respuesta, /Nombre: efectivo/);
  assert.equal(estado.pedidoConfirmado, false);

  const confirmacion = resolverConsultaCatalogo("sí", estado, catalogo, null);

  assert.equal(estado.pedidoConfirmado, true);
  assert.match(confirmacion, /pedido queda confirmado/i);
});

test("un lote completo recapitula el pedido y espera confirmacion explicita", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  const mensaje = [
    "Hola",
    "Por favor me vende 2 paquetes de dog chow a raza pequeña 2kl?",
    "Carrera 21 No 20b22 barrio providencia",
    "Dora Inés Zapata",
    "42105604",
    "luz@gmail.com",
    "3124138191",
    "efectivo",
  ].join("\n");
  const interpretacionIA = {
    intencion: "pedido_producto",
    accion: "agregar",
    confianza: 0.99,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion: "2kg",
      cantidad: 2,
    },
    productos: [],
    entrega: {
      tipo: "domicilio",
      direccion: "Carrera 21 No 20b22 barrio providencia",
      direccionCompleta: true,
      sector: null,
      metodoPago: "efectivo",
      sede: null,
    },
    datosCliente: {
      nombre: "Dora Inés Zapata",
      cedula: "42105604",
      correo: "luz@gmail.com",
      celular: "3124138191",
    },
    carrito: { operacion: "agregar" },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo(mensaje, estado, catalogo, interpretacionIA);

  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.pedidoConfirmado, false);
  assert.equal(estado.esperandoConfirmacionPedido, true);
  assert.match(respuesta, /2 x Dog Chow Adulto Mini y Pequeño 2kg: \$72\.000/);
  assert.match(respuesta, /Nombre: Dora Inés Zapata/);
  assert.match(respuesta, /Método de pago: efectivo/);
  assert.match(respuesta, /¿Está todo correcto para confirmar el pedido?/);
});

test("un lote incompleto pide solamente los datos de envio faltantes", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  const mensaje = [
    "Hola",
    "Por favor me vende 2 paquetes de dog chow a raza pequeña 2kl?",
    "Carrera 21 No 20b22 barrio providencia",
    "Dora Inés Zapata",
    "efectivo",
  ].join("\n");
  const interpretacionIA = {
    intencion: "pedido_producto",
    accion: "agregar",
    confianza: 0.99,
    producto: {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion: "2kg",
      cantidad: 2,
    },
    productos: [],
    entrega: {
      tipo: "domicilio",
      direccion: "Carrera 21 No 20b22 barrio providencia",
      direccionCompleta: true,
      sector: null,
      metodoPago: "efectivo",
      sede: null,
    },
    datosCliente: {
      nombre: "Dora Inés Zapata",
      cedula: null,
      correo: null,
      celular: null,
    },
    carrito: { operacion: "agregar" },
    faltanteSugerido: "cedula",
  };

  const respuesta = resolverConsultaCatalogo(mensaje, estado, catalogo, interpretacionIA);

  assert.match(respuesta, /- cedula/);
  assert.match(respuesta, /- correo/);
  assert.match(respuesta, /- celular/);
  assert.doesNotMatch(respuesta, /- nombre/);
  assert.doesNotMatch(respuesta, /- direccion completa/);
});

test("permite cambiar el metodo de pago desde el resumen sin alterar el nombre", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  estado.carrito = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "2kg",
      precio: 36000,
      cantidad: 2,
    },
  ];
  estado.entrega = { tipo: "domicilio", sede: null };
  estado.metodoPago = "efectivo";
  estado.datosDomicilio = {
    nombre: "Dora Inés Zapata",
    cedula: "42105604",
    correo: "luz@gmail.com",
    celular: "3124138191",
    direccion: "Carrera 21 No 20b22 barrio providencia",
  };
  estado.esperandoConfirmacionPedido = true;

  const respuesta = resolverConsultaCatalogo("tarjeta", estado, catalogo, null);

  assert.equal(estado.datosDomicilio.nombre, "Dora Inés Zapata");
  assert.equal(estado.metodoPago, "tarjeta debito o credito");
  assert.match(respuesta, /Nombre: Dora Inés Zapata/);
  assert.match(respuesta, /Método de pago: tarjeta debito o credito/);
  assert.doesNotMatch(respuesta, /Nombre: tarjeta/);
});
