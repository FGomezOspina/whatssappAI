#!/usr/bin/env node
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const { listarCandidatos, revisarCandidato } = require('../src/repositories/learningRepository');
async function main() {
  const [action, clientId, idOrStatus, filename] = process.argv.slice(2);
  if (action === 'list') {
    console.log(JSON.stringify(await listarCandidatos(clientId, idOrStatus || 'pending'), null, 2));
  } else if (['approve', 'reject', 'revoke'].includes(action)) {
    if (!filename) throw Error('Indica un archivo JSON con la revisión o el motivo.');
    const revision = JSON.parse(fs.readFileSync(filename, 'utf8'));
    const rows = await revisarCandidato(clientId, idOrStatus, action, revision);
    console.log(JSON.stringify(rows.map(r => ({ id: r.id, active: r.active, tags: r.tags })), null, 2));
  } else throw Error('Uso: node scripts/review-learning.js list CLIENT_UUID [pending|approved|rejected|revoked]\n       node scripts/review-learning.js approve|reject|revoke CLIENT_UUID EXAMPLE_UUID revision.json');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
