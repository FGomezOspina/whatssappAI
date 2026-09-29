#!/usr/bin/env node
// Revision por defecto; --apply guarda solo especie y el peso confirmado.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { requestSupabase, supabaseConfigurado } = require('../src/repositories/supabaseClient');
const { especiePorNombre, pesoCorregido } = require('../src/utils/catalogCorrections');

async function corregir({ apply = false } = {}) {
  if (!supabaseConfigurado()) throw new Error('Supabase no configurado');
  const clientes = await requestSupabase(`${process.env.SUPABASE_CLIENTS_TABLE || 'aivance_clients'}?slug=eq.distrifinca&select=id`);
  if (clientes?.length !== 1) throw new Error('Cliente distrifinca inexistente o ambiguo');
  const brands = process.env.SUPABASE_CATALOG_BRANDS_TABLE || 'catalog_brands';
  const refs = process.env.SUPABASE_CATALOG_REFERENCES_TABLE || 'catalog_references';
  const pres = process.env.SUPABASE_CATALOG_PRESENTATIONS_TABLE || 'catalog_presentations';
  const filas = [];
  for (let offset = 0;; offset += 500) {
    const pagina = await requestSupabase(`${refs}?select=*,${brands}!inner(client_id),${pres}(*)&${brands}.client_id=eq.${clientes[0].id}&order=id&limit=500&offset=${offset}`);
    filas.push(...pagina);
    if (pagina.length < 500) break;
  }
  const cambios = [];
  for (const r of filas) {
    const especie = especiePorNombre(r.name);
    if (especie && especie !== r.species) cambios.push({ tabla: refs, anterior: r, patch: { species: especie } });
    for (const p of r[pres] || []) {
      const peso = pesoCorregido(r.name, p.weight);
      if (peso === p.weight) continue;
      if (r[pres].some(otro => otro.id !== p.id && otro.weight === peso)) throw new Error(`Peso destino duplicado: ${r.name}`);
      cambios.push({ tabla: pres, nombre: r.name, anterior: p, patch: { weight: peso } });
    }
  }
  const archivo = path.resolve(__dirname, '../productos.json');
  const original = fs.readFileSync(archivo, 'utf8');
  const local = JSON.parse(original);
  let especiesLocales = 0, pesosLocales = 0;
  for (const marca of local) for (const r of marca.referencias || []) {
    const especie = especiePorNombre(r.nombre);
    if (especie && especie !== r.especie) { r.especie = especie; especiesLocales++; }
    for (const p of r.presentaciones || []) {
      const peso = pesoCorregido(r.nombre, p.peso);
      if (peso !== p.peso) { p.peso = peso; pesosLocales++; }
    }
  }
  const reporte = { aplicado: apply, referenciasRevisadas: filas.length, especiesLocales, pesosLocales,
    cambios: cambios.map(c => ({ tabla: c.tabla, id: c.anterior.id, nombre: c.nombre || c.anterior.name,
      antes: Object.fromEntries(Object.keys(c.patch).map(k => [k, c.anterior[k]])), despues: c.patch })) };
  if (apply) {
    const backup = `/tmp/catalog-corrections-${Date.now()}.json`;
    fs.writeFileSync(backup, JSON.stringify({ originalLocal: original, cambios }, null, 2), { mode: 0o600 });
    reporte.backup = backup;
    console.log(`Respaldo: ${backup}`);
    for (const c of cambios) {
      const filtro = `id=eq.${c.anterior.id}&updated_at=eq.${encodeURIComponent(c.anterior.updated_at)}`;
      const guardadas = await requestSupabase(`${c.tabla}?${filtro}`, { method: 'PATCH',
        headers: { Prefer: 'return=representation' }, body: JSON.stringify(c.patch) });
      if (guardadas?.length !== 1) throw new Error(`Actualizacion concurrente: ${c.anterior.id}. Revisar respaldo ${backup}`);
      const [verificada] = await requestSupabase(`${c.tabla}?id=eq.${c.anterior.id}`);
      if (!verificada || Object.entries(c.patch).some(([k,v]) => verificada[k] !== v)) throw new Error(`Verificacion fallida: ${c.anterior.id}`);
    }
    if (fs.readFileSync(archivo, 'utf8') !== original) throw new Error('El catalogo local cambio durante la actualizacion');
    if (especiesLocales || pesosLocales) fs.writeFileSync(archivo, JSON.stringify(local, null, 2) + '\n');
  }
  return reporte;
}
if (require.main === module) corregir({ apply: process.argv.includes('--apply') })
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { corregir };
