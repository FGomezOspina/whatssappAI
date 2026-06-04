const orderLogic = require("./orderLogic");
const productLogic = require("./productLogic");
const prompts = require("./prompt");
const tools = require("./tools");

module.exports = {
  key: "petshop",
  businessType: "petshop",
  name: "Petshop",
  orderLogic,
  productLogic,
  prompts,
  tools,
};
