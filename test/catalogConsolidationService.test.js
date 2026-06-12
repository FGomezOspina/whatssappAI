const assert = require("node:assert/strict");
const test = require("node:test");

const {
  consolidarCatalogo,
  _internals,
} = require("../src/services/catalogConsolidationService");

test("consolida errores ortograficos de marca y referencia en una sola familia", () => {
  const catalogo = consolidarCatalogo([
    {
      marca: "EXCELLENT",
      referencias: [
        {
          nombre: "EXCELLENT GATO URINARY",
          especie: "gato",
          categoria: "comida",
          metadata: { original_names: ["EXCELLENT GATO URINARY 1KG"] },
          presentaciones: [{ peso: "1kg", precio: 34000 }],
        },
        {
          nombre: "EXCELLENT GATO ADULT",
          especie: "gato",
          categoria: "comida",
          metadata: {},
          presentaciones: [{ peso: "3kg", precio: 74700 }],
        },
      ],
    },
    {
      marca: "EXCELLLET",
      referencias: [
        {
          nombre: "EXCELLLET GATO URINARY",
          especie: "gato",
          categoria: "comida",
          metadata: {},
          presentaciones: [{ peso: "x 3kg", precio: 81900 }],
        },
      ],
    },
    {
      marca: "EXCELLET",
      referencias: [
        {
          nombre: "EXCELLET GATO UNINARY",
          especie: "gato",
          categoria: "comida",
          metadata: {},
          presentaciones: [{ peso: "7.5kg", precio: 163700 }],
        },
      ],
    },
  ]);

  assert.equal(catalogo.length, 1);
  assert.equal(catalogo[0].marca, "EXCELLENT");
  const urinary = catalogo[0].referencias.find(
    (referencia) => referencia.nombre === "EXCELLENT GATO URINARY"
  );
  assert.ok(urinary);
  assert.deepEqual(
    urinary.presentaciones.map((presentacion) => presentacion.peso),
    ["1kg", "x 3kg", "7.5kg"]
  );
  assert.deepEqual(
    urinary.metadata.equivalent_references,
    [
      "EXCELLENT GATO URINARY",
      "EXCELLLET GATO URINARY",
      "EXCELLET GATO UNINARY",
    ]
  );
  assert.ok(
    catalogo[0].referencias.some(
      (referencia) => referencia.nombre === "EXCELLENT GATO ADULT"
    )
  );
});

test("la consolidacion es generica y no une lineas distintas por compartir marca", () => {
  const catalogo = consolidarCatalogo([
    {
      marca: "NUTRILINE",
      referencias: [
        {
          nombre: "NUTRILINE CAT URINARY",
          especie: "gato",
          metadata: {},
          presentaciones: [{ peso: "1.5kg", precio: 100000 }],
        },
        {
          nombre: "NUTRILINE CAT RENAL",
          especie: "gato",
          metadata: {},
          presentaciones: [{ peso: "1.5kg", precio: 105000 }],
        },
      ],
    },
    {
      marca: "NUTRILNE",
      referencias: [
        {
          nombre: "NUTRILNE CAT URINAY",
          especie: "gato",
          metadata: {},
          presentaciones: [{ peso: "3kg", precio: 190000 }],
        },
      ],
    },
  ]);

  assert.equal(catalogo.length, 1);
  assert.equal(catalogo[0].referencias.length, 2);
  assert.deepEqual(
    catalogo[0].referencias
      .find((referencia) => /URINARY/.test(referencia.nombre))
      .presentaciones.map((presentacion) => presentacion.peso),
    ["1.5kg", "3kg"]
  );
  assert.ok(
    catalogo[0].referencias.some((referencia) => /RENAL/.test(referencia.nombre))
  );
  assert.ok(
    _internals.similitudOrtografica("EXCELLENT", "EXCELLLET") >= 0.76
  );
});

test("tambien fusiona typos de referencias dentro de una misma marca", () => {
  const catalogo = consolidarCatalogo([
    {
      marca: "MARCA DEMO",
      referencias: [
        {
          nombre: "MARCA DEMO GATO SENSITIVE",
          especie: "gato",
          metadata: {},
          presentaciones: [{ peso: "1kg", precio: 30000 }],
        },
        {
          nombre: "MARCA DEMO GATO SENSITVE",
          especie: "gato",
          metadata: {},
          presentaciones: [{ peso: "3kg", precio: 70000 }],
        },
      ],
    },
  ]);

  assert.equal(catalogo[0].referencias.length, 1);
  assert.deepEqual(
    catalogo[0].referencias[0].presentaciones.map(
      (presentacion) => presentacion.peso
    ),
    ["1kg", "3kg"]
  );
});

test("infiere una unidad omitida solo cuando la familia usa una unidad consistente", () => {
  const catalogo = consolidarCatalogo([
    {
      marca: "MARCA BASE",
      referencias: [
        {
          nombre: "MARCA BASE ORIGINAL",
          metadata: {},
          presentaciones: [
            { peso: "1kg", precio: 10000 },
            { peso: "2kg", precio: 19000 },
            { peso: "x 20", precio: 150000 },
          ],
        },
        {
          nombre: "MARCA BASE TABLETAS",
          metadata: {},
          presentaciones: [{ peso: "x100", precio: 50000 }],
        },
      ],
    },
  ]);

  const original = catalogo[0].referencias.find(
    (referencia) => referencia.nombre === "MARCA BASE ORIGINAL"
  );
  const tabletas = catalogo[0].referencias.find(
    (referencia) => referencia.nombre === "MARCA BASE TABLETAS"
  );
  assert.deepEqual(
    original.presentaciones.map((presentacion) => presentacion.peso),
    ["1kg", "2kg", "20kg"]
  );
  assert.equal(original.presentaciones[2].metadata.original_weight, "x 20");
  assert.equal(tabletas.presentaciones[0].peso, "x100");
});
