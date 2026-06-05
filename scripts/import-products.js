#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { requestSupabase, supabaseConfigurado } = require("../src/repositories/supabaseClient");

const CLIENTS_TABLE = process.env.SUPABASE_CLIENTS_TABLE || "aivance_clients";
const BRANDS_TABLE = process.env.SUPABASE_CATALOG_BRANDS_TABLE || "catalog_brands";
const REFERENCES_TABLE = process.env.SUPABASE_CATALOG_REFERENCES_TABLE || "catalog_references";
const PRESENTATIONS_TABLE = process.env.SUPABASE_CATALOG_PRESENTATIONS_TABLE || "catalog_presentations";

function argumento(nombre, valorPorDefecto = null) {
  const indice = process.argv.indexOf(`--${nombre}`);
  if (indice < 0) return valorPorDefecto;
  return process.argv[indice + 1] || valorPorDefecto;
}

function bandera(nombre) {
  const indice = process.argv.indexOf(`--${nombre}`);
  if (indice < 0) return false;

  const siguiente = process.argv[indice + 1];
  return !siguiente || siguiente.startsWith("--") || ["1", "true", "si", "sí", "yes"].includes(normalizarTexto(siguiente));
}

function requerirArgumento(nombre) {
  const valor = argumento(nombre);
  if (!valor) {
    throw new Error(`Falta --${nombre}. Indica explicitamente a que cliente pertenece este catalogo.`);
  }
  return valor;
}

function leerCatalogoJson(ruta) {
  const absoluta = path.resolve(process.cwd(), ruta);
  return JSON.parse(fs.readFileSync(absoluta, "utf8"));
}

function primerDefinido(...valores) {
  return valores.find((valor) => valor !== undefined && valor !== null && valor !== "");
}

function normalizarTexto(valor = "") {
  return valor
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizarCategoria(valor) {
  const texto = normalizarTexto(valor);
  const mapa = {
    alimento: "comida",
    comida: "comida",
    medicamento: "medicamento",
    medicina: "medicamento",
    accesorio: "accesorio",
    accesorios: "accesorio",
    snack: "snack",
    snacks: "snack",
    higiene: "higiene",
    suplemento: "suplemento",
    suplementos: "suplemento",
    juguete: "juguete",
    juguetes: "juguete",
    arena: "arena_sustrato",
    sustrato: "arena_sustrato",
    arena_sustrato: "arena_sustrato",
    otro: "otro",
  };

  return mapa[texto] || (texto || null);
}

function normalizarEspecie(valor) {
  const texto = normalizarTexto(valor);
  const mapa = {
    perro: "perro",
    perros: "perro",
    canino: "perro",
    gato: "gato",
    gatos: "gato",
    felino: "gato",
    ave: "ave",
    aves: "ave",
    pajaro: "ave",
    roedor: "roedor",
    roedores: "roedor",
    pez: "pez",
    peces: "pez",
    equino: "equino",
    caballo: "equino",
    bovino: "bovino",
    bovinos: "bovino",
    otro: "otro",
  };

  return mapa[texto] || (texto || null);
}

function normalizarEtapa(valor) {
  const texto = normalizarTexto(valor);
  const mapa = {
    cachorro: "cachorro",
    cachorros: "cachorro",
    puppy: "cachorro",
    gatito: "cachorro",
    adulto: "adulto",
    adultos: "adulto",
    senior: "senior",
    mayor: "senior",
    mayores: "senior",
    todas: "todas",
    todo: "todas",
    cualquiera: "todas",
  };

  return mapa[texto] || null;
}

function inferirCategoria(referencia = {}) {
  const texto = normalizarTexto(`${referencia.nombre || ""} ${referencia.descripcion || ""}`);
  if (/\b(nexgard|bravecto|desparasit|antipulgas|pulga|garrapata|medicament|medicina)\b/.test(texto)) {
    return "medicamento";
  }
  if (/\b(snack|galleta|premio|treat)\b/.test(texto)) return "snack";
  if (/\b(champu|shampoo|higiene|limpieza)\b/.test(texto)) return "higiene";
  if (/\b(collar|cama|arnes|correa|plato|comedero|accesorio)\b/.test(texto)) return "accesorio";
  if (/\b(juguete|pelota|mordedor)\b/.test(texto)) return "juguete";
  if (/\b(arena|sustrato)\b/.test(texto)) return "arena_sustrato";
  if (/\b(vitamina|suplemento)\b/.test(texto)) return "suplemento";
  if (/\b(alimento|concentrado|comida|adulto|cachorro|gatito|perro|gato)\b/.test(texto)) return "comida";
  return null;
}

function inferirSubcategoria(referencia = {}, categoria = null) {
  const texto = normalizarTexto(`${referencia.nombre || ""} ${referencia.descripcion || ""}`);
  if (/\b(antipulgas|pulga|garrapata|nexgard|bravecto)\b/.test(texto)) return "antipulgas";
  if (/\b(desparasit)\b/.test(texto)) return "desparasitante";
  if (/\b(humeda|humedo|lata|sobre)\b/.test(texto)) return "comida_humeda";
  if (categoria === "comida") return "concentrado";
  if (/\b(collar)\b/.test(texto)) return "collar";
  if (/\b(cama)\b/.test(texto)) return "cama";
  if (/\b(champu|shampoo)\b/.test(texto)) return "champu";
  if (/\b(vitamina)\b/.test(texto)) return "vitaminas";
  return null;
}

function inferirEtapa(referencia = {}) {
  const texto = normalizarTexto(`${referencia.nombre || ""} ${referencia.descripcion || ""}`);
  if (/\b(cachorro|cachorros|puppy|gatito|gatita)\b/.test(texto)) return "cachorro";
  if (/\b(senior|mayor|mayores)\b/.test(texto)) return "senior";
  if (/\b(adulto|adultos)\b/.test(texto)) return "adulto";
  if (/\b(todas|todos|cualquier)\b/.test(texto)) return "todas";
  return null;
}

function normalizarBooleano(valor) {
  if (typeof valor === "boolean") return valor;
  if (valor === undefined || valor === null || valor === "") return undefined;
  const texto = normalizarTexto(valor);
  if (["true", "si", "sí", "1", "yes"].includes(texto)) return true;
  if (["false", "no", "0"].includes(texto)) return false;
  return undefined;
}

function metadataConFuente(metadata, archivo) {
  return {
    ...(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}),
    source: path.basename(archivo),
  };
}

function normalizarPresentacion(item = {}, archivo) {
  const peso = primerDefinido(item.peso, item.presentacion, item.weight);
  const precio = primerDefinido(item.precio, item.price);
  if (!peso || precio === undefined || precio === null) return null;

  return {
    peso,
    precio: Number(precio),
    stock: normalizarBooleano(primerDefinido(item.stock, item.disponible)),
    metadata: metadataConFuente(item.metadata, archivo),
  };
}

function normalizarReferencia(item = {}, archivo) {
  const nombre = primerDefinido(item.nombre, item.referencia, item.name);
  if (!nombre) return null;

  const categoria = normalizarCategoria(primerDefinido(item.categoria, item.category)) || inferirCategoria({
    nombre,
    descripcion: item.descripcion,
  });
  const subcategoria =
    normalizarTexto(primerDefinido(item.subcategoria, item.subcategory) || "") ||
    inferirSubcategoria({ nombre, descripcion: item.descripcion }, categoria);
  const etapa = normalizarEtapa(primerDefinido(item.etapa, item.life_stage, item.stage)) || inferirEtapa({
    nombre,
    descripcion: item.descripcion,
  });
  const requiereConfirmacion = normalizarBooleano(
    primerDefinido(item.requiere_confirmacion, item.requires_confirmation, item.requiereConfirmacion)
  );
  const presentaciones = Array.isArray(item.presentaciones)
    ? item.presentaciones.map((presentacion) => normalizarPresentacion(presentacion, archivo)).filter(Boolean)
    : [normalizarPresentacion(item, archivo)].filter(Boolean);

  return {
    nombre,
    especie: normalizarEspecie(primerDefinido(item.especie, item.species)) || "perro",
    categoria,
    subcategoria,
    etapa,
    requiereConfirmacion,
    descripcion: primerDefinido(item.descripcion, item.description),
    imagen: primerDefinido(item.imagen, item.image_url, item.imageUrl),
    metadata: metadataConFuente(item.metadata, archivo),
    presentaciones,
  };
}

function normalizarCatalogo(catalogo = [], archivo) {
  const marcas = new Map();

  catalogo.forEach((item) => {
    const nombreMarca = primerDefinido(item.marca, item.brand, item.brand_name);
    if (!nombreMarca) return;

    const marca = marcas.get(nombreMarca) || {
      marca: nombreMarca,
      metadata: metadataConFuente(item.metadata_marca || item.brand_metadata, archivo),
      referencias: new Map(),
    };

    const referencias = Array.isArray(item.referencias)
      ? item.referencias
      : [item];

    referencias.forEach((referenciaItem) => {
      const referencia = normalizarReferencia(referenciaItem, archivo);
      if (!referencia) return;

      const existente = marca.referencias.get(referencia.nombre);
      if (existente) {
        existente.presentaciones.push(...referencia.presentaciones);
        Object.assign(existente, Object.fromEntries(Object.entries(referencia).filter(([, valor]) => valor !== undefined)));
      } else {
        marca.referencias.set(referencia.nombre, referencia);
      }
    });

    marcas.set(nombreMarca, marca);
  });

  return Array.from(marcas.values()).map((marca) => ({
    marca: marca.marca,
    metadata: marca.metadata,
    referencias: Array.from(marca.referencias.values()).map((referencia) => ({
      ...referencia,
      presentaciones: Array.from(
        new Map(referencia.presentaciones.map((presentacion) => [presentacion.peso, presentacion])).values()
      ),
    })),
  }));
}

function sinValoresVacios(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, valor]) => valor !== undefined && valor !== null)
  );
}

function filtroIn(ids = []) {
  return `in.(${ids.join(",")})`;
}

async function upsert(tabla, payload, onConflict) {
  const filas = await requestSupabase(`${tabla}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });

  return filas && filas.length ? filas[0] : null;
}

async function obtenerCliente(slug, nombre, vertical = "petshop") {
  const cliente = await upsert(
    CLIENTS_TABLE,
    {
      slug,
      name: nombre,
      vertical,
      owner_platform: "AIVANCE",
      status: "active",
    },
    "slug"
  );

  if (!cliente?.id) throw new Error(`No se pudo registrar el cliente ${slug}`);
  return cliente;
}

async function desactivarCatalogoCliente(clientId) {
  const marcas = (await requestSupabase(`${BRANDS_TABLE}?client_id=eq.${clientId}&select=id`)) || [];
  const brandIds = marcas.map((marca) => marca.id);
  if (!brandIds.length) return;

  const referencias =
    (await requestSupabase(`${REFERENCES_TABLE}?brand_id=${filtroIn(brandIds)}&select=id`)) || [];
  const referenceIds = referencias.map((referencia) => referencia.id);

  if (referenceIds.length) {
    await requestSupabase(`${PRESENTATIONS_TABLE}?reference_id=${filtroIn(referenceIds)}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
  }

  await requestSupabase(`${REFERENCES_TABLE}?brand_id=${filtroIn(brandIds)}`, {
    method: "PATCH",
    body: JSON.stringify({ active: false }),
  });
  await requestSupabase(`${BRANDS_TABLE}?client_id=eq.${clientId}`, {
    method: "PATCH",
    body: JSON.stringify({ active: false }),
  });
}

async function importarCatalogo({ archivo, clientSlug, clientName, vertical = "petshop", replace = false }) {
  if (!supabaseConfigurado()) {
    throw new Error("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY o SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!archivo) throw new Error("Falta archivo de catalogo para importar");
  if (!clientSlug) throw new Error("Falta clientSlug para aislar el catalogo por cliente");
  if (!clientName) throw new Error("Falta clientName para crear o actualizar el cliente");

  const catalogo = normalizarCatalogo(leerCatalogoJson(archivo), archivo);
  const cliente = await obtenerCliente(clientSlug, clientName, vertical);
  if (replace) {
    await desactivarCatalogoCliente(cliente.id);
  }
  let totalReferencias = 0;
  let totalPresentaciones = 0;

  for (const [marcaIndex, marca] of catalogo.entries()) {
    const marcaFila = await upsert(
      BRANDS_TABLE,
      {
        client_id: cliente.id,
        name: marca.marca,
        active: true,
        sort_order: marcaIndex,
        metadata: metadataConFuente(marca.metadata, archivo),
      },
      "client_id,name"
    );

    for (const [referenciaIndex, referencia] of (marca.referencias || []).entries()) {
      const referenciaFila = await upsert(
        REFERENCES_TABLE,
        sinValoresVacios({
          brand_id: marcaFila.id,
          name: referencia.nombre,
          species: referencia.especie || "perro",
          category: referencia.categoria,
          subcategory: referencia.subcategoria,
          life_stage: referencia.etapa,
          requires_confirmation: referencia.requiereConfirmacion,
          description: referencia.descripcion || null,
          image_url: referencia.imagen || null,
          active: true,
          sort_order: referenciaIndex,
          metadata: metadataConFuente(referencia.metadata, archivo),
        }),
        "brand_id,name"
      );
      totalReferencias += 1;

      for (const [presentacionIndex, presentacion] of (referencia.presentaciones || []).entries()) {
        await upsert(
          PRESENTATIONS_TABLE,
          sinValoresVacios({
            reference_id: referenciaFila.id,
            weight: presentacion.peso,
            price: Number(presentacion.precio),
            currency: "COP",
            stock: presentacion.stock,
            active: true,
            sort_order: presentacionIndex,
            metadata: metadataConFuente(presentacion.metadata, archivo),
          }),
          "reference_id,weight"
        );
        totalPresentaciones += 1;
      }
    }
  }

  return {
    cliente: cliente.slug,
    marcas: catalogo.length,
    referencias: totalReferencias,
    presentaciones: totalPresentaciones,
  };
}

if (require.main === module) {
  Promise.resolve({
    archivo: requerirArgumento("file"),
    clientSlug: requerirArgumento("client"),
    clientName: requerirArgumento("client-name"),
    vertical: argumento("vertical", "petshop"),
    replace: bandera("replace"),
  })
    .then(importarCatalogo)
    .then((resultado) => {
      console.log(
        `Catálogo importado | cliente=${resultado.cliente} | marcas=${resultado.marcas} | referencias=${resultado.referencias} | presentaciones=${resultado.presentaciones}`
      );
    })
    .catch((error) => {
      console.error(`Error importando catálogo: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  desactivarCatalogoCliente,
  importarCatalogo,
  normalizarCatalogo,
};
