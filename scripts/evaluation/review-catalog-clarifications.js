// Offline audit classification only. Product labels below never affect runtime matching.
const fs=require('node:fs'),crypto=require('node:crypto');
const dir='docs/reports/real-conversations-2026-10-29/';
const before=require('../../'+dir+'catalog-canonical-v4.json');
const catalogo=require('../../'+dir+'catalog.json');
const {validarCoincidenciaProducto:v}=require('../../src/services/productMatchValidator');
const {seleccionarCatalogoLocal:s}=require('../../src/services/catalogContextService')._internals;
const cl={intencion:'busqueda_producto',perfilContexto:'producto',requiereBusquedaProducto:true};
const evaluate=query=>v({mensaje:query,catalogo:s({catalogo,mensaje:query,clasificacion:cl}).catalogo,clasificacion:cl});
const rows=before.rows.filter(r=>r.outcome==='clarification').map(r=>{
 const result=evaluate(r.query);let classification,explanation;
 if(r.reason==='falta_peso_mascota'){classification='missing_animal_weight';explanation='The original input does not provide body weight; preserve presentation clarification.';}
 else if(r.reason==='identidad_compartida_entre_registros'){classification='different_records_punctuation_only';explanation='Separate IDs have different presentations. Punctuation alone does not establish equivalence.';}
 else if(r.reason==='peso_fuera_de_rangos'){
  if(/(?:MG|ML)$/.test(r.expected)){classification='strength_misread_as_body_weight';explanation='Fixed misleading reason: mg/ml are not animal kg. Body-weight clarification remains, without a dose recommendation.';}
  else {classification='catalog_presentation_mapping_requires_review';explanation='Consolidated reference contains several kg bands in original_names but presentations are mg. Do not infer all mg-to-band mappings from the first reference name; catalog repair requires verified source and authorization.';}
 }else if(/\bCAN\b.* lata$/.test(r.query)){classification='synthetic_input_error_can';explanation='The previous diagnostic incorrectly derived lata from CAN. Exact original query retained here; separate v2 uses unmodified commercial names before and after the fix. CAN is no longer container evidence.';}
 else if(result.nivel==='alta'){classification='avoidable_false_negative_fixed';explanation='Same diagnostic input now identifies its expected reference, without changing gold or catalog.';}
 else {classification='shared_family_needs_variant';explanation='Bare family name also matches distinct commercial variants; do not force the base reference.';}
 return {id:r.id,query:r.query,expected:r.expected,before:{level:'not_high',reason:r.reason},after:{level:result.nivel,reason:result.razon,selected:result.coincidencia?.referenciaCatalogo||result.coincidencia?.referencia||null,nominalIdentityBeforePresentation:result.identidadAntesDePresentacion?.referenciaCatalogo||result.identidadAntesDePresentacion?.referencia||null,clarification:result.aclaracion||null},classification,explanation};
});
const counts=rows.reduce((a,r)=>(a[r.classification]=(a[r.classification]||0)+1,a),{});
const namedConfirmed=rows.filter(r=>r.after.level==='alta'&&r.after.selected===r.expected).length;
const wrong=rows.filter(r=>r.after.level==='alta'&&r.after.selected!==r.expected).length;
const felineRaw='Me podrías enviar tres paquetes del contrato de proplan feline EN';
const feline=[{kind:'frozen_original_input',query:felineRaw},{kind:'manual_context_reconstruction_not_automatic_history',query:'concentrado '+felineRaw}].map(c=>{const r=evaluate(c.query);return {...c,level:r.nivel,reason:r.razon,selected:r.coincidencia?.referencia,weight:r.presentacionSolicitada||null,clarification:r.aclaracion||null};});
const output={scope:'Review of exactly the 42 clarification rows published in Library v4. Same enriched queries retained for comparable results. The separate frozen v2 diagnostic removes generated format hints and has its own before/after.',counts,comparison:{sameCases:42,beforeConfirmed:0,afterConfirmed:namedConfirmed,afterClarifications:rows.filter(r=>r.after.level!=='alta').length,differentFromHistoricalExpected:wrong,invalidSyntheticInputs:3,validInputSubset:{cases:39,confirmed:namedConfirmed,clarifications:rows.filter(r=>r.classification!=='synthetic_input_error_can'&&r.after.level!=='alta').length,differentReferences:rows.filter(r=>r.classification!=='synthetic_input_error_can'&&r.after.level==='alta'&&r.after.selected!==r.expected).length}},feline,rows};
fs.writeFileSync(dir+'clarification-review.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({counts,comparison:output.comparison,feline}));
