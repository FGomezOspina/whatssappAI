const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {assertProductOnly}=require('../scripts/evaluation/prepare-authorized-openai-replay');
const prepared=require('../docs/reports/openai-validation-2026-10-30/anonymized-replay-v1.json');
test('prepared OpenAI copy preserves every source input and expectation without adding evidence to input',()=>{
 for(const c of prepared.cases){const bytes=fs.readFileSync(c.sourcePath),source=JSON.parse(bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),c.sourceSha256);const original=(source.cases||source.probes).find(x=>x.id===c.id);assert.deepEqual(c.expected,original.expected);assert.equal(c.input.message,original.input?.message||original.manualMatchingInput||'');assert.deepEqual(c.input.history,[]);assert.equal(c.input.contextState,null);assert.deepEqual(c.mediaSent,[]);assertProductOnly(c.input);}
 assert.equal(prepared.cases.filter(c=>!c.excluded).length,39);assert.equal(prepared.cases.filter(c=>c.excluded).length,16);
});
test('privacy gate rejects contact identifiers, secrets, external URLs and newly introduced unreviewed context',()=>{
 for(const message of ['cliente@example.com','300 123 4567','https://example.com/private-image','sk-1234567890abcdefghijkl','cuenta bancaria 1234'])assert.throws(()=>assertProductOnly({message,history:[],contextState:null}));
 assert.throws(()=>assertProductOnly({message:'Producto',history:[{content:'unreviewed'}],contextState:null}));
});
test('manual image readings remain labelled and are not converted to automatic image inputs',()=>{
 const today=prepared.cases.filter(c=>c.group==='oct30_manual');assert.equal(today.length,12);assert.ok(today.every(c=>/manual/.test(c.kind)&&!c.input.imageUrls));
 assert.ok(prepared.cases.some(c=>c.id==='C16-01'&&c.input.history.length===0));
});
