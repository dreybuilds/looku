// Exercises the production worker against a fresh bucket, never the owner's backups.
import http from 'node:http';
import worker from '../dist/server/index.js';
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
 async delete(key){rows.delete(key)}
};
const host='http://127.0.0.1:4315';
http.createServer(async(req,res)=>{
 try{
   const bytes=[];for await(const chunk of req)bytes.push(chunk);
   const headers=new Headers(req.headers);
   headers.set('oai-authenticated-user-id','disposable-qa-viewer');
   const result=await worker.fetch(new Request(host+req.url,{method:req.method,headers,body:bytes.length?Buffer.concat(bytes):undefined}),{ORDERS:bucket});
   res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.writeHead(500);res.end()}
}).listen(4315,'127.0.0.1');
