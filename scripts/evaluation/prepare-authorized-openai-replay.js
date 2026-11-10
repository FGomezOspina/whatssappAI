// Pure local preparation: no dotenv, SDK, network, or production store imports.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function assertProductOnly(input){
 const txt=JSON.stringify(input);
 if(/sk-[a-z0-9_-]{12,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|(?:\+?57\s*)?3\d{2}[\s-]*\d{3}[\s-]*\d{4}|\b(?:cedula|cédula|cuenta bancaria|numero de cuenta|número de cuenta)\b/i.test(txt))throw Error('Input requires privacy review; not prepared for transmission.');
 if(input.contextState!==null || input.history.length)throw Error('This version only preserves previously reviewed empty history/state; new context needs separate review.');
}
function main(){
 const firstPath='docs/reports/real-conversations-2026-10-29/frozen-business-replay-v1.json',todayPath='docs/reports/real-conversations-2026-10-30/today-corpus-v2.json';
 const aBytes=fs.readFileSync(path.join(root,firstPath)),bBytes=fs.readFileSync(path.join(root,todayPath));const a=JSON.parse(aBytes),b=JSON.parse(bBytes);
 const cases=a.cases.map(c=>({id:c.id,group:'original_frozen',sourcePath:firstPath,sourceSha256:sha(aBytes),input:structuredClone(c.input),expected:structuredClone(c.expected),kind:c.input.derivation,excluded:c.expected.decision==='excluded',redactions:[],catalog:a.catalog,mediaSent:[],note:'Original frozen input preserved verbatim. No evidence notes, names, chat IDs, dates, quotations, or gold appended to model input.'}));
 const catalogPath='docs/reports/real-conversations-2026-10-30/catalog-after-v2.json';
 cases.push(...b.probes.map(c=>({id:c.id,group:'oct30_manual',sourcePath:todayPath,sourceSha256:sha(bBytes),input:{message:c.manualMatchingInput,history:[],contextState:null,derivation:c.origin},expected:structuredClone(c.expected),kind:c.origin,excluded:false,redactions:[],catalog:{path:catalogPath,sha256:sha(fs.readFileSync(path.join(root,catalogPath)))},mediaSent:[],note:'Human transcription/reconstruction, not automatic image or original customer-message perception. Source chat sequences and adviser evidence excluded from model payload.'})));
 for(const c of cases)assertProductOnly(c.input);
 const target=path.join(root,'docs/reports/openai-validation-2026-10-30/anonymized-replay-v1.json');
 const result={version:1,createdAt:new Date().toISOString(),authorization:{scope:'User permits relevant anonymized product requests and necessary context to OpenAI. No permission to send complete exports, personal details or unreviewed images.',currentExecutionBlock:'Automatic approval rejected network retry after HTTP500; no further OpenAI calls allowed without resolving that rejection.'},privacyReview:{reviewedInputs:cases.length,eligibleTextInputs:cases.filter(c=>!c.excluded).length,excludedCases:cases.filter(c=>c.excluded).length,inputTextChanges:0,reason:'Source fixtures were already anonymized product-only inputs. Reviewed all39 eligible texts; no customer names/phones/addresses/payment identifiers present. Frozen empty history and null state preserved.',notTransmitted:['whole chat sequences','adviser quotes','evidence notes','expected labels','customer identifiers','original images','audio','credentials']},cases};
 fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result.privacyReview));return result;
}
if(require.main===module)main();
module.exports={assertProductOnly,main};
