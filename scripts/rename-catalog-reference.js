#!/usr/bin/env node
// Uso: node scripts/rename-catalog-reference.js config.json [--apply]
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const { requestSupabase } = require('../src/repositories/supabaseClient');
async function renombrar(config, apply = false) {
  const { client, brand, from, to } = config;
  if (![client, brand, from, to].every(v => typeof v === 'string' && v.trim())) throw new Error('Configuracion incompleta');
  const clientes = await requestSupabase(`aivance_clients?slug=eq.${encodeURIComponent(client)}&select=id`);
  if (clientes?.length !== 1) throw new Error('Cliente inexistente o ambiguo');
  const marcas = await requestSupabase(`catalog_brands?client_id=eq.${clientes[0].id}&name=eq.${encodeURIComponent(brand)}&select=id`);
  if (marcas?.length !== 1) throw new Error('Marca inexistente o ambigua');
  const referencias = await requestSupabase(`catalog_references?brand_id=eq.${marcas[0].id}&select=*`);
  const origen = referencias.filter(r => r.name === from);
  const destino = referencias.filter(r => r.name === to);
  if (!origen.length && destino.length === 1) return { actualizado: true, sinCambios: true, referencia: destino[0].name };
  if (origen.length !== 1 || destino.length) throw new Error('Origen ambiguo o destino ya existente');
  const anterior = origen[0];
  const patch = { name: to, ...(anterior.description === from ? { description: to } : {}) };
  if (apply) {
    const backup = `/tmp/catalog-rename-${Date.now()}.json`;
    fs.writeFileSync(backup, JSON.stringify({ config, anterior, patch }, null, 2), { mode: 0o600 });
    console.log(`Respaldo: ${backup}`);
    const filas = await requestSupabase(`catalog_references?id=eq.${anterior.id}&brand_id=eq.${marcas[0].id}&updated_at=eq.${encodeURIComponent(anterior.updated_at)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    if (filas?.length !== 1) throw new Error('La referencia cambio durante la revision');
    const [final] = await requestSupabase(`catalog_references?id=eq.${anterior.id}&select=name,description`);
    if (Object.entries(patch).some(([k,v]) => final?.[k] !== v)) throw new Error('Verificacion fallida');
  }
  return { aplicado: apply, id: anterior.id, antes: from, despues: patch };
}
if (require.main === module) renombrar(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), process.argv.includes('--apply'))
  .then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { renombrar };
