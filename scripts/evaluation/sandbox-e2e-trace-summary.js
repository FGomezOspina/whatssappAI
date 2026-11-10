const fs=require('fs'),crypto=require('crypto');
const dir='docs/reports/sandbox-e2e-2026-10-30/';
const traces=fs.readFileSync('.tmp/sandbox-e2e-runtime-20261030.log','utf8').split('\n').filter(x=>x.startsWith('[PRODUCT_TRACE] ')).map(x=>JSON.parse(x.slice(16)));
fs.writeFileSync(dir+'private/resumed-product-trace.json',JSON.stringify(traces,null,2),{mode:0o600});
const rows=traces.filter(t=>['fuente_identidad','validacion_identidad','redaccion_producto','busqueda_candidatos'].includes(t.etapa)).map(t=>({run:t.run,stage:t.etapa,source:t.fuenteIdentidad,continued:t.continuada,candidates:t.candidatos,level:t.validacion?.nivel,reason:t.validacion?.razon,reference:t.validacion?.coincidencia?.referencia,presentation:t.validacion?.presentacionSolicitada,output:t.salida}));
fs.writeFileSync(dir+'root-cause/stage-evidence.json',JSON.stringify({at:new Date().toISOString(),rows},null,2));
console.log({traces:traces.length,publicStages:rows.length});
