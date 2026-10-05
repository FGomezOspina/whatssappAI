// Dry run by default. --apply updates only the reviewed catalog references.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { requestSupabase } = require('../src/repositories/supabaseClient');
const corrections = require('./data/wet-food-corrections.json');

async function main() {
  const apply = process.argv.includes('--apply');
  const clients = await requestSupabase('aivance_clients?slug=eq.distrifinca&select=id');
  assert.equal(clients.length, 1);
  const brands = await requestSupabase(`catalog_brands?client_id=eq.${clients[0].id}&select=id,name`);
  const changes = [];
  for (const correction of corrections) {
    const rows = await requestSupabase(`catalog_references?id=eq.${correction.id}&select=id,brand_id,name,category,subcategory,species,metadata`);
    assert.equal(rows.length, 1);
    const before = rows[0];
    assert.equal(before.name, correction.name);
    assert.equal(brands.find(b => b.id === before.brand_id)?.name, correction.brand);
    const metadata = { ...before.metadata, food_format_source: correction.source };
    if (correction.alias) metadata.aliases = [...new Set([...(metadata.aliases || []), correction.alias])];
    changes.push({ before, after: { category: 'comida', subcategory: 'comida_humeda', species: 'gato', metadata } });
  }
  if (apply) {
    const backup = `/tmp/wet-food-catalog-before-${Date.now()}.json`;
    fs.writeFileSync(backup, JSON.stringify(changes, null, 2), { mode: 0o600 });
    console.log(`Backup: ${backup}`);
    for (const { before, after } of changes) {
      // Match original values as well, to avoid overwriting concurrent edits.
      const path = `catalog_references?id=eq.${before.id}&brand_id=eq.${before.brand_id}&subcategory=eq.${before.subcategory}&species=eq.${before.species}`;
      const updated = await requestSupabase(path, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(after) });
      assert.equal(updated.length, 1, `Concurrent edit: ${before.name}`);
      assert.equal(updated[0].subcategory, after.subcategory);
      assert.equal(updated[0].species, after.species);
      console.log(`Updated: ${before.name}`);
    }
  } else {
    console.log(JSON.stringify(changes, null, 2));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
