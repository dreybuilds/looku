// Serves a single origin for wardrobe storage, Freighter and checkout.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { spawn } from 'node:child_process';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const port=Number(process.env.PORT||4173), apiPort=Number(process.env.PAYMENT_PORT||4174);
const service=spawn(process.execPath,['--env-file-if-exists=.env','server.mjs'],{cwd:fileURLToPath(new URL('./payments/',import.meta.url)),env:{...process.env,PORT:String(apiPort),LOOKU_API_ORIGIN:'http://127.0.0.1:'+port},stdio:'inherit'});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary'};
const server=http.createServer(async(req,res)=>{
 try{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname.startsWith('/api/payments/')){
 const proxy=http.request({hostname:'127.0.0.1',port:apiPort,path:req.url,method:req.method,headers:req.headers},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res)});
 proxy.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'text/plain'});res.end('Testnet checkout service unavailable. See README setup steps.')});req.pipe(proxy);return
 }
 if(pathname==='/api/pinterest/search'||pathname==='/api/wardrobe-backup'){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Use the signed-in hosted studio for online features.'}));return}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
 const file=resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(resolve(root)+sep)){res.writeHead(403);res.end();return}
 const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404);res.end('Not found')}
});
server.listen(port,'127.0.0.1',()=>console.log('looku studio http://127.0.0.1:'+port));
for(const sig of ['SIGTERM','SIGINT'])process.once(sig,()=>{service.kill();server.close(()=>process.exit())});
server.on('error',err=>{service.kill();console.error(err.message);process.exit(1)});
