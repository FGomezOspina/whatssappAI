const test = require("node:test");
const assert = require("node:assert/strict");

const { cargarCatalogoCliente, cargarProductosDesdeJson } = require("../src/repositories/productRepository");

test("carga el catalogo multiempresa desde Supabase con el formato actual del motor", async () => {
  const urlAnterior = process.env.SUPABASE_URL;
  const secretAnterior = process.env.SUPABASE_SECRET_KEY;
  const fetchAnterior = global.fetch;
  const solicitudes = [];

  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";
  global.fetch = async (url, opciones) => {
    solicitudes.push({ url, opciones });

    if (url.includes("/catalog_brands")) {
      return new Response(JSON.stringify([{ id: "brand-1", name: "Chunky", metadata: { origen: "test" }, sort_order: 0 }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/catalog_references")) {
      return new Response(
        JSON.stringify([
          {
            id: "reference-1",
            brand_id: "brand-1",
            name: "Adulto Todas las Razas",
            species: "perro",
            category: "comida",
            subcategory: "concentrado",
            life_stage: "adulto",
            requires_confirmation: false,
            description: "Alimento completo",
            image_url: "https://example.com/chunky.jpg",
            metadata: { proteina: "pollo" },
            sort_order: 0,
          },
        ]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify([
        { reference_id: "reference-1", weight: "2kg", price: 32000, stock: true, metadata: { bodega: "principal" }, sort_order: 0 },
      ]),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  };

  try {
    const catalogo = await cargarCatalogoCliente({ id: "client-1", slug: "distrifinca" });

    assert.equal(solicitudes.length, 3);
    assert.match(solicitudes[0].url, /client_id=eq\.client-1/);
    assert.deepEqual(catalogo, [
      {
        marca: "Chunky",
        metadata: { origen: "test" },
        referencias: [
          {
            nombre: "Adulto Todas las Razas",
            especie: "perro",
            categoria: "comida",
            subcategoria: "concentrado",
            etapa: "adulto",
            requiereConfirmacion: false,
            descripcion: "Alimento completo",
            imagen: "https://example.com/chunky.jpg",
            metadata: { proteina: "pollo" },
            presentaciones: [{ peso: "2kg", precio: 32000, stock: true, metadata: { bodega: "principal" } }],
          },
        ],
      },
    ]);
  } finally {
    global.fetch = fetchAnterior;

    if (urlAnterior === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = urlAnterior;

    if (secretAnterior === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = secretAnterior;
  }
});

test("productos.json queda disponible como formato de importacion", () => {
  const catalogo = cargarProductosDesdeJson();

  assert.ok(catalogo.length > 0);
  assert.ok(catalogo[0].marca);
  assert.ok(catalogo[0].referencias.length > 0);
});
