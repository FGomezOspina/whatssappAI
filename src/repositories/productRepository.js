const fs = require("fs");
const path = require("path");

const PRODUCTOS_PATH = path.join(__dirname, "..", "..", "productos.json");

function cargarProductos() {
  return JSON.parse(fs.readFileSync(PRODUCTOS_PATH, "utf8"));
}

module.exports = {
  PRODUCTOS_PATH,
  cargarProductos,
};
