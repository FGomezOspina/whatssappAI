const test=require('node:test');
const assert=require('node:assert/strict');
const {prepararRevision}=require('../scripts/evaluation/prepare-identity-review');
const catalog=[{marca:'NUBE',referencias:[{nombre:'NUBE ADULTO',metadata:{id:'ref-a'},presentaciones:[{peso:'2kg',metadata:{id:'p-a'}}]}]}];
const source={id:'C00-01',chat:'C00',at:'2026-10-29T10:00:00-05:00',direction:'inbound',query:'Nube adulto 2kg',gold:'confirmed_identity',referenceId:'ref-a',expectedReference:'NUBE ADULTO',presentationId:'p-a',evidence:'Synthetic test of dossier contract only'};
const run=c=>prepararRevision({fixture:{cases:c,profile:'synthetic-test'},catalog,catalogSha256:'a'.repeat(64),clientId:'tenant-a'});
test('review dossier remains pending and records local provenance without inventing remote IDs',()=>{
  const [p]=run([source]).proposals;
  assert.equal(p.status,'pending_human_review'); assert.equal(p.source.remoteMessageId,null);
  assert.equal(p.review.reviewedBy,null);assert.equal(p.target.presentationId,'p-a');
  assert.equal(p.target.quantity,null);assert.equal(p.target.catalogSha256,'a'.repeat(64));
  assert.ok(p.activationBlockedBy.length); assert.equal(p.source.sourceSha256.length,64);
});
test('ambiguous and undecoded media, bot-only, Sandbox and synthetic evidence never become proposals',()=>{
  const cases=[{gold:'ambiguous'},{gold:'incomplete_media'},{kind:'audio'},{kind:'image_and_text'},{direction:'outbound_adviser'},{sourceKind:'sandbox'},{synthetic:true}].map(p=>({...source,...p}));
  const r=run(cases);assert.equal(r.proposals.length,0);assert.equal(r.excluded.length,cases.length);
});
test('reference-only evidence cannot invent a package, quantity or reviewer',()=>{
  const r=run([{...source,gold:'confirmed_reference_only',presentationId:undefined}]);
  assert.equal(r.proposals[0].target.weight,null);assert.equal(r.proposals[0].target.presentationId,null);
});
test('catalog drift, wrong IDs, foreign reference and price-only evidence are rejected',()=>{
  const cases=[{expectedReference:'OTHER'},{referenceId:'foreign-ref'},{presentationId:'unknown'},{query:'$103700'}].map(p=>({...source,...p}));
  assert.equal(run(cases).proposals.length,0);
  assert.throws(()=>prepararRevision({fixture:{cases:[]},catalog,clientId:'tenant-a'}));
});
