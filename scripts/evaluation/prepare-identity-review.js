// Offline review dossier for the existing supervised identity-evidence mechanism.
// No Supabase import, no approval, no aliases inserted into the runtime catalog.
const fs = require('node:fs');
const { createHash } = require('node:crypto');
function prepararRevision({fixture,catalog,catalogSha256,clientId}) {
  if(!/^[0-9a-f]{64}$/.test(catalogSha256||'') || !clientId || !fixture.profile) throw Error('Catalog version, tenant and source profile are required');
  const result={version:1,clientId,catalogSha256,window:fixture.window,proposals:[],excluded:[]};
  for(const c of fixture.cases) {
    const reject=reason=>result.excluded.push({caseId:c.id,reason});
    if(!['confirmed_identity','confirmed_reference_only'].includes(c.gold)) {reject('Insufficient identity evidence');continue;}
    if(c.direction!=='inbound'||!c.query||!c.at||!c.chat) {reject('Missing direct customer source');continue;}
    if(c.synthetic||c.sourceKind==='sandbox') {reject('Synthetic or Sandbox evidence');continue;}
    if(/image|audio|multi_product/.test(c.kind||'')&&c.mediaReviewed!==true) {reject('Unreviewed media dependency');continue;}
    const matches=catalog.flatMap(m=>m.referencias.filter(r=>r.metadata?.id===c.referenceId).map(r=>({m,r})));
    if(matches.length!==1||matches[0].r.nombre!==c.expectedReference) {reject('Reference ID and catalog name do not agree');continue;}
    const {m,r}=matches[0];
    const presentation=c.presentationId?r.presentaciones.find(p=>p.metadata?.id===c.presentationId):null;
    if(c.gold==='confirmed_identity'&&!presentation) {reject('Presentation ID not verified');continue;}
    if(/@|https?:\/\/|\+?\d[\d ().-]{8,}\d|\$\s*\d/.test(c.query)) {reject('Remove personal data and prices first');continue;}
    result.proposals.push({
      caseId:c.id,status:'pending_human_review',clientId,
      source:{kind:'whatsapp_business_ui',profile:fixture.profile,conversationKey:c.chat,
        observedAt:c.at,localEventKey:c.id,remoteMessageId:null,direction:c.direction,
        productText:c.query,sourceSha256:createHash('sha256').update(JSON.stringify([c.chat,c.at,c.query])).digest('hex')},
      target:{brand:m.marca,referenceId:c.referenceId,reference:r.nombre,
        presentationId:c.presentationId||null,weight:presentation?.peso||null,
        quantity:c.quantity??null,catalogSha256},
      evidence:c.evidence,scope:c.gold,
      review:{reviewedBy:null,reviewedAt:null,expiresAt:null},
      activationBlockedBy:['Human verification of identity and source still required',
        'Web observations have no whatsapp_messages UUID; never substitute a Sandbox message',
        'Existing migration 010 remains unapplied; no database write is authorized'],
    });
  }
  return result;
}
if(require.main===module) {
  const dir='docs/reports/real-conversations-2026-10-29';
  const evidence=JSON.parse(fs.readFileSync(dir+'/catalog-evidence.json'));
  const catalog=JSON.parse(fs.readFileSync(dir+'/catalog.json'));
  const fixture=require('../../test/fixtures/distrifinca-business-2026-10-29.json');
  const result=prepararRevision({fixture:{...fixture,profile:'distrifincapereira'},catalog,catalogSha256:evidence.sha256,clientId:evidence.client.id});
  fs.writeFileSync(dir+'/identity-review-pending.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({pending:result.proposals.length,excluded:result.excluded.length,databaseWrites:0,approved:0}));
}
module.exports={prepararRevision};
