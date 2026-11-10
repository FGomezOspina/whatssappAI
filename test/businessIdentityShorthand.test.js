const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarKilosAbreviadosCatalogo:n } = require('../src/utils/catalogQueryNormalization');
const { validarCoincidenciaProducto:v } = require('../src/services/productMatchValidator');
const classification={intencion:'busqueda_producto',perfilContexto:'producto',requiereBusquedaProducto:true};
// Synthetic safety controls; never presented as customer messages.
const catalog=[{marca:'SOL NORTE',referencias:[
  {nombre:'SOL NORTE CANINE OM',especie:'perro',presentaciones:[{peso:'2kg',precio:100}]},
  {nombre:'SOL NORTE FELINE OM',especie:'gato',presentaciones:[{peso:'1.5kg',precio:200}]},
  {nombre:'SOL NORTE CANINE UR',especie:'perro',presentaciones:[{peso:'2kg',precio:300}]},
]}];
test('shorthand x2k is grounded in tenant brand and actual package weights',()=>{
  for(const q of ['Solnorte OM X2K','SOL NORTE OM x 2 k','Sol Norte OM x2k?']) assert.match(n(q,catalog),/2kg/);
  assert.equal(n('Sol Norte OM x1,5k',catalog),'Sol Norte OM 1.5kg');
  assert.equal(n('Sol Norte OM x9k',catalog),'Sol Norte OM x9k');
});
test('shorthand normalization does not infer bare money, a missing brand or quantity',()=>{
  for(const q of ['SOL NORTE 2k','SOL NORTE $x2k','SOL NORTE x2k pesos','SOL NORTE x2k COP','OM x2k','Sol Norte x2','OTHER OM x2k']) assert.equal(n(q,catalog),q);
});
test('existing alphanumeric SKU and aliases take precedence over unit shorthand',()=>{
  for(const reference of [{nombre:'SOL NORTE X2K'},{nombre:'SOL NORTE X 2 K'},{nombre:'SOL NORTE NUBE',metadata:{aliases:['X2K']}}]){
    const cat=[{marca:'SOL NORTE',referencias:[...catalog[0].referencias,{...reference,presentaciones:[{peso:'2kg',precio:400}]}]}];
    assert.equal(n('SOL NORTE X2K',cat),'SOL NORTE X2K');
    assert.equal(n('SOL NORTE X 2 K',cat),'SOL NORTE X 2 K');
  }
});
test('shorthand recovers the named identity and preserves its commercial code',()=>{
  const r=v({mensaje:'Solnorte OM X2K',catalogo:catalog,clasificacion:classification});
  assert.equal(r.nivel,'alta'); assert.equal(r.coincidencia.referencia,'SOL NORTE CANINE OM');
  assert.equal(r.presentacionSolicitada,'2kg'); assert.equal(r.presentacionValida,true);
  for(const code of ['XY','XQ17']) assert.notEqual(v({mensaje:`Solnorte ${code} x2k`,catalogo:catalog,clasificacion:classification}).nivel,'alta');
});
test('weight never chooses an unspecified line or contradicting species',()=>{
  for(const q of ['Sol Norte x2k','Sol Norte OM gato x2k']) {
    const r=v({mensaje:q,catalogo:catalog,clasificacion:classification});
    assert.ok(r.nivel!=='alta'||r.presentacionValida===false);
  }
});
test('normalization and validation do not mutate tenant catalog or cross tenants',()=>{
  const before=JSON.stringify(catalog);
  v({mensaje:'Sol Norte OM x2k',catalogo:catalog,clasificacion:classification});
  assert.equal(JSON.stringify(catalog),before);
  assert.equal(n('Sol Norte OM x2k',[{marca:'OTHER',referencias:catalog[0].referencias}]),'Sol Norte OM x2k');
});
