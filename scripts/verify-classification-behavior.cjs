// Offline verification against the existing agent. No runtime files or network calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
const out=process.env.CLASSIFICATION_REPORT_DIR || path.join(root,'docs/reports/classification-2026-10-28');
const catalog=JSON.parse(fs.readFileSync(path.join(out,'productos.candidate.json')));
const snapshot=JSON.parse(fs.readFileSync(path.join(out,'supabase.before.json')));
const plan=JSON.parse(fs.readFileSync(path.join(out,'remote-plan.json')));
const coverage=JSON.parse(fs.readFileSync(path.join(out,'coverage.json')));
const {admiteEspecie}=require('../src/utils/catalogCommercialRules');
const {crearEstadoInicial}=require('../src/conversation/conversationStore');
const {validarCoincidenciaProducto}=require('../src/services/productMatchValidator');
function inspectModule(relative,extra){
 const file=path.join(root,relative),mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8')+'\nObject.assign(module.exports,{'+extra+'});',
  {require:createRequire(file),module:mod,exports:mod.exports,process,console,__dirname:path.dirname(file),Buffer,setTimeout,clearTimeout});
 return mod.exports;
}
const orders=inspectModule('src/verticals/petshop/orderLogic.js','referenciaCumple,referenciasPorEspecie');
const repository=inspectModule('src/repositories/productRepository.js','construirCatalogo,construirCatalogoDesdeBusqueda');
const get=key=>{const [b,r]=key.split(':').map(Number);return catalog[b].referencias[r];};
const refs=snapshot.refs.map(({catalog_brands,catalog_presentations,...r})=>{
 const p=plan.find(x=>x.remote_id===r.id);return {...r,...Object.fromEntries(Object.entries(p?.remote_delta||{}).map(([k,v])=>[k,v.after]))};
});
const brands=[...new Map(snapshot.refs.map(r=>[r.catalog_brands.id,r.catalog_brands])).values()];
const remote=repository.construirCatalogo({marcas:brands,referencias:refs,presentaciones:snapshot.refs.flatMap(r=>r.catalog_presentations)});
let filters=0;
for(const item of coverage.filter(x=>x.local_delta['metadata.especies'])){
 const local=get(item.local_key),r=refs.find(x=>x.id===item.remote_id),b=brands.find(x=>x.id===r.brand_id);
 const loaded=remote.flatMap(x=>x.referencias).find(x=>x.nombre===r.name);
 assert(loaded,item.local_key);
 const rpc=repository.construirCatalogoDesdeBusqueda([{brand_id:b.id,reference_id:r.id,brand_name:b.name,reference_name:r.name,
  species:r.species,category:r.category,subcategory:r.subcategory,life_stage:r.life_stage,reference_metadata:r.metadata,
  presentations:snapshot.refs.find(x=>x.id===r.id).catalog_presentations.map(p=>({peso:p.weight,precio:p.price,metadata:p.metadata}))}])[0].referencias[0];
 for(const candidate of [local,loaded,rpc]){
  assert.deepEqual(Array.from(candidate.metadata.especies),local.metadata.especies);
  for(const species of ['perro','gato','ave','equino','bovino','pez','roedor']){
   const wanted=local.metadata.especies.includes(species);
   assert.equal(admiteEspecie(candidate,species),wanted,item.local_key+' '+species);
   assert.equal(orders.referenciaCumple(candidate,{especie:species,categoria:local.categoria}),wanted,item.local_key+' filter '+species);
   filters++;
  }
 }
}
for(const key of ['283:0','283:1','46:0']){
 const r=get(key);assert.equal(r.metadata.especies,undefined);
 for(const species of ['perro','gato'])assert.equal(admiteEspecie(r,species),false,key);
}
// Positive quote flow: supported species retain exact price, reference and empty cart.
let quotes=0;
for(const [key,species] of [['193:0','gato'],['293:0','perro'],['193:0','perro']]){
 const [bi]=key.split(':').map(Number),r=get(key),brand=catalog[bi],p=r.presentaciones[0];
 const c=[{...brand,referencias:[r]}],state=crearEstadoInicial();
 const interpretation={intencion:'consulta_producto',accion:'consultar',confianza:1,producto:{marca:brand.marca,referencia:r.nombre,
  especie:species,presentacion:p.peso,cantidad:1}};
 const message=`cuanto cuesta ${r.nombre} ${p.peso} para ${species}`;
 const result=validarCoincidenciaProducto({mensaje:message,catalogo:c,interpretacion:interpretation,
  clasificacion:{intencion:'busqueda_producto',perfilContexto:'pedido',requiereBusquedaProducto:true}});
 assert.equal(result.nivel,'alta');assert.equal(result.coincidencia.referencia,r.nombre);
 orders.resolverConsultaCatalogo(message,state,c,interpretation);
 assert.equal(state.carrito.length,0);assert.equal(state.productosConsultados[0].referencia,r.nombre);
 assert.equal(state.productosConsultados[0].precio,p.precio);quotes++;
}
// Known limitation: a direct-name quote is not the strict species-filter pathway.
// Record this fact instead of weakening an assertion or changing the agent.
const unknown=get('283:0'),state=crearEstadoInicial(),brand=catalog[283];
const response=orders.resolverConsultaCatalogo('cuanto cuesta '+unknown.nombre+' para gato',state,[{...brand,referencias:[unknown]}],
 {intencion:'consulta_producto',accion:'consultar',confianza:1,producto:{marca:brand.marca,referencia:unknown.nombre,especie:'gato',presentacion:'unidad',cantidad:1}});
const baseline=JSON.parse(fs.readFileSync(path.join(out,'productos.before.json')))[283];
const oldState=crearEstadoInicial(),oldReference=baseline.referencias[0];
orders.resolverConsultaCatalogo('cuanto cuesta '+oldReference.nombre+' para gato',oldState,[{...baseline,referencias:[oldReference]}],
 {intencion:'consulta_producto',accion:'consultar',confianza:1,producto:{marca:baseline.marca,referencia:oldReference.nombre,especie:'gato',presentacion:'unidad',cantidad:1}});
assert.equal(state.productosConsultados.length,oldState.productosConsultados.length,'Direct-name behavior changed');
const result={strict_filter_checks:filters,quote_checks:quotes,metadata_survives_local_rest_rpc:true,
 unknown_or_aggregated_not_declared_multispecies:true,production_writes:0,
 preexisting_limitations:[{case:'PAÑOLETA por nombre para gato',direct_quote_returned:state.productosConsultados.length>0,original_backup_quote_returned:oldState.productosConsultados.length>0,
 meaning:'La ruta directa por nombre puede cotizar aunque no exista especie documentada. La clasificación no garantiza un bloqueo clínico/compatibilidad anatómica.',response}]};
fs.writeFileSync(path.join(out,'behavior-validation.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
