const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function iniciar(error) {
  const logs = [];
  const errores = [];
  const proceso = { env: { PORT: "3000" } };
  const modulo = { exports: {} };
  const app = { listen: (_port, callback) => callback(error) };
  const cargar = (name) => name === "dotenv"
    ? { config() {} }
    : { crearApp: () => app };
  cargar.main = modulo;
  vm.runInNewContext(fs.readFileSync(require.resolve("../server"), "utf8"), {
    require: cargar, module: modulo, process: proceso,
    console: { log: (message) => logs.push(message), error: (message) => errores.push(message) },
  });
  return { logs, errores, proceso };
}

test("el arranque fallido informa el error y devuelve codigo de salida no exitoso", () => {
  const resultado = iniciar(Object.assign(new Error("occupied"), { code: "EADDRINUSE" }));
  assert.equal(resultado.proceso.exitCode, 1);
  assert.deepEqual(resultado.logs, []);
  assert.match(resultado.errores[0], /3000: EADDRINUSE/);
});

test("anuncia el servidor solamente cuando escucha correctamente", () => {
  const resultado = iniciar();
  assert.equal(resultado.proceso.exitCode, undefined);
  assert.deepEqual(resultado.errores, []);
  assert.match(resultado.logs[0], /puerto 3000/);
});
