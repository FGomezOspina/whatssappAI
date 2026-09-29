#!/usr/bin/env node
// Sin --apply muestra la diferencia; sincroniza solo reglas comerciales de una referencia.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const { isDeepStrictEqual } = require('node:util');
const path = require('node:path');
const { requestSupabase } = require('../src/repositories/supabaseClient');
const { normalizarPeso } = require('../src/utils/text');

async function actualizar({ client, brand, reference, apply = false, request = requestSupabase }) {
  if (!client || !brand || !reference) throw new Error('Uso: cliente marca referencia [--apply]');
  const local = JSON.parse(fs.readFileSync(path.join(__dirname,'../productos.json'),'utf8'));
  const destinos = local.filter(m => m.marca === brand).flatMap(m=>m.referencias).filter(r=>r.nombre === reference);
  if (destinos.length !== 1) throw new Error('Referencia local inexistente o ambigua');
  const origen = destinos[0];
  const one = (rows, label) => { if (rows?.length !== 1) throw new Error(`${label} inexistente o ambiguo`); return rows[0]; };
  const cliente = one(await request(`${process.env.SUPABASE_CLIENTS_TABLE || 'aivance_clients'}?slug=eq.${encodeURIComponent(client)}&select=id`),'Cliente');
  const marca = one(await request(`${process.env.SUPABASE_CATALOG_BRANDS_TABLE || 'catalog_brands'}?client_id=eq.${cliente.id}&name=eq.${encodeURIComponent(brand)}&select=id`),'Marca');
  const refs = process.env.SUPABASE_CATALOG_REFERENCES_TABLE || 'catalog_references';
  const pres = process.env.SUPABASE_CATALOG_PRESENTATIONS_TABLE || 'catalog_presentations';
  const anterior = one(await request(`${refs}?brand_id=eq.${marca.id}&name=eq.${encodeURIComponent(reference)}`),'Referencia');
  const metadata = { ...anterior.metadata };
  for (const key of ['especies','venta_por_unidad','usage_context']) {
    if (origen.metadata?.[key] !== undefined) metadata[key] = origen.metadata[key];
  }
  const cambios = [{ tabla: refs, anterior, patch: { species: origen.especie, category: origen.categoria, subcategory: origen.subcategoria, metadata } }];
  const presentaciones = await request(`${pres}?reference_id=eq.${anterior.id}`);
  for(const p of origen.presentaciones) {
    if (!p.metadata?.precios_por_cantidad) continue;
    const previa=one(presentaciones.filter(x=>normalizarPeso(x.weight)===normalizarPeso(p.peso)),'Presentación');
    cambios.push({tabla:pres,anterior:previa,patch:{price:p.precio,metadata:{...previa.metadata,precios_por_cantidad:p.metadata.precios_por_cantidad}}});
  }
  const pendientes = cambios.filter(c=>Object.entries(c.patch).some(([k,v])=>!isDeepStrictEqual(c.anterior[k],v)));
  if (apply && pendientes.length) {
    const backup=`/tmp/catalog-commercial-before-${Date.now()}.json`;
    fs.writeFileSync(backup,JSON.stringify(pendientes,null,2),{mode:0o600});
    console.log(`Respaldo: ${backup}`);
    for(const c of pendientes) {
      const guardado=await request(`${c.tabla}?id=eq.${c.anterior.id}&updated_at=eq.${encodeURIComponent(c.anterior.updated_at)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(c.patch)});
      one(guardado,'Actualización (posible cambio concurrente)');
      const verificado=one(await request(`${c.tabla}?id=eq.${c.anterior.id}`),'Verificación');
      if(Object.entries(c.patch).some(([k,v])=>!isDeepStrictEqual(verificado[k],v))) throw new Error(`Verificación fallida; respaldo ${backup}`);
    }
  }
  return {aplicado:apply,referencia:reference,cambios:pendientes.map(c=>({tabla:c.tabla,antes:Object.fromEntries(Object.keys(c.patch).map(k=>[k,c.anterior[k]])),despues:c.patch}))};
}
if(require.main===module) actualizar({client:process.argv[2],brand:process.argv[3],reference:process.argv[4],apply:process.argv.includes('--apply')})
  .then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={actualizar};
