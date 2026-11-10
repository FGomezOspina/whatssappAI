// Read-only incident discovery; raw customer data stays in a private local file.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { requestSupabase } = require('../../src/repositories/supabaseClient');
const dir = path.resolve(__dirname, '../../docs/reports/sales-continuity-2026-11-05/private');
async function main() {
  const tenant = '1d2d79c4-19e0-4a6d-83f1-cf714ee7618b';
  const messages = await requestSupabase('whatsapp_messages?client_id=eq.' + tenant + '&created_at=gte.2026-11-01T00:00:00Z&or=(body.ilike.*maiz*,body.ilike.*maíz*)&select=id,channel_user_id,body,direction,created_at,metadata&order=created_at.asc&limit=100');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const threads = [];
  for (const user of [...new Set(messages.map(m => m.channel_user_id))]) {
    const filter = 'client_id=eq.' + tenant + '&channel_user_id=eq.' + encodeURIComponent(user);
    threads.push({ user, messages: await requestSupabase('whatsapp_messages?' + filter + '&created_at=gte.2026-11-01T00:00:00Z&select=id,body,direction,created_at,metadata&order=created_at.asc&limit=500'),
      state: await requestSupabase('whatsapp_conversations?' + filter + '&select=state,status,last_interaction_at') });
  }
  fs.writeFileSync(path.join(dir, 'observation.json'), JSON.stringify({ capturedAt: new Date().toISOString(), messages, threads }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ matches: messages.length, threads: threads.map((t,i) => ({ index: i, messages: t.messages.length, first: t.messages[0]?.created_at, last: t.messages.at(-1)?.created_at })) }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
