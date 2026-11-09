import { build } from '../payments/node_modules/esbuild/lib/main.js';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=['earnings.js','ui.js','ui.css','design-system.html','design-system.js','index.html','owner.html','storefront.html','storefront.js','merchant-stores.js','store-branding.js','studio.html','welcome.js','landing.css','style.css','vendor/bootstrap-components.css','vendor/bootstrap-LICENSE.txt','app.js','features.js','bookings.js','wishlist.js','merchant-payment.js','shopping.js','community.js','social.js','pinterest.js','inspiration.js','inspiration-data.js','pinterest-board.html','pinterest-board.js','email-auth.js','admin.js','support.js','wallet.js','stellar-wallet.js','local-wallet.js','model.js','style-options.js','choice-picker.js','look-prompt.js','garments.js','stores.json','device.js','sw.js','app.webmanifest','icon-192.png','icon-512.png','orchid-portrait.webp','orchid-detail.webp','looku-orchid.webp','orchid-turn.webp','sample1.webp','sample2.webp','sample3.webp','sample4.webp','orchid-frames.glb'];
const types={txt:'text/plain',html:'text/html; charset=utf-8',css:'text/css',js:'text/javascript',json:'application/json',webmanifest:'application/manifest+json',png:'image/png',webp:'image/webp',glb:'model/gltf-binary'};
const assets={};
for(const name of files){assets['/'+name]=[types[name.split('.').pop()],await readFile(resolve(root,'dist',name),/\.(png|webp|glb)$/.test(name)?'base64':'utf8')]}
assets['/privy.js']=['text/javascript',await readFile(resolve(root,'payments/build/privy.js'),'utf8')];
assets['/app']=assets['/app/']=assets['/studio.html'];
assets['/']=assets['/index.html'];
assets['/api/payments/client.js']=['text/javascript',await readFile(resolve(root,'payments/build/client.js'),'utf8')];
await mkdir(resolve(root,'dist/.openai'),{recursive:true});
await copyFile(resolve(root,'.openai/hosting.json'),resolve(root,'dist/.openai/hosting.json'));
await build({absWorkingDir:root,entryPoints:['hosting/worker.mjs'],outfile:'dist/server/index.js',bundle:true,minify:true,format:'esm',platform:'browser',nodePaths:[resolve(root,'payments/node_modules')],inject:['payments/buffer.mjs'],define:{global:'globalThis','process.env.NODE_ENV':'"production"'},plugins:[{name:'public-assets',setup(b){b.onResolve({filter:/^looku:public$/},()=>({path:'assets',namespace:'looku'}));b.onLoad({filter:/.*/,namespace:'looku'},()=>({contents:JSON.stringify(assets),loader:'json'}))}}]});
