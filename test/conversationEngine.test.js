const test = require("node:test");
const assert = require("node:assert/strict");

const { resolverConsultaCatalogo, extraerPresupuesto } = require("../src/verticals/petshop/orderLogic");
const { crearEstadoInicial } = require("../src/conversation/conversationStore");
const { cargarProductos } = require("../src/repositories/productRepository");
const { asegurarRespuestaCatalogo } = require("../src/verticals/petshop/productLogic");

const catalogoPetshopExtendido = [
  {
    marca: "Boehringer",
    referencias: [
      {
        nombre: "NexGard",
        especie: "perro",
        categoria: "medicamento",
        subcategoria: "antipulgas",
        etapa: "todas",
        requiereConfirmacion: true,
        descripcion: "Tableta antipulgas para perros",
        metadata: { observaciones: "Confirmar peso" },
        presentaciones: [{ peso: "10 a 25 kg", precio: 85000, stock: true, metadata: {} }],
      },
    ],
  },
  {
    marca: "Chunky",
    referencias: [
      {
        nombre: "Adulto Todas las Razas",
        especie: "perro",
        categoria: "comida",
        subcategoria: "concentrado",
        etapa: "adulto",
        descripcion: "Alimento completo para perros adultos",
        presentaciones: [{ peso: "2kg", precio: 32000, stock: true, metadata: {} }],
      },
    ],
  },
  {
    marca: "Kong",
    referencias: [
      {
        nombre: "Classic",
        especie: "perro",
        categoria: "accesorio",
        subcategoria: "juguete",
        etapa: "todas",
        descripcion: "Juguete resistente para perros",
        presentaciones: [{ peso: "M", precio: 45000, stock: true, metadata: {} }],
      },
    ],
  },
];

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

test("no interpreta una cedula aislada como presupuesto", () => {
  assert.equal(extraerPresupuesto("1004755939"), null);
  assert.equal(extraerPresupuesto("presupuesto 100000"), 100000);
  assert.equal(extraerPresupuesto("100000", { permitirNumeroSolo: true }), 100000);
});

test("busca productos por categoria petshop", () => {
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo("tienen medicamentos para perro", estado, catalogoPetshopExtendido, null);

  assert.match(respuesta, /NexGard/i);
  assert.doesNotMatch(respuesta, /Chunky/i);
});

test("busca productos por subcategoria petshop", () => {
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo("necesito antipulgas para perro", estado, catalogoPetshopExtendido, null);

  assert.match(respuesta, /NexGard/i);
  assert.match(respuesta, /confirmaci[oó]n responsable|veterinario/i);
});

test("busca productos por especie y etapa", () => {
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo("comida para perro adulto", estado, catalogoPetshopExtendido, null);

  assert.match(respuesta, /Chunky/i);
  assert.match(respuesta, /Adulto Todas las Razas/i);
});

test("busca accesorios sin mezclarlos con comida", () => {
  const estado = crearEstadoInicial();
  const respuesta = resolverConsultaCatalogo("accesorio juguete para perro", estado, catalogoPetshopExtendido, null);

  assert.match(respuesta, /Kong/i);
  assert.doesNotMatch(respuesta, /Chunky/i);
});

test("prioriza un bloque de datos de envio sobre recomendaciones por presupuesto", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  const mensaje = [
    "1004755939",
    "fabio@gmail.com",
    "Carrera 21 No 20b22 barrio providencia",
    "Dora Inés Zapata",
    "efectivo",
  ].join("\n");
  estado.carrito = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "2kg",
      precio: 36000,
      cantidad: 2,
    },
  ];
  estado.esperandoConfirmacionDomicilio = true;

  const interpretacionIA = {
    intencion: "datos_envio",
    accion: null,
    confianza: 0.99,
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
      cedula: "1004755939",
      correo: "fabio@gmail.com",
      celular: null,
    },
  };

  const respuesta = resolverConsultaCatalogo(mensaje, estado, catalogo, interpretacionIA);

  assert.equal(estado.datosDomicilio.cedula, "1004755939");
  assert.match(respuesta, /- celular/);
  assert.doesNotMatch(respuesta, /presupuesto/i);
});

test("no trata una apertura de pedido como marca desconocida", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();

  const respuesta = resolverConsultaCatalogo("hola, para hacer un pedido", estado, catalogo, null);

  assert.doesNotMatch(respuesta, /no manejamos/i);
  assert.match(respuesta, /Dog Chow|Chunky|marca|producto/i);
});

test("no trata errores de dedo en apertura de pedido como producto desconocido", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();

  const respuesta = resolverConsultaCatalogo("buenos dias\nnecesito u8n pedido", estado, catalogo, null);

  assert.doesNotMatch(respuesta, /no manejamos/i);
  assert.doesNotMatch(respuesta, /u8n/i);
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

test("una imagen con referencia exacta usa el producto interpretado aunque el caption sea generico", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  const interpretacionIA = {
    intencion: "consulta_producto",
    accion: "consultar",
    confianza: 0.95,
    producto: {
      marca: "Chunky",
      referencia: "Adulto Todas las Razas",
      especie: "perro",
      etapa: "adulto",
      tamano: "todas",
      sabores: ["pollo"],
      presentacion: "2kg",
      cantidad: 1,
    },
    productos: [],
    entrega: {},
    datosCliente: {},
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const respuesta = resolverConsultaCatalogo("Manejan esta referencia", estado, catalogo, interpretacionIA);

  assert.equal(estado.carrito.length, 0);
  assert.equal(estado.productosConsultados.length, 1);
  assert.equal(estado.productosConsultados[0].marca, "Chunky");
  assert.equal(estado.productosConsultados[0].referencia, "Adulto Todas las Razas");
  assert.equal(estado.productosConsultados[0].peso, "2kg");
  assert.match(respuesta, /Chunky Adulto Todas las Razas 2kg: \$32\.000/i);
  assert.doesNotMatch(respuesta, /no tengo una referencia exacta|no tengo exactamente/i);
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

test("acepta direccion colombiana con manzana y casa como direccion completa", () => {
  const estado = crearEstadoInicial();
  const catalogo = cargarProductos();
  estado.carrito = [
    {
      marca: "Dog Chow",
      referencia: "Adulto Mini y Pequeño",
      peso: "4kg",
      precio: 68000,
      cantidad: 1,
    },
  ];
  estado.metodoPago = "efectivo";
  estado.esperandoDatosDomicilio = true;
  estado.datosDomicilio = {
    nombre: "Cliente Prueba",
    cedula: "1000000000",
    correo: "cliente@test.com",
    celular: "3001234567",
  };

  const respuesta = resolverConsultaCatalogo(
    "adulto raza pequena para la mz 1 cs 19 en dosquebradas",
    estado,
    catalogo,
    null
  );

  assert.equal(estado.entrega.tipo, "domicilio");
  assert.equal(estado.datosDomicilio.direccion, "mz 1 cs 19 en dosquebradas");
  assert.equal(estado.datosDomicilio.direccionParcial, undefined);
  assert.doesNotMatch(respuesta, /direccion completa/i);
  assert.match(respuesta, /¿Está todo correcto para confirmar el pedido?/);
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

function crearEstadoConPedidoAnterior() {
  const estado = crearEstadoInicial();
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
  estado.pedidoConfirmado = true;
  estado.confirmacionPedidoId = "pedido-anterior";
  return estado;
}

function interpretacionProductoNuevo({
  marca = "Chunky",
  referencia = "Adulto Razas Pequeñas",
  presentacion = "2kg",
  cantidad = 1,
  direccion = null,
} = {}) {
  return {
    intencion: "pedido_producto",
    accion: "nuevo_pedido",
    confianza: 0.99,
    producto: {
      marca,
      referencia,
      especie: "perro",
      etapa: "adulto",
      tamano: "pequeno",
      presentacion,
      cantidad,
    },
    productos: [],
    entrega: {
      tipo: direccion ? "domicilio" : null,
      direccion,
      direccionCompleta: direccion ? true : null,
      sector: null,
      metodoPago: null,
      sede: null,
    },
    datosCliente: {},
    carrito: { operacion: "agregar" },
    faltanteSugerido: null,
  };
}

test("ofrece repetir el ultimo pedido confirmado con productos y direccion", () => {
  const estado = crearEstadoConPedidoAnterior();
  const catalogo = cargarProductos();

  const pregunta = resolverConsultaCatalogo("Hola, quiero hacer un pedido", estado, catalogo, null);

  assert.match(pregunta, /2 x Dog Chow Adulto Mini y Pequeño 2kg: \$72\.000/);
  assert.match(pregunta, /Carrera 21 No 20b22 barrio providencia/);
  assert.match(pregunta, /¿Deseas repetirlo/);
  assert.equal(estado.esperandoConfirmacionRepetirPedido, true);

  const respuesta = resolverConsultaCatalogo("Sí, por favor", estado, catalogo, null);

  assert.equal(estado.pedidoConfirmado, true);
  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].cantidad, 2);
  assert.notEqual(estado.confirmacionPedidoId, "pedido-anterior");
  assert.match(respuesta, /pedido queda confirmado/i);
});

test("un producto distinto crea carrito nuevo y conserva datos de envio anteriores", () => {
  const estado = crearEstadoConPedidoAnterior();
  const catalogo = cargarProductos();
  const interpretacionIA = interpretacionProductoNuevo();

  const respuesta = resolverConsultaCatalogo(
    "Quiero un Chunky adulto razas pequeñas de 2kg",
    estado,
    catalogo,
    interpretacionIA
  );

  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].marca, "Chunky");
  assert.equal(estado.carrito[0].referencia, "Adulto Razas Pequeñas");
  assert.equal(estado.datosDomicilio.direccion, "Carrera 21 No 20b22 barrio providencia");
  assert.match(respuesta, /Nombre: Dora Inés Zapata/);
  assert.doesNotMatch(respuesta, /Dog Chow/);
});

test("perfecto confirma un pedido nuevo con datos anteriores sin repetir preguntas", () => {
  const estado = crearEstadoConPedidoAnterior();
  const catalogo = cargarProductos();
  const interpretacionIA = interpretacionProductoNuevo();

  const resumen = resolverConsultaCatalogo(
    "Quiero un Chunky adulto razas pequeñas de 2kg",
    estado,
    catalogo,
    interpretacionIA
  );

  assert.equal(estado.esperandoConfirmacionPedido, true);
  assert.match(resumen, /¿Está todo correcto para confirmar el pedido?/);

  const confirmacion = resolverConsultaCatalogo("perfecto", estado, catalogo, null);

  assert.equal(estado.pedidoConfirmado, true);
  assert.equal(estado.esperandoConfirmacionPedido, false);
  assert.match(confirmacion, /pedido queda confirmado/i);
  assert.doesNotMatch(confirmacion, /información del pedido anterior/i);
});

test("una confirmacion con error ortografico usa la intencion semantica y no reemplaza el nombre", () => {
  const estado = crearEstadoConPedidoAnterior();
  const catalogo = cargarProductos();
  estado.pedidoConfirmado = false;
  estado.esperandoConfirmacionPedido = true;
  const interpretacionIA = {
    intencion: "confirmacion",
    accion: "confirmar",
    confianza: 0.96,
    producto: {},
    productos: [],
    entrega: {},
    datosCliente: {
      nombre: null,
      cedula: null,
      correo: null,
      celular: null,
    },
    carrito: { operacion: null },
    faltanteSugerido: null,
  };

  const confirmacion = resolverConsultaCatalogo("perfect", estado, catalogo, interpretacionIA);

  assert.equal(estado.pedidoConfirmado, true);
  assert.equal(estado.datosDomicilio.nombre, "Dora Inés Zapata");
  assert.match(confirmacion, /pedido queda confirmado/i);
});

test("un si a reutilizar la direccion anterior confirma sin pedir otra aprobacion", () => {
  const estado = crearEstadoConPedidoAnterior();
  const catalogo = cargarProductos();
  estado.carrito = [
    {
      marca: "Chunky",
      referencia: "Adulto Razas Pequeñas",
      peso: "2kg",
      precio: 21000,
      cantidad: 1,
    },
  ];
  estado.pedidoConfirmado = false;
  estado.pedidoNuevoConDatosPrevios = true;
  estado.datosPreviosConfirmados = false;
  estado.esperandoConfirmacionDatosPrevios = true;

  const confirmacion = resolverConsultaCatalogo("sí por favor", estado, catalogo, null);

  assert.equal(estado.pedidoConfirmado, true);
  assert.equal(estado.esperandoConfirmacionPedido, false);
  assert.match(confirmacion, /pedido queda confirmado/i);
  assert.doesNotMatch(confirmacion, /¿Está todo correcto para confirmar el pedido?/);
});

test("el mismo producto con direccion nueva no suma el pedido anterior", () => {
  const estado = crearEstadoConPedidoAnterior();
  const catalogo = cargarProductos();
  const interpretacionIA = interpretacionProductoNuevo({
    marca: "Dog Chow",
    referencia: "Adulto Mini y Pequeño",
    cantidad: 1,
    direccion: "Calle 18 # 10-40 Centro",
  });

  resolverConsultaCatalogo(
    "Quiero un Dog Chow adulto raza pequeña 2kg para Calle 18 # 10-40 Centro",
    estado,
    catalogo,
    interpretacionIA
  );

  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].cantidad, 1);
  assert.equal(estado.datosDomicilio.direccion, "Calle 18 # 10-40 Centro");
});

test("un producto distinto con direccion nueva reemplaza solo la entrega anterior", () => {
  const estado = crearEstadoConPedidoAnterior();
  const catalogo = cargarProductos();
  const interpretacionIA = interpretacionProductoNuevo({
    direccion: "Calle 18 # 10-40 Centro",
  });

  resolverConsultaCatalogo(
    "Quiero un Chunky adulto razas pequeñas 2kg para Calle 18 # 10-40 Centro",
    estado,
    catalogo,
    interpretacionIA
  );

  assert.equal(estado.carrito.length, 1);
  assert.equal(estado.carrito[0].marca, "Chunky");
  assert.equal(estado.datosDomicilio.direccion, "Calle 18 # 10-40 Centro");
  assert.equal(estado.datosDomicilio.nombre, "Dora Inés Zapata");
  assert.equal(estado.datosDomicilio.cedula, "42105604");
});
