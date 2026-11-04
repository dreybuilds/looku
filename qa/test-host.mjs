// Exercises the production worker against a fresh bucket, never the owner's backups.
import http from 'node:http';
import worker from '../dist/server/index.js';
// Ephemeral signing keys and test tokens exist only in this loopback QA server.
const testKeys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const publicKey={...await crypto.subtle.exportKey('jwk',testKeys.publicKey),alg:'ES256',kid:'qa'};
const appId='cmw1wdo5z03jo0glaw4lke860';
const realFetch=globalThis.fetch;
globalThis.fetch=(url,...args)=>String(url)==='https://auth.privy.io/api/v1/apps/'+appId+'/jwks.json'
 ? Promise.resolve(Response.json({keys:[publicKey]})):realFetch(url,...args);
async function testToken(){
 const now=Math.floor(Date.now()/1000),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const payload={iss:'privy.io',aud:appId,sub:'did:privy:'+crypto.randomUUID(),sid:crypto.randomUUID(),iat:now,exp:now+300};
 const content=encode({alg:'ES256',kid:'qa'})+'.'+encode(payload);
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},testKeys.privateKey,Buffer.from(content));
 return content+'.'+Buffer.from(signature).toString('base64url');
}
const rows=new Map();
const bucket={
 async get(key){
   const stored=rows.get(key);if(!stored)return null;
   return {etag:stored.etag,body:stored.bytes,json:()=>JSON.parse(new TextDecoder().decode(stored.bytes)),text:()=>new TextDecoder().decode(stored.bytes)};
 },
 async put(key,value,options={}){
   const existing=rows.get(key),condition=options.onlyIf;
   if(condition?.etagDoesNotMatch==='*' && existing || condition?.etagMatches && condition.etagMatches!==existing?.etag)return null;
   const entry={etag:crypto.randomUUID(),bytes:typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value)};
   rows.set(key,entry);return {etag:entry.etag};
 },
 async list({prefix,limit,cursor}){
   const keys=[...rows.keys()].filter(key=>key.startsWith(prefix)).sort();
   const offset=Number(cursor||0),slice=keys.slice(offset,offset+limit);
   return {objects:slice.map(key=>({key})),truncated:offset+limit<keys.length,cursor:String(offset+limit)};
 },
 async delete(key){rows.delete(key)}
};
const host='http://127.0.0.1:4315';
http.createServer(async(req,res)=>{
 try{
   if(req.url==='/qa-privy-token'){res.end(await testToken());return}
   const bytes=[];for await(const chunk of req)bytes.push(chunk);
   const headers=new Headers(req.headers);
   headers.set('oai-authenticated-user-id','disposable-qa-viewer');
   const result=await worker.fetch(new Request(host+req.url,{method:req.method,headers,body:bytes.length?Buffer.concat(bytes):undefined}),{ORDERS:bucket});
   res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.writeHead(500);res.end()}
}).listen(4315,'127.0.0.1');
