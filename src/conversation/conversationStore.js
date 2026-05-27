const conversaciones = {};

function crearEstadoInicial() {
  return {
    marca: null,
    criterios: {},
    ultimaSeleccion: null,
    productosPendientes: [],
    referenciasPendientes: null,
    carrito: [],
    datosDomicilio: {},
    esperandoDatosDomicilio: false,
    esperandoPresupuesto: false,
    pendienteRecomendacion: false,
    esperandoMarca: false,
    esperandoConfirmacionDomicilio: false,
    alternativaPendiente: null,
  };
}

function obtenerConversacion(usuario) {
  if (!conversaciones[usuario]) {
    conversaciones[usuario] = crearEstadoInicial();
  }

  return conversaciones[usuario];
}

module.exports = {
  crearEstadoInicial,
  obtenerConversacion,
};
