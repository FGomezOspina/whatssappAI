#!/usr/bin/env node
// Actualizacion acotada de aliases: dry run por defecto, --apply para guardar.
const fs = require('node:fs');
const { requestSupabase } = require('../src/repositories/supabaseClient');
const { normalizar } = require('../src/utils/text');

function construirPatch(referencia, regla) {
  const aliases = [...new Set([...(referencia.metadata?.aliases || []), ...regla.aliases])];
  return { species: regla.species || referencia.species,
    metadata: { ...referencia.metadata, aliases, usage_context: regla.usage_context, alias_context: regla.alias_context } };
}

async function actualizarAliases(config, { apply = false, request = requestSupabase } = {}) {
  if (!config.client || !config.brand || !config.references?.length) throw new Error('Configuracion incompleta');
  const clientes = await request(`${process.env.SUPABASE_CLIENTS_TABLE || 'aivance_clients'}?slug=eq.${encodeURIComponent(config.client)}&select=id,slug`);
  if (clientes?.length !== 1) throw new Error('El cliente debe existir y ser unico');
  const marcas = await request(`${process.env.SUPABASE_CATALOG_BRANDS_TABLE || 'catalog_brands'}?client_id=eq.${clientes[0].id}&name=eq.${encodeURIComponent(config.brand)}&active=eq.true&select=id,name`);
  if (marcas?.length !== 1) throw new Error('La marca debe existir y ser unica dentro del cliente');
  const tabla = process.env.SUPABASE_CATALOG_REFERENCES_TABLE || 'catalog_references';
  const filas = await request(`${tabla}?brand_id=eq.${marcas[0].id}&active=eq.true&select=id,name,species,metadata,updated_at`);
  // Validar todos los destinos antes de modificar cualquiera.
  const cambios = config.references.map(regla => {
    const coincidencias = filas.filter(fila => normalizar(fila.name) === normalizar(regla.name));
    if (coincidencias.length !== 1) throw new Error(`Referencia inexistente o ambigua: ${regla.name}`);
    if (!Array.isArray(regla.aliases) || regla.aliases.some(a => typeof a !== 'string' || !a.trim())) throw new Error('Aliases invalidos');
    const anterior = coincidencias[0];
    return { anterior, patch: construirPatch(anterior, regla) };
  });
  if (apply) {
    const backup = `/tmp/catalog-aliases-before-${Date.now()}.json`;
    fs.writeFileSync(backup, JSON.stringify({ client: config.client, brand: config.brand, cambios }, null, 2));
    console.log(`Respaldo previo: ${backup}`);
    for (const { anterior, patch } of cambios) {
      const condicion = anterior.updated_at ? `&updated_at=eq.${encodeURIComponent(anterior.updated_at)}` : '';
      const guardadas = await request(`${tabla}?id=eq.${anterior.id}&brand_id=eq.${marcas[0].id}${condicion}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch),
      });
      if (guardadas?.length !== 1) throw new Error(`No se actualizo ${anterior.name}: pudo cambiar durante la revision`);
    }
  }
  return cambios.map(({ anterior, patch }) => ({ referencia: anterior.name, ...patch, aplicado: apply }));
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  const ruta = process.argv[2];
  if (!ruta || ruta.startsWith('--')) throw new Error('Uso: node scripts/update-catalog-aliases.js archivo.json [--apply]');
  actualizarAliases(JSON.parse(fs.readFileSync(ruta, 'utf8')), { apply: process.argv.includes('--apply') })
    .then(resultados => console.log(JSON.stringify(resultados, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { construirPatch, actualizarAliases };
