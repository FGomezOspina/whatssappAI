const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {normalizar}=require('../src/utils/text');
const {crearRankingIdentidad}=require('../src/services/catalogIdentityRanking');
const {seleccionarCatalogoLocal}=require('../src/services/catalogContextService')._internals;
const {validarCoincidenciaProducto}=require('../src/services/productMatchValidator');
const {cargarProductos}=require('../src/repositories/productRepository');
const clasificacion={intencion:'busqueda_producto',perfilContexto:'producto',requiereBusquedaProducto:true};

test('nombres fragmentados y términos raros sobreviven a ocho candidatos (regresiones de chats)',()=>{
  const catalogo=cargarProductos();
  for(const [mensaje,expected] of [['cat show delimix adultos de 10 kg','CAT CHOW DELIMIX'],['Fofi cat tofu','ARENA FOFICAT TOFU']]) {
    const candidatos=seleccionarCatalogoLocal({catalogo,mensaje,clasificacion}).catalogo;
    assert.ok(candidatos.flatMap(m=>m.referencias).some(r=>r.nombre===expected));
    const result=validarCoincidenciaProducto({mensaje,catalogo:candidatos,clasificacion});
    assert.equal(result.nivel,'alta');assert.equal(result.coincidencia.referencia,expected);
  }
});

test('ranking dinámico para nombres nuevos, aislado y sin metadata operativa',()=>{
  const items=Array.from({length:15},(_,i)=>({marca:{marca:'LUMA'},referencia:{nombre:`LUMA CAT ADULTO ${i}`}}));
  items.push({marca:{marca:'TALVORA'},referencia:{nombre:'TALVORA NEBULA',metadata:{source:'secreto'}}});
  const scores=crearRankingIdentidad(items,'tal vora nebula cat adulto');
  assert.ok(scores.at(-1)>scores[0]);
  assert.deepEqual(crearRankingIdentidad(items,'secreto'),items.map(()=>0));
  assert.deepEqual(crearRankingIdentidad(items.slice(0,2),'tal vora nebula'),[0,0]);
});

test('a/c raza conserva etapa sin transformar preposición ni código',()=>{
  assert.equal(normalizar('nueva a raza pequeña'),'nueva adulto raza pequena');
  assert.equal(normalizar('nueva c raza grande'),'nueva cachorro raza grande');
  assert.equal(normalizar('enviar a domicilio C/D'),'enviar a domicilio c d');
  const catalogo=[{marca:'NUEVA',referencias:[
    {nombre:'NUEVA ADULTO RAZA PEQUEÑA',especie:'perro',categoria:'comida',etapa:'adulto',presentaciones:[{peso:'2kg',precio:1}]},
    {nombre:'NUEVA CACHORRO RAZA PEQUEÑA',especie:'perro',categoria:'comida',etapa:'cachorro',presentaciones:[{peso:'2kg',precio:1}]},
  ]}];
  const r=validarCoincidenciaProducto({mensaje:'nueva a raza pequeña 2kl',catalogo,clasificacion});
  assert.equal(r.nivel,'alta');assert.equal(r.coincidencia.referencia,'NUEVA ADULTO RAZA PEQUEÑA');
});

function evidenceRepo(env,request){
  const file=require.resolve('../src/repositories/productIdentityEvidenceRepository');
  const module={exports:{}};const req=createRequire(file);
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,process:{env},AbortSignal,
    require:name=>name==='./supabaseClient'?{requestSupabase:request,supabaseConfigurado:()=>true}:req(name)});
  return module.exports;
}
const client={id:'11111111-1111-4111-8111-111111111111'};
test('evidencia desactivada, ámbito inválido y multimedia no agregan consultas',async()=>{
  let count=0;const request=async()=>{count++;return[];};
  await evidenceRepo({},request).buscarIdentidadesVerificadas(client,'mencion');
  await evidenceRepo({PRODUCT_IDENTITY_EVIDENCE_ENABLED:'true'},request).buscarIdentidadesVerificadas({},'mencion');
  await evidenceRepo({PRODUCT_IDENTITY_EVIDENCE_ENABLED:'true'},request).buscarIdentidadesVerificadas(client,'x'.repeat(301));
  assert.equal(count,0);
});
test('evidencia lleva ámbito y literal al RPC, sin caché para revocaciones',async()=>{
  const calls=[];const repo=evidenceRepo({PRODUCT_IDENTITY_EVIDENCE_ENABLED:'true'},async(path,opts)=>{
    calls.push([path,JSON.parse(opts.body)]);return[];
  });
  await repo.buscarIdentidadesVerificadas(client,'nombre informal');
  await repo.buscarIdentidadesVerificadas(client,'nombre informal');
  assert.equal(calls.length,2);assert.equal(calls[0][1].p_client_id,client.id);
  assert.equal(calls[0][1].p_query,'nombre informal');
});
test('fallos de evidencia dejan la búsqueda normal disponible',async()=>{
  const repo=evidenceRepo({PRODUCT_IDENTITY_EVIDENCE_ENABLED:'true'},async()=>{throw Error('timeout');});
  assert.equal((await repo.buscarIdentidadesVerificadas(client,'mencion')).length,0);
});

test('evidencia recuperada pasa todavía por validación de especie y presentación',async()=>{
  const repo=evidenceRepo({PRODUCT_IDENTITY_EVIDENCE_ENABLED:'true'},async()=>[{
    brand_id:'b',reference_id:'r',brand_name:'TALVORA',reference_name:'TALVORA ADULTO',species:'perro',category:'comida',life_stage:'adulto',
    reference_metadata:{aliases:['talvora del naranja']},presentations:[{peso:'2kg',precio:10}],score:1,
  }]);
  const catalogo=await repo.buscarIdentidadesVerificadas(client,'talvora del naranja');
  const match=validarCoincidenciaProducto({mensaje:'talvora del naranja',catalogo,clasificacion});
  assert.equal(match.nivel,'alta');assert.equal(match.coincidencia.referencia,'TALVORA ADULTO');
  const wrongSpecies=validarCoincidenciaProducto({mensaje:'talvora del naranja para gatos',catalogo,clasificacion});
  assert.notEqual(wrongSpecies.nivel,'alta');
  const wrongSize=validarCoincidenciaProducto({mensaje:'talvora del naranja 30kg',catalogo,clasificacion});
  assert.notEqual(wrongSize.presentacionValida,true);
});

test('pipeline combina evidencia verificada con FTS y no consulta evidencia para imágenes',async()=>{
  const file=require.resolve('../src/services/catalogContextService'),req=createRequire(file),module={exports:{}};
  let evidenceCalls=0,searchCalls=0;
  const catalogo=[{marca:'TALVORA',referencias:[{nombre:'TALVORA ADULTO',especie:'perro',categoria:'comida',etapa:'adulto',
    metadata:{aliases:['talvora del naranja']},presentaciones:[{peso:'2kg',precio:10}]}]}];
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,console,process:{env:{CATALOG_SEARCH_LOGS:'false'}},require:name=>{
    if(name==='../repositories/productIdentityEvidenceRepository')return{buscarIdentidadesVerificadas:async()=>{evidenceCalls++;return catalogo;}};
    if(name==='../repositories/productRepository')return{buscarProductosCatalogoCliente:async()=>{searchCalls++;return{catalogo:[],metadata:{}};}};
    return req(name);
  }});
  const result=await module.exports.seleccionarCatalogoParaIA({cliente:client,mensaje:'talvora del naranja',mensajeOriginal:'talvora del naranja',clasificacion});
  assert.equal(evidenceCalls,1);assert.ok(searchCalls>0);
  const v=validarCoincidenciaProducto({mensaje:'talvora del naranja',catalogo:result.catalogo,clasificacion});
  assert.equal(v.nivel,'alta');assert.equal(v.coincidencia.referencia,'TALVORA ADULTO');
  await module.exports.seleccionarCatalogoParaIA({cliente:client,mensaje:'talvora del naranja',clasificacion:{...clasificacion,requiereVision:true}});
  assert.equal(evidenceCalls,1);
});

test('código comercial declarado conserva identidad aunque omitan la barra',()=>{
  const {resolverCodigoDeclarado}=require('../src/utils/catalogDeclaredCodes');
  const catalogo=[{marca:'SINTETICA',referencias:[
    {nombre:'SINTETICA LATA A/D',categoria:'comida',subcategoria:'comida_humeda'},
    {nombre:'SINTETICA LATA C/D',categoria:'comida',subcategoria:'comida_humeda'},
  ]}];
  assert.equal(resolverCodigoDeclarado('sintetica lata ad',catalogo),'sintetica lata A/D');
  assert.equal(resolverCodigoDeclarado('sintetica lata cd',catalogo),'sintetica lata C/D');
  for(const text of ['desconocida lata ad','sintetica ad','sintetica concentrado ad','sintetica lata adulto'])assert.equal(resolverCodigoDeclarado(text,catalogo),text);
  catalogo[0].referencias.push({nombre:'SINTETICA LATA AD',categoria:'comida',subcategoria:'comida_humeda'});
  assert.equal(resolverCodigoDeclarado('sintetica lata ad',catalogo),'sintetica lata ad');
});
test('solicitud de sandbox contrastada con Supabase: lata ad preserva A/D frente a otras dietas',()=>{
  const catalogo=require('../docs/reports/recognition-2026-10-28/catalog-snapshot.json');
  const mensaje='Maneja hills lata ad';
  const candidatos=seleccionarCatalogoLocal({catalogo,mensaje,clasificacion}).catalogo;
  const r=validarCoincidenciaProducto({mensaje,catalogo:candidatos,clasificacion});
  assert.equal(r.nivel,'alta');assert.equal(r.coincidencia.referencia,'HILLS CAN Y FEL LATA A/D');
});
