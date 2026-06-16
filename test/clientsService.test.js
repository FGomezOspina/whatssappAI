const test = require("node:test");
const assert = require("node:assert/strict");

const { limpiarCacheClientes, obtenerClienteActual } = require("../src/services/clients.service");

test("resuelve el cliente activo desde el phoneNumberId de Kapso", async () => {
  const urlAnterior = process.env.SUPABASE_URL;
  const secretAnterior = process.env.SUPABASE_SECRET_KEY;
  const nodeEnvAnterior = process.env.NODE_ENV;
  const fetchAnterior = global.fetch;
  const solicitudes = [];

  limpiarCacheClientes();

  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";
  process.env.NODE_ENV = "production";
  global.fetch = async (url, opciones) => {
    solicitudes.push({ url, opciones });

    if (url.includes("/client_channels")) {
      return new Response(JSON.stringify([{ client_id: "client-1" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/aivance_clients")) {
      return new Response(
        JSON.stringify([{ id: "client-1", slug: "distrifinca", name: "Distrifinca", vertical: "petshop" }]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (url.includes("/client_prompts")) {
      return new Response(JSON.stringify([{ prompt_key: "humanizer", content: "Tono breve.", priority: 10 }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify([{ rule_type: "delivery_fee", name: "default", value: { amount: 5000 } }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const cliente = await obtenerClienteActual({ phoneNumberId: "kapso-phone-id" });

    assert.equal(cliente.id, "client-1");
    assert.equal(cliente.slug, "distrifinca");
    assert.equal(cliente.vertical, "petshop");
    assert.equal(cliente.businessType, "petshop");
    assert.equal(cliente.tipo_negocio, "petshop");
    assert.equal(cliente.config.prompts.humanizer, "Tono breve.");
    assert.equal(cliente.channel.phoneNumberId, "kapso-phone-id");
    assert.equal(cliente.prompts.humanizer, "Tono breve.");
    assert.deepEqual(cliente.deliveryRules[0].value, { amount: 5000 });
    assert.match(solicitudes[0].url, /phone_number_id=eq\.kapso-phone-id/);
  } finally {
    limpiarCacheClientes();
    global.fetch = fetchAnterior;

    if (urlAnterior === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = urlAnterior;

    if (secretAnterior === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = secretAnterior;

    if (nodeEnvAnterior === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnvAnterior;
  }
});

test("puede resolver un cliente por integrationId cuando Kapso no entrega phoneNumberId", async () => {
  const urlAnterior = process.env.SUPABASE_URL;
  const secretAnterior = process.env.SUPABASE_SECRET_KEY;
  const nodeEnvAnterior = process.env.NODE_ENV;
  const fetchAnterior = global.fetch;
  const solicitudes = [];

  limpiarCacheClientes();
  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";
  process.env.NODE_ENV = "production";
  global.fetch = async (url) => {
    solicitudes.push(url);

    if (url.includes("/client_channels")) {
      return new Response(JSON.stringify([{ client_id: "client-2", settings: { inbox: "kapso" } }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/aivance_clients")) {
      return new Response(
        JSON.stringify([{ id: "client-2", slug: "cliente-demo", name: "Cliente Demo", vertical: "petshop" }]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const cliente = await obtenerClienteActual({ integrationId: "kapso-integration-id" });

    assert.equal(cliente.id, "client-2");
    assert.equal(cliente.channel.integrationId, "kapso-integration-id");
    assert.equal(cliente.channel.resolution, "integration_id");
    assert.ok(solicitudes[0].includes("integration_id=eq.kapso-integration-id"));
  } finally {
    limpiarCacheClientes();
    global.fetch = fetchAnterior;

    if (urlAnterior === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = urlAnterior;

    if (secretAnterior === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = secretAnterior;

    if (nodeEnvAnterior === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnvAnterior;
  }
});

test("rechaza canales no registrados sin usar CLIENT_SLUG", async () => {
  const urlAnterior = process.env.SUPABASE_URL;
  const secretAnterior = process.env.SUPABASE_SECRET_KEY;
  const nodeEnvAnterior = process.env.NODE_ENV;
  const fetchAnterior = global.fetch;

  limpiarCacheClientes();
  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";
  process.env.NODE_ENV = "production";
  global.fetch = async () =>
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    await assert.rejects(
      obtenerClienteActual({ phoneNumberId: "phone-no-registrado" }),
      /No hay cliente activo asociado al canal/
    );
  } finally {
    limpiarCacheClientes();
    global.fetch = fetchAnterior;

    if (urlAnterior === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = urlAnterior;

    if (secretAnterior === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = secretAnterior;

    if (nodeEnvAnterior === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnvAnterior;
  }
});

test("resuelve el sandbox Kapso por slug explicito fuera de produccion", async () => {
  const envAnterior = {
    url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
    nodeEnv: process.env.NODE_ENV,
    sandboxSlug: process.env.KAPSO_SANDBOX_CLIENT_SLUG,
    phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID,
  };
  const fetchAnterior = global.fetch;
  const solicitudes = [];

  limpiarCacheClientes();
  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SECRET_KEY = "supabase-test-secret";
  process.env.NODE_ENV = "development";
  process.env.KAPSO_PHONE_NUMBER_ID = "sandbox-phone-id";
  process.env.KAPSO_SANDBOX_CLIENT_SLUG = "distrifinca";

  global.fetch = async (url) => {
    solicitudes.push(url);

    if (url.includes("/client_channels")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/aivance_clients")) {
      return new Response(
        JSON.stringify([{ id: "client-1", slug: "distrifinca", name: "Distrifinca", vertical: "petshop" }]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const cliente = await obtenerClienteActual({ phoneNumberId: "sandbox-phone-id" });

    assert.equal(cliente.slug, "distrifinca");
    assert.equal(cliente.resolution, "sandbox");
    assert.ok(solicitudes.some((url) => url.includes("slug=eq.distrifinca")));
  } finally {
    limpiarCacheClientes();
    global.fetch = fetchAnterior;

    if (envAnterior.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = envAnterior.url;

    if (envAnterior.secret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = envAnterior.secret;

    if (envAnterior.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = envAnterior.nodeEnv;

    if (envAnterior.sandboxSlug === undefined) delete process.env.KAPSO_SANDBOX_CLIENT_SLUG;
    else process.env.KAPSO_SANDBOX_CLIENT_SLUG = envAnterior.sandboxSlug;

    if (envAnterior.phoneNumberId === undefined) delete process.env.KAPSO_PHONE_NUMBER_ID;
    else process.env.KAPSO_PHONE_NUMBER_ID = envAnterior.phoneNumberId;
  }
});
