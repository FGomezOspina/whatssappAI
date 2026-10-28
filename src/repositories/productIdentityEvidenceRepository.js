const { requestSupabase, supabaseConfigurado } = require('./supabaseClient');
const { _internals: { construirCatalogoDesdeBusqueda } } = require('./productRepository');

// Optional, read-only retrieval. Approval is an administrative database action,
// never a consequence of the bot's match or the customer's generic "sí".
async function buscarIdentidadesVerificadas(cliente, mencion) {
  if (process.env.PRODUCT_IDENTITY_EVIDENCE_ENABLED !== 'true' || !supabaseConfigurado() ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(cliente?.id || '') ||
      typeof mencion !== 'string' || !mencion.trim() || mencion.length > 300) return [];
  try {
    const filas = await requestSupabase('rpc/search_verified_product_identities', {
      method: 'POST', signal: AbortSignal.timeout(1200),
      body: JSON.stringify({ p_client_id: cliente.id, p_query: mencion.trim() }),
    });
    // The RPC returns nothing on conflicting approvals, expired evidence,
    // changed identity, disabled products or revoked reviews. Do not cache.
    return construirCatalogoDesdeBusqueda(filas || []);
  } catch {
    // A missing migration or timeout must not break normal catalog retrieval.
    return [];
  }
}

module.exports = { buscarIdentidadesVerificadas };
