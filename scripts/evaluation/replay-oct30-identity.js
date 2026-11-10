// Offline only: original images remain unavailable to this runner. Human label
// readings and adviser fragments are explicitly separate from customer inputs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'docs/reports/real-conversations-2026-10-30');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const before=process.argv.includes('--before');
const version=process.argv.includes('--v2')?2:1;
const suffix=version===2?'-v2':'';
if(process.argv.some(a=>a.startsWith('--provider=')))throw Error('This runner is offline only. Original image replay requires future authorization and original media.');
const outputArg=process.argv.find(a=>a.startsWith('--output='));
const target=outputArg?path.resolve(outputArg.slice(9)):path.join(dir,(before?'before':'after')+suffix+'.json');if(fs.existsSync(target))throw Error('Result exists; preserve prior evidence.');
if(before){const Module=require('node:module');for(const name of ['catalogConsolidationService','productMatchValidator']){const filename=path.join(root,'src/services',name+'.js');const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));require.cache[filename]=m;m._compile(fs.readFileSync(path.join(dir,'code-before',name+'.txt'),'utf8'),filename);}}
const rawBytes=fs.readFileSync(path.join(dir,'raw-capture/catalog-rows.json')),raw=JSON.parse(rawBytes);
const {_internals:{construirCatalogoDesdeBusqueda:build}}=require('../../src/repositories/productRepository');
const catalog=build(raw.map(r=>({brand_id:r.brand.id,brand_name:r.brand.name,reference_id:r.id,reference_name:r.name,species:r.species,category:r.category,subcategory:r.subcategory,life_stage:r.life_stage,description:r.description,reference_metadata:r.metadata,presentations:r.presentations.filter(p=>p.active).map(p=>({...p,metadata:{...p.metadata,id:p.id}}))})));
const corpusBytes=fs.readFileSync(path.join(dir,`today-corpus-v${version}.json`)),corpus=JSON.parse(corpusBytes);
const {validarCoincidenciaProducto:validate}=require('../../src/services/productMatchValidator');
const {_internals:{seleccionarCatalogoLocal:retrieve}}=require('../../src/services/catalogContextService');
const clasificacion={intencion:'busqueda_producto',perfilContexto:'producto',requiereBusquedaProducto:true};
const rows=corpus.probes.map(c=>{const start=performance.now();const candidates=retrieve({catalogo:catalog,mensaje:c.manualMatchingInput,clasificacion}).catalogo;const r=validate({mensaje:c.manualMatchingInput,catalogo:candidates,clasificacion});const ref=r.coincidencia?.referenciaCatalogo||null,ids=r.coincidencia?.presentaciones?.map(p=>p.metadata?.id)||[];const identity=c.expected.referenceNames?.includes(ref)&&r.nivel==='alta';const clarification=c.expected.decision==='clarify'&&r.nivel!=='alta'&&(r.alternativas||[]).some(a=>c.expected.referenceNames.includes(a.referencia));const pack=c.expected.presentationId?ids.includes(c.expected.presentationId)&&r.presentacionValida:c.expected.presentationVerified===false?!r.presentacionValida:true;return{id:c.id,input:c.manualMatchingInput,level:r.nivel,reference:ref,presentationIds:ids,presentationValid:r.presentacionValida,reason:r.razon,clarification:r.aclaracion,pass:c.expected.decision==='clarify'?clarification:c.expected.decision==='abstain'?r.nivel!=='alta':!!identity&&pack,outcome:c.expected.decision==='clarify'?(clarification?'useful_clarification':r.nivel==='alta'?'wrong':'missed'):c.expected.decision==='abstain'?(r.nivel==='alta'?'wrong':'safe_abstention'):identity?(pack?'correct':'presentation_mismatch'):r.nivel==='alta'?'wrong':'missed',ms:performance.now()-start};});
const result={mode:before?'before':'after',runAt:new Date().toISOString(),sourceScope:'Manual readings of displayed image previews and adviser/context reconstructions; not automatic vision, interpretation, cart or WhatsApp E2E',rawCatalogSha256:sha(rawBytes),corpusSha256:sha(corpusBytes),normalizedReferenceCount:catalog.reduce((n,b)=>n+b.referencias.length,0),summary:rows.reduce((a,r)=>(a[r.outcome]=(a[r.outcome]||0)+1,a),{}),rows};
fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
if(!before){const catalogPath=path.join(dir,'catalog-after'+suffix+'.json'),bytes=JSON.stringify(catalog,null,2);if(!fs.existsSync(catalogPath))fs.writeFileSync(catalogPath,bytes,{flag:'wx'});else if(sha(fs.readFileSync(catalogPath))!==sha(bytes))throw Error('Derived catalog changed; use a new version rather than replacing snapshot.');}
console.log(JSON.stringify({mode:result.mode,summary:result.summary,rows:rows.map(r=>({id:r.id,outcome:r.outcome,reference:r.reference}))}));
