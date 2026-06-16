const fs = require("fs");
const path = require("path");
const { esErrorTransitorioSupabase, requestSupabase, supabaseConfigurado } = require("./supabaseClient");
const { obtenerClienteActual } = require("../services/clients.service");
const {
  consolidarCatalogo,
} = require("../services/catalogConsolidationService");

const PRODUCTOS_PATH = path.join(__dirname, "..", "..", "productos.json");
const BRANDS_TABLE = process.env.SUPABASE_CATALOG_BRANDS_TABLE || "catalog_brands";
const REFERENCES_TABLE = process.env.SUPABASE_CATALOG_REFERENCES_TABLE || "catalog_references";
const PRESENTATIONS_TABLE = process.env.SUPABASE_CATALOG_PRESENTATIONS_TABLE || "catalog_presentations";
const CATALOG_SEARCH_RPC = process.env.SUPABASE_CATALOG_SEARCH_RPC || "search_catalog_products";
const DEFAULT_CATALOG_QUERY_BATCH_SIZE = 50;

function rutaCatalogoLocal() {
  return process.env.CATALOG_FALLBACK_FILE || PRODUCTOS_PATH;
}

function fallbackCatalogoLocalHabilitado() {
  return process.env.CATALOG_FALLBACK_LOCAL === "true";
}

function clientesConFallbackLocal() {
  return (process.env.CATALOG_FALLBACK_CLIENTS || "")
    .split(",")
    .map((valor) => valor.trim().toLowerCase())
    .filter(Boolean);
}

function clientePermiteFallbackLocal(cliente = null) {
  if (!cliente) return false;

  const permitidos = clientesConFallbackLocal();
  return [cliente.slug, cliente.id].filter(Boolean).some((valor) => permitidos.includes(valor.toLowerCase()));
}

function cargarProductosDesdeJson(ruta = PRODUCTOS_PATH) {
  return consolidarCatalogo(JSON.parse(fs.readFileSync(ruta, "utf8")));
}

function cargarCatalogoLocalComoRespaldo(error, cliente = null) {
  if (!fallbackCatalogoLocalHabilitado()) throw error;
  if (!clientePermiteFallbackLocal(cliente)) throw error;
  if (!esErrorTransitorioSupabase(error)) throw error;

  const ruta = rutaCatalogoLocal();
  const catalogo = cargarProductosDesdeJson(ruta);
  console.warn(
    `[Catalogo] Usando catálogo local de respaldo (${path.basename(ruta)}) para ${
      cliente?.slug || cliente?.id || "cliente-default"
    }: ${error.message}`
  );
  return catalogo;
}

function listaUuidIn(ids = []) {
  return `in.(${ids.join(",")})`;
}

function tamanoLoteCatalogo() {
  const valor = Number(process.env.CATALOG_QUERY_BATCH_SIZE || DEFAULT_CATALOG_QUERY_BATCH_SIZE);
  return Math.max(1, Math.min(valor, 100));
}

function dividirEnLotes(items = [], tamano = tamanoLoteCatalogo()) {
  const lotes = [];
  for (let index = 0; index < items.length; index += tamano) {
    lotes.push(items.slice(index, index + tamano));
  }
  return lotes;
}

async function cargarLotes(ids, construirQuery) {
  const respuestas = await Promise.all(
    dividirEnLotes(ids).map((lote) => requestSupabase(construirQuery(lote)))
  );

  return respuestas.flatMap((filas) => filas || []);
}

function ordenarPorCatalogo(a, b) {
  return (a.sort_order || 0) - (b.sort_order || 0) || (a.name || "").localeCompare(b.name || "");
}

function construirCatalogo({ marcas = [], referencias = [], presentaciones = [] }) {
  const referenciasPorMarca = new Map();
  referencias.sort(ordenarPorCatalogo).forEach((referencia) => {
    const lista = referenciasPorMarca.get(referencia.brand_id) || [];
    lista.push(referencia);
    referenciasPorMarca.set(referencia.brand_id, lista);
  });

  const presentacionesPorReferencia = new Map();
  presentaciones.sort(ordenarPorCatalogo).forEach((presentacion) => {
    const lista = presentacionesPorReferencia.get(presentacion.reference_id) || [];
    lista.push(presentacion);
    presentacionesPorReferencia.set(presentacion.reference_id, lista);
  });

  return consolidarCatalogo(marcas.sort(ordenarPorCatalogo).map((marca) => ({
    marca: marca.name,
    metadata: marca.metadata || {},
    referencias: (referenciasPorMarca.get(marca.id) || []).map((referencia) => ({
      nombre: referencia.name,
      especie: referencia.species || "perro",
      categoria: referencia.category || null,
      subcategoria: referencia.subcategory || null,
      etapa: referencia.life_stage || null,
      requiereConfirmacion: Boolean(referencia.requires_confirmation),
      descripcion: referencia.description || "",
      imagen: referencia.image_url || "",
      metadata: referencia.metadata || {},
      presentaciones: (presentacionesPorReferencia.get(referencia.id) || []).map((presentacion) => ({
        peso: presentacion.weight,
        precio: presentacion.price,
        stock: typeof presentacion.stock === "boolean" ? presentacion.stock : null,
        metadata: presentacion.metadata || {},
      })),
    })),
  })));
}

function construirCatalogoDesdeBusqueda(filas = []) {
  const marcas = new Map();

  filas.forEach((fila) => {
    const nombreMarca = fila.brand_name;
    if (!marcas.has(nombreMarca)) {
      marcas.set(nombreMarca, {
        marca: nombreMarca,
        metadata: { id: fila.brand_id },
        referencias: [],
      });
    }

    const presentaciones = Array.isArray(fila.presentations) ? fila.presentations : [];
    marcas.get(nombreMarca).referencias.push({
      nombre: fila.reference_name,
      especie: fila.species || "perro",
      categoria: fila.category || null,
      subcategoria: fila.subcategory || null,
      etapa: fila.life_stage || null,
      requiereConfirmacion: Boolean(fila.requires_confirmation),
      descripcion: fila.description || "",
      imagen: fila.image_url || "",
      metadata: {
        ...(fila.reference_metadata || {}),
        id: fila.reference_id,
        searchScore: Number(fila.score || 0),
        matchReason: fila.match_reason || null,
      },
      presentaciones: presentaciones.map((presentacion) => ({
        peso: presentacion.peso || presentacion.weight,
        precio: presentacion.precio ?? presentacion.price,
        stock: typeof presentacion.stock === "boolean" ? presentacion.stock : null,
        metadata: presentacion.metadata || {},
      })),
    });
  });

  return consolidarCatalogo(Array.from(marcas.values()));
}

async function buscarProductosCatalogoCliente(cliente = null, opciones = {}) {
  if (!supabaseConfigurado()) {
    throw new Error("Supabase debe estar configurado para buscar productos del catálogo");
  }

  const clienteActual = cliente || (await obtenerClienteActual());
  if (!clienteActual.id) {
    throw new Error(`No existe el cliente activo en Supabase: ${clienteActual.slug}`);
  }

  const query = (opciones.query || "").toString().trim();
  if (!query) {
    return {
      catalogo: [],
      filas: [],
      metadata: {
        estrategia: "supabase_fts",
        referenciasEnviadas: 0,
        totalResultados: 0,
        query,
      },
    };
  }

  const limit = Math.max(1, Math.min(Number(opciones.limit || 20), 100));
  const inicio = Date.now();
  const filas =
    (await requestSupabase(`rpc/${CATALOG_SEARCH_RPC}`, {
      method: "POST",
      body: JSON.stringify({
        p_client_id: clienteActual.id,
        p_query: query,
        p_limit: limit,
      }),
    })) || [];

  return {
    catalogo: construirCatalogoDesdeBusqueda(filas),
    filas,
    metadata: {
      estrategia: "supabase_fts",
      referenciasEnviadas: filas.length,
      totalResultados: filas.length,
      query,
      duracionMs: Date.now() - inicio,
      topScore: filas.length ? Number(filas[0].score || 0) : 0,
      secondScore: filas.length > 1 ? Number(filas[1].score || 0) : 0,
    },
  };
}

async function cargarCatalogoCliente(cliente = null) {
  if (!supabaseConfigurado()) {
    throw new Error("Supabase debe estar configurado para cargar el catálogo multiempresa");
  }

  const clienteActual = cliente || (await obtenerClienteActual());
  if (!clienteActual.id) {
    throw new Error(`No existe el cliente activo en Supabase: ${clienteActual.slug}`);
  }

  try {
    const marcas =
      (await requestSupabase(
        `${BRANDS_TABLE}?client_id=eq.${clienteActual.id}&active=eq.true&select=id,name,metadata,sort_order&order=sort_order.asc,name.asc`
      )) || [];
    const marcaIds = marcas.map((marca) => marca.id);
    if (!marcaIds.length) return [];

    const referencias = await cargarLotes(
      marcaIds,
      (lote) =>
        `${REFERENCES_TABLE}?brand_id=${listaUuidIn(
          lote
        )}&active=eq.true&select=id,brand_id,name,species,category,subcategory,life_stage,requires_confirmation,description,image_url,metadata,sort_order&order=sort_order.asc,name.asc`
    );
    const referenciaIds = referencias.map((referencia) => referencia.id);
    if (!referenciaIds.length) return construirCatalogo({ marcas, referencias, presentaciones: [] });

    const presentaciones = await cargarLotes(
      referenciaIds,
      (lote) =>
        `${PRESENTATIONS_TABLE}?reference_id=${listaUuidIn(
          lote
        )}&active=eq.true&select=reference_id,weight,price,stock,metadata,sort_order&order=sort_order.asc,weight.asc`
    );

    return construirCatalogo({ marcas, referencias, presentaciones });
  } catch (error) {
    return cargarCatalogoLocalComoRespaldo(error, clienteActual);
  }
}

module.exports = {
  buscarProductosCatalogoCliente,
  cargarCatalogoCliente,
  cargarProductos: cargarProductosDesdeJson,
  cargarProductosDesdeJson,
  _internals: {
    construirCatalogoDesdeBusqueda,
  },
};
