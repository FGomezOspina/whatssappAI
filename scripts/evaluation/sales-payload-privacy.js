const fs=require('node:fs'),crypto=require('node:crypto');
const sha=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
function reviewPayload(body,{forbidden=[],secrets=[]}={}){
  const text=JSON.stringify(body),issues=[];
  for(const value of [...forbidden,...secrets].filter(v=>typeof v==='string'&&v.length>=5))
    if(text.includes(value))issues.push('Private source value or credential detected');
  if(/wamid\.|eventKey|channel_user_id|mediaId|image_url|data:image|sediment:|download_url|Bearer\s/i.test(text))issues.push('Source identifier, media or credential marker');
  const emails=[...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[])];
  if(emails.some(x=>!x.endsWith('@example.com')))issues.push('Non-synthetic email');
  const longNumbers=[...new Set(text.match(/\b\d{10,}\b/g)||[])];
  if(longNumbers.some(x=>!['3000000000'].includes(x)))issues.push('Unreviewed long numeric identifier');
  const uuids=[...new Set(text.match(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi)||[])];
  if(uuids.length)issues.push('Unnecessary UUID in model payload');
  if(issues.length)throw Error([...new Set(issues)].join('; '));
  return {sha256:sha(body),model:body.model,topLevelFields:Object.keys(body),roles:(body.messages||[]).map(m=>m.role),
    contentCharacters:(body.messages||[]).reduce((n,m)=>n+JSON.stringify(m.content).length,0),emails,longNumbers,
    privateSourceMatch:false,credentialMatch:false,media:false};
}
function sourceDenylist(dir){
  const o=JSON.parse(fs.readFileSync(dir+'/private/observation.json'));
  return o.threads.flatMap(t=>[t.user,...t.messages.flatMap(m=>[m.id,m.metadata?.turnId,m.metadata?.eventKey]),
    ...Object.values(t.state?.[0]?.state?.datosDomicilio||{})]);
}
module.exports={reviewPayload,sourceDenylist,sha};
