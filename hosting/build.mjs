import { build } from '../payments/node_modules/esbuild/lib/main.js';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=['index.html','style.css','app.js','wallet.js','local-wallet.js','model.js','garments.js','stores.json','device.js','sw.js','app.webmanifest','icon-192.png','icon-512.png','orchid-portrait.webp','orchid-detail.webp','looku-orchid.webp','orchid-turn.webp','orchid-frames.glb'];
const types={html:'text/html; charset=utf-8',css:'text/css',js:'text/javascript',json:'application/json',webmanifest:'application/manifest+json',png:'image/png',webp:'image/webp',glb:'model/gltf-binary'};
const assets={};
for(const name of files){assets['/'+name]=[types[name.split('.').pop()],await readFile(resolve(root,'dist',name),/\.(png|webp|glb)$/.test(name)?'base64':'utf8')]}
assets['/']=assets['/index.html'];
assets['/api/payments/client.js']=['text/javascript',await readFile(resolve(root,'payments/build/client.js'),'utf8')];
await mkdir(resolve(root,'dist/.openai'),{recursive:true});
await copyFile(resolve(root,'.openai/hosting.json'),resolve(root,'dist/.openai/hosting.json'));
await build({absWorkingDir:root,entryPoints:['hosting/worker.mjs'],outfile:'dist/server/index.js',bundle:true,minify:true,format:'esm',platform:'browser',nodePaths:[resolve(root,'payments/node_modules')],inject:['payments/buffer.mjs'],define:{global:'globalThis','process.env.NODE_ENV':'"production"'},plugins:[{name:'public-assets',setup(b){b.onResolve({filter:/^looku:public$/},()=>({path:'assets',namespace:'looku'}));b.onLoad({filter:/.*/,namespace:'looku'},()=>({contents:JSON.stringify(assets),loader:'json'}))}}]});
