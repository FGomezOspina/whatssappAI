// Read-only catalog snapshot and deterministic identity diagnostics. No messages/writes.
const fs = require('node:fs');
require('dotenv').config({quiet:true});
const { cargarCatalogoCliente } = require('../../src/repositories/productRepository');
const { obtenerClienteActual } = require('../../src/services/clients.service');
const { validarCoincidenciaProducto } = require('../../src/services/productMatchValidator');
const dir = 'docs/reports/identity-language-2026-10-29';
const label = process.argv[2];
if (!/^[a-z-]+$/.test(label || '')) throw Error('Label required');
const traces=[];console.log=(...args)=>{if(args[0]?.startsWith('[PRODUCT_TRACE] '))traces.push(JSON.parse(args[0].slice(16)));};
process.env.PRODUCT_RECOGNITION_TRACE='true';
(async()=>{
 fs.mkdirSync(dir,{recursive:true});
 const file=dir+'/catalog-snapshot.json';
 let snapshot;
 if(fs.existsSync(file))snapshot=JSON.parse(fs.readFileSync(file));
 else {
  const client=await obtenerClienteActual({phoneNumberId:process.env.KAPSO_PHONE_NUMBER_ID});
  snapshot={at:new Date().toISOString(),source:'Read-only tenant-scoped Supabase catalog tables',catalog:await cargarCatalogoCliente(client)};
  fs.writeFileSync(file,JSON.stringify(snapshot,null,2));
 }
 const rows=[];
 for(const mensaje of ['diamon indor para gato medio kilo','diamon indor gato 500g','DIAMOND INDOOR CAT 500g']){
  const index=traces.length,start=performance.now();
  const result=validarCoincidenciaProducto({mensaje,catalogo:snapshot.catalog,
   clasificacion:{intencion:'busqueda_producto',perfilContexto:'producto'}});
  rows.push({mensaje,result,ms:performance.now()-start,traces:traces.slice(index)});
 }
 fs.writeFileSync(dir+'/'+label+'.json',JSON.stringify({at:new Date().toISOString(),source:snapshot.source,rows},null,2));
 process.stdout.write(JSON.stringify(rows.map(r=>({text:r.mensaje,level:r.result.nivel,match:r.result.coincidencia?.referencia,terms:r.result.terminos})))+'\n');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
