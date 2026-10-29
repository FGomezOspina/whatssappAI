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
    const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
    const fuentes = directorio => fs.readdirSync(directorio, { withFileTypes: true })
      .flatMap(entry => entry.isDirectory() ? fuentes(path.join(directorio, entry.name))
        : entry.name.endsWith('.js') ? [path.join(directorio, entry.name)] : []);
    const hash = crypto.createHash('sha256');
    for (const archivo of [__filename, ...fuentes(path.join(__dirname, 'src'))].sort()) {
      hash.update(path.relative(__dirname, archivo)); hash.update(fs.readFileSync(archivo));
    }
    console.log('[Runtime] ' + JSON.stringify({ pid: process.pid, cwd: __dirname,
      startedAt: new Date().toISOString(), sourceHash: hash.digest('hex') }));
  });
}

module.exports = {
  app,
};
