// Administrative proposals/reviews. Requires explicit --apply for writes.
// Do not execute against production without the user's separate approval.
require('dotenv').config({quiet:true});
const fs=require('node:fs');
const {requestSupabase}=require('../src/repositories/supabaseClient');
const uuid=s=>/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s||'');
async function main(){
  const [action,client,id,file,...flags]=process.argv.slice(2);
  if(!['propose','approve','reject','revoke'].includes(action)||!uuid(client)) throw Error('Uso: ACTION CLIENT_UUID EVIDENCE_UUID|- REVISION.json [--apply]');
  const input=JSON.parse(fs.readFileSync(file,'utf8'));
  let payload,path='product_identity_evidence',method;
  if(action==='propose'){
    if(!uuid(input.reference_id)||!uuid(input.source_message_id)||typeof input.alias!=='string'||input.alias.length<4||input.alias.length>300) throw Error('Propuesta inválida');
    payload={client_id:client,reference_id:input.reference_id,source_message_id:input.source_message_id,alias:input.alias,status:'pending'};
    method='POST';
  }else{
    if(!uuid(id)||typeof input.reviewed_by!=='string'||input.reviewed_by.trim().length<3||typeof input.review_reason!=='string'||input.review_reason.trim().length<20) throw Error('Revisión requiere ID, autor y justificación verificable');
    payload={status:{approve:'approved',reject:'rejected',revoke:'revoked'}[action],reviewed_by:input.reviewed_by,review_reason:input.review_reason};
    path+=`?client_id=eq.${client}&id=eq.${id}`;method='PATCH';
  }
  if(flags.length&&!flags.every(f=>f==='--apply')) throw Error('Opción desconocida');
  if(!flags.includes('--apply')) {console.log(JSON.stringify({mode:'dry-run',action,method,fields:Object.keys(payload),writes:0}));return;}
  if(method==='PATCH'){
    const rows=await requestSupabase(path+'&select=status,reviewed_at');
    if(rows?.length!==1) throw Error('Evidencia no encontrada para esta empresa');
    path+=`&status=eq.${rows[0].status}&reviewed_at=${rows[0].reviewed_at?'eq.'+encodeURIComponent(rows[0].reviewed_at):'is.null'}`;
  }
  const rows=await requestSupabase(path,{method,headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
  if(rows?.length!==1) throw Error('Resultado no confirmado; consulta el estado antes de reintentar');
  console.log(JSON.stringify({id:rows[0].id,status:rows[0].status}));
}
main().catch(()=>{console.error('No se completó la operación. Revisa parámetros, acceso y estado; no reintentes una escritura incierta sin comprobarla.');process.exitCode=1;});
