const test = require("node:test");
const assert = require("node:assert/strict");

const { resolverConsultaCatalogo, cargarProductos } = require("../src/conversation/conversationEngine");
const { crearEstadoInicial } = require("../src/conversation/conversationStore");
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
