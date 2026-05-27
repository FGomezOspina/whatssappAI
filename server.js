require("dotenv").config({ quiet: true });

const { crearApp } = require("./src/app");
const {
  resolverConsultaCatalogo,
  obtenerConversacion,
  cargarProductos,
} = require("./src/conversation/conversationEngine");

const app = crearApp();

if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
  });
}

module.exports = {
  app,
  resolverConsultaCatalogo,
  obtenerConversacion,
  cargarProductos,
};
