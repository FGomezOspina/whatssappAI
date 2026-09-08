require("dotenv").config({ quiet: true });

const { crearApp } = require("./src/app");

const app = crearApp();

if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, (error) => {
    if (error) {
      console.error(`No se pudo iniciar el servidor en puerto ${PORT}: ${error.code || error.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Servidor corriendo en puerto ${PORT}`);
  });
}

module.exports = {
  app,
};
