const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { cargarCatalogoCliente, cargarProductosDesdeJson } = require("../src/repositories/productRepository");

function restaurarEnvCatalogo(envAnterior) {
  for (const [clave, valor] of Object.entries(envAnterior)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
}

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

test("carga referencias por lotes para evitar URLs enormes en Supabase", async () => {
  const envAnterior = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    CATALOG_QUERY_BATCH_SIZE: process.env.CATALOG_QUERY_BATCH_SIZE,
  };
  const fetchAnterior = global.fetch;
  const solicitudes = [];

  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";
  process.env.CATALOG_QUERY_BATCH_SIZE = "2";
  global.fetch = async (url) => {
    solicitudes.push(url);

    if (url.includes("/catalog_brands")) {
      return new Response(
        JSON.stringify([
          { id: "brand-1", name: "Marca 1", sort_order: 0 },
          { id: "brand-2", name: "Marca 2", sort_order: 1 },
          { id: "brand-3", name: "Marca 3", sort_order: 2 },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const catalogo = await cargarCatalogoCliente({ id: "client-1", slug: "distrifinca" });
    const consultasReferencias = solicitudes.filter((url) => url.includes("/catalog_references"));

    assert.equal(catalogo.length, 3);
    assert.equal(consultasReferencias.length, 2);
    assert.ok(consultasReferencias.some((url) => url.includes("brand_id=in.(brand-1,brand-2)")));
    assert.ok(consultasReferencias.some((url) => url.includes("brand_id=in.(brand-3)")));
  } finally {
    global.fetch = fetchAnterior;
    restaurarEnvCatalogo(envAnterior);
  }
});

test("no usa catalogo local de respaldo por defecto", async () => {
  const envAnterior = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    CATALOG_FALLBACK_LOCAL: process.env.CATALOG_FALLBACK_LOCAL,
    SUPABASE_REQUEST_RETRIES: process.env.SUPABASE_REQUEST_RETRIES,
  };
  const fetchAnterior = global.fetch;

  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";
  process.env.SUPABASE_REQUEST_RETRIES = "0";
  delete process.env.CATALOG_FALLBACK_LOCAL;
  global.fetch = async () => {
    throw new Error("fetch failed");
  };

  try {
    await assert.rejects(
      cargarCatalogoCliente({ id: "client-1", slug: "distrifinca" }),
      /Supabase network error.*fetch failed/
    );
  } finally {
    global.fetch = fetchAnterior;
    restaurarEnvCatalogo(envAnterior);
  }
});

test("usa catalogo local de respaldo si Supabase falla al cargar productos", async () => {
  const envAnterior = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    CATALOG_FALLBACK_FILE: process.env.CATALOG_FALLBACK_FILE,
    CATALOG_FALLBACK_LOCAL: process.env.CATALOG_FALLBACK_LOCAL,
    CATALOG_FALLBACK_CLIENTS: process.env.CATALOG_FALLBACK_CLIENTS,
    SUPABASE_REQUEST_RETRIES: process.env.SUPABASE_REQUEST_RETRIES,
  };
  const fetchAnterior = global.fetch;
  const warnAnterior = console.warn;
  const archivo = path.join(os.tmpdir(), `catalogo-fallback-${Date.now()}.json`);
  const avisos = [];

  fs.writeFileSync(
    archivo,
    JSON.stringify([
      {
        marca: "NexGard",
        referencias: [
          {
            nombre: "NexGard",
            especie: "perro",
            categoria: "medicamento",
            subcategoria: "antipulgas",
            presentaciones: [{ peso: "10 a 25 kg", precio: 85000 }],
          },
        ],
      },
    ])
  );

  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";
  process.env.CATALOG_FALLBACK_FILE = archivo;
  process.env.CATALOG_FALLBACK_LOCAL = "true";
  process.env.SUPABASE_REQUEST_RETRIES = "0";
  delete process.env.CATALOG_FALLBACK_CLIENTS;
  global.fetch = async () => {
    throw new Error("fetch failed");
  };
  console.warn = (mensaje) => avisos.push(mensaje);

  try {
    const catalogo = await cargarCatalogoCliente({ id: "client-1", slug: "distrifinca" });

    assert.equal(catalogo[0].marca, "NexGard");
    assert.equal(catalogo[0].referencias[0].presentaciones[0].precio, 85000);
    assert.match(avisos[0], /Usando catálogo local de respaldo|Usando catalogo local de respaldo/);
    assert.match(avisos[0], /fetch failed/);
  } finally {
    global.fetch = fetchAnterior;
    console.warn = warnAnterior;
    fs.rmSync(archivo, { force: true });
    restaurarEnvCatalogo(envAnterior);
  }
});

test("no usa catalogo local de Distrifinca para otros clientes", async () => {
  const envAnterior = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    CATALOG_FALLBACK_FILE: process.env.CATALOG_FALLBACK_FILE,
    CATALOG_FALLBACK_LOCAL: process.env.CATALOG_FALLBACK_LOCAL,
    SUPABASE_REQUEST_RETRIES: process.env.SUPABASE_REQUEST_RETRIES,
  };
  const fetchAnterior = global.fetch;
  const archivo = path.join(os.tmpdir(), `catalogo-fallback-otro-${Date.now()}.json`);

  fs.writeFileSync(archivo, JSON.stringify([{ marca: "NexGard", referencias: [] }]));

  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";
  process.env.CATALOG_FALLBACK_FILE = archivo;
  process.env.CATALOG_FALLBACK_LOCAL = "true";
  process.env.SUPABASE_REQUEST_RETRIES = "0";
  global.fetch = async () => {
    throw new Error("fetch failed");
  };

  try {
    await assert.rejects(cargarCatalogoCliente({ id: "client-2", slug: "otro-cliente" }), /fetch failed/);
  } finally {
    global.fetch = fetchAnterior;
    fs.rmSync(archivo, { force: true });
    restaurarEnvCatalogo(envAnterior);
  }
});

test("no usa catalogo local cuando Supabase responde error de permisos o configuracion", async () => {
  const envAnterior = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    CATALOG_FALLBACK_FILE: process.env.CATALOG_FALLBACK_FILE,
    CATALOG_FALLBACK_LOCAL: process.env.CATALOG_FALLBACK_LOCAL,
    SUPABASE_REQUEST_RETRIES: process.env.SUPABASE_REQUEST_RETRIES,
  };
  const fetchAnterior = global.fetch;
  const archivo = path.join(os.tmpdir(), `catalogo-fallback-401-${Date.now()}.json`);

  fs.writeFileSync(archivo, JSON.stringify([{ marca: "NexGard", referencias: [] }]));

  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";
  process.env.CATALOG_FALLBACK_FILE = archivo;
  process.env.CATALOG_FALLBACK_LOCAL = "true";
  process.env.SUPABASE_REQUEST_RETRIES = "0";
  global.fetch = async () =>
    new Response("invalid api key", {
      status: 401,
      headers: { "Content-Type": "text/plain" },
    });

  try {
    await assert.rejects(cargarCatalogoCliente({ id: "client-1", slug: "distrifinca" }), /Supabase 401/);
  } finally {
    global.fetch = fetchAnterior;
    fs.rmSync(archivo, { force: true });
    restaurarEnvCatalogo(envAnterior);
  }
});

test("permite desactivar el catalogo local de respaldo", async () => {
  const envAnterior = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    CATALOG_FALLBACK_LOCAL: process.env.CATALOG_FALLBACK_LOCAL,
    SUPABASE_REQUEST_RETRIES: process.env.SUPABASE_REQUEST_RETRIES,
  };
  const fetchAnterior = global.fetch;

  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";
  process.env.CATALOG_FALLBACK_LOCAL = "false";
  process.env.SUPABASE_REQUEST_RETRIES = "0";
  global.fetch = async () => {
    throw new Error("fetch failed");
  };

  try {
    await assert.rejects(cargarCatalogoCliente({ id: "client-1", slug: "distrifinca" }), /fetch failed/);
  } finally {
    global.fetch = fetchAnterior;
    restaurarEnvCatalogo(envAnterior);
  }
});
