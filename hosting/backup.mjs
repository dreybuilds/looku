export async function backup(request,env){
 const reply=(status,msg)=>new Response(msg,{status,headers:{'Cache-Control':'no-store'}});
 const account=request.headers.get('oai-authenticated-user-id');
 if(!account)return reply(401,'Sign in first');
 if(request.headers.get('X-Looku-Action')!=='wardrobe-backup'||(request.headers.has('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin))return reply(403,'Invalid request');
 const key='wardrobe-backups/'+encodeURIComponent(account);
 if(request.method==='GET'){const item=await env.ORDERS.get(key);return item?new Response(item.body,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}):reply(404,'Backup not found')}
 if(request.method==='DELETE'){await env.ORDERS.delete(key);return reply(204,null)}
 if(request.method!=='PUT')return reply(405,'Unsupported method');
 const limit=12*1024*1024;
 if(Number(request.headers.get('Content-Length'))>limit)return reply(413,'Too large');
 if(!request.body)return reply(400,'Empty backup');
 const reader=request.body.getReader(),chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();return reply(413,'Too large')}chunks.push(value)}
 const blob=new Blob(chunks);
 if(size<49||await blob.slice(0,4).text()!=='LKU1')return reply(400,'Invalid encrypted snapshot');
 await env.ORDERS.put(key,await blob.arrayBuffer());
 return reply(204,null);
}
