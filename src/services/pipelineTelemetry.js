const { AsyncLocalStorage } = require('node:async_hooks');
const { performance } = require('node:perf_hooks');
const { createHash, randomUUID } = require('node:crypto');
const contexto = new AsyncLocalStorage();
const hash = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
function registrar(etapa, datos = {}) {
  const ctx = contexto.getStore();
  if (!ctx) return;
  console.log(`[PERF][conversation:${ctx.conversation}][run:${ctx.run}] ${JSON.stringify({ etapa, ...datos })}`);
}
async function medir(etapa, tarea, datos = {}) {
  const ctx = contexto.getStore();
  const numero = ctx ? (ctx.contadores[etapa] = (ctx.contadores[etapa] || 0) + 1) : undefined;
  const inicio = performance.now(); let ok = false;
  try { const resultado = await tarea(); ok = true; return resultado; }
  finally {
    const muestra = { etapa, numero, ms: Number((performance.now() - inicio).toFixed(2)), ok, ...datos };
    contexto.getStore()?.mediciones.push(muestra); registrar(etapa, muestra);
  }
}
const envolver = (etapa, fn) => (...args) => medir(etapa, () => fn(...args));
function medirSincrono(etapa, tarea) {
  const inicio = performance.now(); let ok = false;
  try { const resultado = tarea(); ok = true; return resultado; }
  finally {
    const muestra = { etapa, ms: Number((performance.now() - inicio).toFixed(2)), ok };
    contexto.getStore()?.mediciones.push(muestra); registrar(etapa, muestra);
  }
}
function crearContexto(clave, recibido = Date.now()) {
  return { conversation: hash(clave), run: randomUUID(), recibido, inicio: Date.now(), contadores: {}, mediciones: [], alEnviar: null };
}
function resumen(ctx) {
  const grupos = {};
  for (const m of ctx.mediciones) {
    const g = grupos[m.etapa] ||= { llamadas: 0, ms: 0 };
    g.llamadas++; g.ms += m.ms; g.ms = Number(g.ms.toFixed(2));
  }
  const sql = ctx.mediciones.filter(m => m.etapa === 'supabase_request');
  const repetidas = new Map();
  for (const m of sql) repetidas.set(m.queryHash, (repetidas.get(m.queryHash) || 0) + 1);
  const resultado = { grupos, supabaseTop3: [...sql].sort((a,b) => b.ms-a.ms).slice(0,3),
    consultasRepetidas: [...repetidas].filter(([, n]) => n > 1),
    totalConBufferMs: Date.now()-ctx.recibido, totalProcesamientoMs: Date.now()-ctx.inicio };
  registrar('summary', resultado); return resultado;
}
module.exports = { contexto, hash, registrar, medir, medirSincrono, envolver, crearContexto, resumen };
