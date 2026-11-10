// Offline: evaluate the exact paid responses again after validator edits.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'docs/reports/openai-validation-2026-10-30');
const {score}=require('./run-authorized-openai-replay');
const {validarCoincidenciaProducto:validate}=require('../../src/services/productMatchValidator');
const {seleccionarCatalogoLocal:retrieve}=require('../../src/services/catalogContextService')._internals;
const cl={intencion:'busqueda_producto',perfilContexto:'producto',requiereBusquedaProducto:true};
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'anonymized-replay-v1.json')));
const source=process.argv.find(a=>a.startsWith('--source='))?.slice(9)||'api-results-v1.jsonl';
const rows=fs.readFileSync(path.join(dir,source),'utf8').trim().split('\n').map(JSON.parse);
const results=rows.map(row=>{const c=manifest.cases.find(c=>c.id===row.id);const catalogo=retrieve({catalogo:JSON.parse(fs.readFileSync(path.join(root,c.catalog.path))),mensaje:c.input.message,clasificacion:cl}).catalogo;const result=validate({mensaje:c.input.message,interpretacion:row.interpretation,catalogo,clasificacion:cl});return {id:c.id,group:c.group,before:row.withOpenAI.outcome,after:score(c,result),result};});
const count=field=>results.reduce((s,r)=>(s[r[field]]=(s[r[field]]||0)+1,s),{});
const report={at:new Date().toISOString(),source,mode:'offline_stored_authentic_api_responses',before:count('before'),after:count('after'),results};
const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9)||path.join(dir,'stored-response-revalidation-v2.json');
fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({before:report.before,after:report.after,changes:results.filter(r=>r.before!==r.after).map(({id,before,after,result})=>({id,before,after,reason:result.razon}))}));
