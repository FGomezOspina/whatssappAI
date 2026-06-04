const orderLogic = require("./orderLogic");

module.exports = {
  buscarMarca: orderLogic.buscarMarca,
  extraerCriterios: orderLogic.extraerCriterios,
  tieneCriterios: orderLogic.tieneCriterios,
  solicitaMarcas: orderLogic.solicitaMarcas,
  solicitaReferencias: orderLogic.solicitaReferencias,
  solicitaRecomendacion: orderLogic.solicitaRecomendacion,
  solicitaOpinionMarca: orderLogic.solicitaOpinionMarca,
  extraerPresupuesto: orderLogic.extraerPresupuesto,
  solicitaCierre: orderLogic.solicitaCierre,
  esSaludo: orderLogic.esSaludo,
  esAgradecimiento: orderLogic.esAgradecimiento,
};
