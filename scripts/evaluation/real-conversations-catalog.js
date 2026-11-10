// Read-only catalog snapshot. Never fetch conversations from the Sandbox as real evidence.
const fs = require('node:fs');
const crypto = require('node:crypto');
require('dotenv').config({ quiet: true });
const { requestSupabase } = require('../../src/repositories/supabaseClient');
const { obtenerClienteActual } = require('../../src/services/clients.service');
const { _internals: { construirCatalogoDesdeBusqueda } } = require('../../src/repositories/productRepository');
const dir = process.argv.find(x => x.startsWith('--output-dir='))?.slice(13) || 'docs/reports/real-conversations-2026-10-29';
if (fs.existsSync(dir+'/catalog.json') || fs.existsSync(dir+'/catalog-evidence.json')) throw Error('Snapshot exists; use a new --output-dir to preserve frozen evidence.');
console.log = () => {};
(async () => {
  const client = await obtenerClienteActual({ phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID });
  if (!client?.id || !/distrifinca/i.test(`${client.name} ${client.slug}`)) throw Error('Distrifinca tenant not verified');
  const rows = []; const pages = [];
  for (let offset = 0; ; offset += 500) {
    const params = new URLSearchParams({
      select: 'id,name,species,category,subcategory,life_stage,description,requires_confirmation,metadata,brand:catalog_brands!inner(id,name,client_id,active),presentations:catalog_presentations(id,weight,price,stock,active,metadata)',
      'brand.client_id': 'eq.' + client.id, 'brand.active': 'eq.true', active: 'eq.true',
      order: 'id.asc', limit: '500', offset: String(offset),
    });
    const page = await requestSupabase('catalog_references?' + params);
    if (!Array.isArray(page)) throw Error('Invalid catalog response');
    pages.push({ offset, count: page.length }); rows.push(...page);
    if (page.length < 500) break;
  }
  const catalog = construirCatalogoDesdeBusqueda(rows.map(r => ({
    brand_id:r.brand.id, brand_name:r.brand.name, reference_id:r.id, reference_name:r.name,
    species:r.species, category:r.category, subcategory:r.subcategory, life_stage:r.life_stage,
    description:r.description, requires_confirmation:r.requires_confirmation, reference_metadata:r.metadata,
    presentations:r.presentations.filter(p=>p.active).map(p=>({...p,metadata:{...p.metadata,id:p.id}})),
  })));
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(dir+'/catalog-rows.json',JSON.stringify(rows,null,2),{flag:'wx'});
  const bytes = JSON.stringify(catalog,null,2);
  fs.writeFileSync(dir+'/catalog.json',bytes,{flag:'wx'});
  fs.writeFileSync(dir+'/catalog-evidence.json',JSON.stringify({
    capturedAt:new Date().toISOString(), source:'Supabase read-only catalog, tenant-scoped',
    client:{id:client.id,name:client.name,slug:client.slug},pages, references:rows.length,
    sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
    relevant:rows.filter(r=>/churu|pro\s*plan.*\bom\b/i.test(r.name)),
  },null,2));
  process.stdout.write(JSON.stringify({references:rows.length,pages,relevant:rows.filter(r=>/churu|pro\s*plan.*\bom\b/i.test(r.name)).map(r=>({id:r.id,name:r.name,species:r.species,presentations:r.presentations.filter(p=>p.active).map(p=>({id:p.id,weight:p.weight}))}))})+'\n');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
