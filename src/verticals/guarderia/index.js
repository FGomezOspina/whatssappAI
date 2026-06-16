const orderLogic = require("./orderLogic");
const productLogic = require("./productLogic");
const prompts = require("./prompt");
const tools = require("./tools");

module.exports = {
  key: "guarderia",
  businessType: "guarderia",
  name: "Guarderia de mascotas",
  implemented: false,
  orderLogic,
  productLogic,
  prompts,
  tools,
};
