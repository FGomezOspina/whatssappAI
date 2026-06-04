const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { importarCatalogo, normalizarCatalogo } = require("../scripts/import-products");

function restaurarEnv(env) {
  if (env.url === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = env.url;

  if (env.secret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = env.secret;
}

test("normaliza productos planos y anidados con campos petshop", () => {
  const catalogo = normalizarCatalogo(
    [
      {
        marca: "Boehringer",
        referencia: "NexGard",
        presentacion: "10 a 25 kg",
        precio: 85000,
        stock: true,
        categoria: "medicamento",
        subcategoria: "antipulgas",
        especie: "perro",
        etapa: "todas",
        requiere_confirmacion: true,
        metadata: { observaciones: "Confirmar peso" },
      },
      {
        marca: "Chunky",
        referencias: [
          {
            nombre: "Adulto Todas las Razas",
            especie: "perro",
            descripcion: "Alimento completo para perros adultos",
            presentaciones: [{ peso: "2kg", precio: 32000 }],
          },
        ],
      },
    ],
    "catalogo-test.json"
  );

  const medicamento = catalogo[0].referencias[0];
  assert.equal(medicamento.categoria, "medicamento");
  assert.equal(medicamento.subcategoria, "antipulgas");
  assert.equal(medicamento.requiereConfirmacion, true);
  assert.equal(medicamento.presentaciones[0].stock, true);

  const comida = catalogo[1].referencias[0];
  assert.equal(comida.categoria, "comida");
  assert.equal(comida.subcategoria, "concentrado");
  assert.equal(comida.etapa, "adulto");
});

test("rechaza importar catalogo sin cliente explicito", async () => {
  const envAnterior = {
    url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
  };

  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";

  try {
    await assert.rejects(
      importarCatalogo({
        archivo: "productos.json",
        clientSlug: "",
        clientName: "",
        vertical: "petshop",
      }),
      /Falta clientSlug/
    );
  } finally {
    restaurarEnv(envAnterior);
  }
});

test("importa y actualiza por cliente marca referencia presentacion sin duplicar", async () => {
  const envAnterior = {
    url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
  };
  const fetchAnterior = global.fetch;
  const solicitudes = [];
  const archivo = path.join(os.tmpdir(), `catalogo-petshop-${Date.now()}.json`);

  fs.writeFileSync(
    archivo,
    JSON.stringify([
      {
        marca: "Boehringer",
        referencia: "NexGard",
        presentacion: "10 a 25 kg",
        precio: 85000,
        stock: true,
        categoria: "medicamento",
        subcategoria: "antipulgas",
        especie: "perro",
        etapa: "todas",
        requiere_confirmacion: true,
        metadata: { observaciones: "Confirmar peso del perro antes de vender" },
      },
      {
        marca: "Kong",
        referencia: "Classic",
        presentacion: "M",
        precio: 45000,
        categoria: "accesorio",
        subcategoria: "juguete",
        especie: "perro",
        etapa: "todas",
      },
    ])
  );

  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";
  global.fetch = async (url, opciones = {}) => {
    const body = opciones.body ? JSON.parse(opciones.body) : null;
    solicitudes.push({ url, body });

    if (url.includes("/aivance_clients")) {
      return new Response(JSON.stringify([{ id: "client-1", slug: body.slug }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/catalog_brands")) {
      return new Response(JSON.stringify([{ id: `brand-${body.name}`, name: body.name }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/catalog_references")) {
      return new Response(JSON.stringify([{ id: `reference-${body.name}`, name: body.name }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/catalog_presentations")) {
      return new Response(JSON.stringify([{ id: `presentation-${body.weight}`, weight: body.weight }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const resultado = await importarCatalogo({
      archivo,
      clientSlug: "distrifinca",
      clientName: "Distrifinca",
      vertical: "petshop",
    });

    assert.equal(resultado.referencias, 2);
    assert.equal(resultado.presentaciones, 2);

    const marcaBoehringer = solicitudes.find((solicitud) => solicitud.body?.name === "Boehringer").body;
    assert.equal(marcaBoehringer.client_id, "client-1");

    const nexgard = solicitudes.find((solicitud) => solicitud.body?.name === "NexGard").body;
    assert.equal(nexgard.category, "medicamento");
    assert.equal(nexgard.subcategory, "antipulgas");
    assert.equal(nexgard.species, "perro");
    assert.equal(nexgard.life_stage, "todas");
    assert.equal(nexgard.requires_confirmation, true);
    assert.equal(nexgard.metadata.observaciones, "Confirmar peso del perro antes de vender");

    const presentacion = solicitudes.find((solicitud) => solicitud.body?.weight === "10 a 25 kg").body;
    assert.equal(presentacion.stock, true);
    assert.match(
      solicitudes.find((solicitud) => solicitud.body?.weight === "10 a 25 kg").url,
      /on_conflict=reference_id,weight/
    );
    assert.match(
      solicitudes.find((solicitud) => solicitud.body?.name === "NexGard").url,
      /on_conflict=brand_id,name/
    );
  } finally {
    global.fetch = fetchAnterior;
    fs.rmSync(archivo, { force: true });
    restaurarEnv(envAnterior);
  }
});
