#!/usr/bin/env node
// Migración acotada por cliente/marca. Revisión por defecto; --apply escribe y verifica.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { requestSupabase: request } = require('../src/repositories/supabaseClient');
const config = require('../data/catalog-corrections/bravecto.json');

function corregirMarca(marca) {
  const copia = structuredClone(marca);
  for (const variante of config.variants) {
    const ref = copia.referencias.find(r => r.nombre === variante.from || r.nombre === variante.to);
    if (!ref) throw new Error(`Referencia ausente: ${variante.from}`);
    ref.nombre = variante.to;
    ref.descripcion = `${config.brand} ${variante.duration.toUpperCase()}`;
    ref.metadata = { ...ref.metadata, duracion: variante.duration };
    const corta = variante.duration === '37 dias';
    ref.metadata.original_names = (ref.metadata.original_names || []).filter(n => /37\s*DIAS/i.test(n) === corta)
      .map(n => n.replace('2.-4.5KG', '2.5-4.5KG'));
    for (const p of ref.presentaciones) {
      p.metadata = { ...p.metadata, duracion: variante.duration };
      p.metadata.codigos = [p.metadata.codigo];
      if (config.weightCorrections[p.metadata.codigo]) {
        p.peso = config.weightCorrections[p.metadata.codigo];
        p.metadata.nombre_original = `${config.brand} ${p.peso.toUpperCase()} 37DIAS`;
      }
    }
    if (corta) {
      ref.metadata.presentaciones_por_confirmar = config.pendingPrices.filter(p => !ref.presentaciones.some(q => q.metadata.codigo === p.codigo));
      ref.metadata.original_names = [...new Set([...ref.metadata.original_names, ...config.pendingPrices.map(p => p.nombre_original)])];
    }
  }
  return copia;
}

async function ejecutar(apply = false) {
  const archivo = path.resolve(__dirname, '../productos.json');
  const original = fs.readFileSync(archivo, 'utf8');
  const local = JSON.parse(original);
  const indice = local.findIndex(m => m.marca === config.brand);
  if (indice < 0) throw new Error('Marca local ausente');
  const destino = corregirMarca(local[indice]);
  const clientes = await request(`aivance_clients?slug=eq.${config.client}&select=id`);
  if (clientes?.length !== 1) throw new Error('Cliente ambiguo');
  const marcas = await request(`catalog_brands?client_id=eq.${clientes[0].id}&name=eq.${config.brand}&select=*,catalog_references(*,catalog_presentations(*))`);
  if (marcas?.length !== 1) throw new Error('Marca ambigua');
  const marca = marcas[0];
  const cambios = [];
  for (const v of config.variants) {
    const remota = marca.catalog_references.find(r => r.name === v.from || r.name === v.to);
    const ref = destino.referencias.find(r => r.nombre === v.to);
    if (!remota) throw new Error(`Referencia remota ausente: ${v.from}`);
    cambios.push({ tabla: 'catalog_references', anterior: remota,
      patch: { name: ref.nombre, description: ref.descripcion, metadata: ref.metadata } });
    for (const p of ref.presentaciones) {
      const rem = remota.catalog_presentations.find(q => q.metadata?.codigo === p.metadata.codigo);
      if (!rem || rem.price !== p.precio) throw new Error(`Precio remoto/local divergente: ${p.metadata.codigo}`);
      cambios.push({ tabla: 'catalog_presentations', anterior: rem, patch: { weight: p.peso, metadata: p.metadata } });
    }
  }
  if (apply) {
    const backup = `/tmp/catalog-durations-${Date.now()}.json`;
    fs.writeFileSync(backup, JSON.stringify({ original, marca, cambios }, null, 2), { mode: 0o600 });
    console.log(`Respaldo: ${backup}`);
    for (const c of cambios) {
      const guardadas = await request(`${c.tabla}?id=eq.${c.anterior.id}&updated_at=eq.${encodeURIComponent(c.anterior.updated_at)}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(c.patch),
      });
      if (guardadas?.length !== 1) throw new Error(`Cambio concurrente: ${c.anterior.id}; revisar ${backup}`);
      const [verificada] = await request(`${c.tabla}?id=eq.${c.anterior.id}`);
      require('node:assert/strict').deepEqual(
        Object.fromEntries(Object.keys(c.patch).map(k => [k, verificada?.[k]])), c.patch);

    }
    if (fs.readFileSync(archivo, 'utf8') !== original) throw new Error('Cambio local concurrente');
    local[indice] = destino;
    fs.writeFileSync(archivo, JSON.stringify(local, null, 2) + '\n');
  }
  return { aplicado: apply, cambios: cambios.length, referencias: destino.referencias.map(r => ({ nombre: r.nombre,
    duracion: r.metadata.duracion, presentaciones: r.presentaciones.map(p => ({ peso: p.peso, precio: p.precio })),
    preciosPendientes: r.metadata.presentaciones_por_confirmar || [] })) };
}
if (require.main === module) ejecutar(process.argv.includes('--apply')).then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { corregirMarca, ejecutar };
