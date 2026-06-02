require("dotenv").config({ quiet: true });

const { crearApp } = require("./src/app");

const app = crearApp();

if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
  });
}

module.exports = {
  app,
};
