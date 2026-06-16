function noImplementado() {
  return "La vertical guarderia esta registrada, pero su flujo conversacional aun no esta implementado.";
}

module.exports = {
  resolverConsultaCatalogo: noImplementado,
  buscarMarca: () => null,
  extraerCriterios: () => ({}),
  tieneCriterios: () => false,
  solicitaMarcas: () => false,
  solicitaReferencias: () => false,
  solicitaRecomendacion: () => false,
  solicitaOpinionMarca: () => false,
  extraerPresupuesto: () => null,
  solicitaCierre: () => false,
  esSaludo: () => false,
  esAgradecimiento: () => false,
};
