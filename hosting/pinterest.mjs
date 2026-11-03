// Only text explicitly submitted in the Pinterest search form leaves the device.
const endpoint='https://api.pinterest.com/mcp';
async function parseReply(r,id){
 if(r.headers.get('Content-Type')?.includes('text/event-stream')){
  const frames=(await r.text()).replaceAll('\r\n','\n').split('\n\n');
  for(const frame of frames){const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(data){const msg=JSON.parse(data);if(msg.id===id)return msg}}
  throw Error('Incomplete MCP response');
 }
 return r.json();
}
export async function searchPins(request,env){
 const answer=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(request.method!=='POST')return answer(405,{error:'Use the Pinterest search form.'});
 if(request.headers.get('Origin')!==new URL(request.url).origin)return answer(403,{error:'Open Pinterest search in looku.'});
 // Bind a privately provisioned token to its owner before allowing any tool call.
 if(!env.PINTEREST_ACCESS_TOKEN||!env.PINTEREST_OWNER_ID||request.headers.get('oai-authenticated-user-id')!==env.PINTEREST_OWNER_ID)return answer(503,{error:'Pinterest MCP is waiting for an authorized Pinterest connection. You can still use a reference photo on this device.'});
 const {query}=await request.json();
 if(typeof query!=='string'||!query.trim()||query.length>120)return answer(400,{error:'Enter a search of 1–120 characters.'});
 let session,version='2025-03-26',seq=0;
 async function rpc(method,params,notification=false){
  const id=++seq;
  const headers={Authorization:'Bearer '+env.PINTEREST_ACCESS_TOKEN,'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
  if(method!=='initialize')headers['MCP-Protocol-Version']=version;
  if(session)headers['Mcp-Session-Id']=session;
  const r=await fetch(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers,body:JSON.stringify({jsonrpc:'2.0',...(notification?{}:{id}),method,params})});
  if(!r.ok)throw Error('Pinterest MCP returned '+r.status);
  session=r.headers.get('Mcp-Session-Id')||session;if(notification)return;
  const msg=await parseReply(r,id);if(msg.error||msg.id!==id)throw Error('Pinterest could not process the request.');return msg.result;
 }
 try{
  const init=await rpc('initialize',{protocolVersion:version,capabilities:{},clientInfo:{name:'looku',version:'1.0'}});
  version=init.protocolVersion;await rpc('notifications/initialized',{},true);
  let cursor,tool,field;
  for(let page=0;page<5&&!tool;page++){
   const list=await rpc('tools/list',cursor?{cursor}:{});
   for(const candidate of list.tools||[]){
    if(!['searchpins','pinssearch','searchuserpins','searchpartnerpins'].includes(candidate.name.toLowerCase().replace(/[^a-z]/g,'')))continue;
    const schema=candidate.inputSchema||{},key=['query','q','search_query'].find(k=>schema.properties?.[k]?.type==='string');
    if(key&&!(schema.required||[]).some(k=>k!==key)){tool=candidate;field=key;break}
   }
   cursor=list.nextCursor;if(!cursor)break;
  }
  if(!tool)return answer(501,{error:'This Pinterest connection does not expose a supported Pin search tool.'});
  const result=await rpc('tools/call',{name:tool.name,arguments:{[field]:query.trim()}});
  if(result.isError)throw Error('Pinterest search failed.');
  const pins=new Map();
  function collect(value){
   if(!value||typeof value!=='object'||pins.size>=12)return;
   if(Array.isArray(value)){value.forEach(collect);return}
   const id=String(value.pin_id||value.id||'');
   if(/^\d{5,24}$/.test(id)&&(value.title||value.media||value.pin_id)){pins.set(id,{id,title:String(value.title||'Pinterest Pin').slice(0,150),color:/^#[0-9a-f]{6}$/i.test(value.dominant_color)?value.dominant_color:null});return}
   for(const child of Object.values(value))collect(child);
  }
  collect(result.structuredContent);for(const part of result.content||[])if(part.type==='text'){try{collect(JSON.parse(part.text))}catch{/* Unstructured content is not a Pin record. */}}
  return answer(200,{pins:[...pins.values()]});
 }catch{return answer(502,{error:'Pinterest MCP could not complete the search. Check the connection and access scopes.'})}
}
