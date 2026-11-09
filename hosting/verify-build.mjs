import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import handler from '../.vercel/output/functions/studio.func/index.cjs';

const output = new URL('../.vercel/output/', import.meta.url);
const home = await readFile(new URL('static/index.html', output), 'utf8');
assert.match(home, /<title>looku \/ Your personal wardrobe studio<\/title>/);
assert.match(home, /href="\/privacy-policy"/);
const config = JSON.parse(await readFile(new URL('config.json', output), 'utf8'));
const policyRoute = config.routes.find(route => !route.has && route.src && new RegExp(route.src).test('/privacy-policy'));
assert.ok(policyRoute?.dest, 'The public privacy URL must resolve to a built page.');
const policy = await readFile(new URL('static' + policyRoute.dest, output), 'utf8');
assert.match(policy, /<h1>Privacy policy<\/h1>/);
assert.ok((await readFile(new URL('static/api/payments/client.js', output))).length);
assert.ok((await readFile(new URL('static/privy.js', output))).length);
assert.ok(home.includes('href="/app"'));
const appRoute = config.routes.find(route => !route.has && route.src && new RegExp(route.src).test('/app'));
const studio = await readFile(new URL('static' + appRoute.dest, output), 'utf8');
assert.match(studio, /href="#community"/);
assert.equal(typeof handler.default, 'function');
console.log('Verified studio homepage, browser signer and server entry point.');
for(const file of ['landing.js','experience.js'])assert.ok((await readFile(new URL('static/'+file,output))).length);
assert.match(home,/src="\/landing.js"/);
assert.match(home,/data-experience-switch/);
assert.match(studio,/data-experience-switch/);

// Host rules must run before public files or the general API route can match.
function explicitRoute(host,path){
  return config.routes.find(route=>route.src&&new RegExp(route.src).test(path)&&
    (!route.has||route.has.every(rule=>rule.type==='host'&&new RegExp('^(?:'+rule.value+')$').test(host))));
}
assert.equal(explicitRoute('samaiahs.lookuwear.xyz','/').dest,'/storefront.html');
assert.equal(explicitRoute('samaiahs.lookuwear.xyz','/api/merchant-stores/samaiahs/products').dest,'/studio');
for(const path of ['/app','/owner.html','/api/admin/access','/api/account','/api/features','/privy.js']){
  assert.equal(explicitRoute('samaiahs.lookuwear.xyz',path).status,404,'Tenant must block '+path);
}
for(const path of ['/ui.css','/ui.js','/storefront.js','/merchant-stores.js','/store-branding.js','/features.js','/email-auth.js','/style.css']){
  assert.equal(explicitRoute('samaiahs.lookuwear.xyz',path),undefined,'Storefront asset must reach filesystem: '+path);
  assert.ok((await readFile(new URL('static'+path,output))).length);
}
assert.equal(explicitRoute('admin.lookuwear.xyz','/').dest,'/owner.html');
assert.equal(explicitRoute('admin.lookuwear.xyz','/store/samaiahs').status,404);
assert.equal(explicitRoute('admin.lookuwear.xyz','/api/merchant-stores/mine').status,404);
assert.equal(explicitRoute('www.lookuwear.xyz','/'),undefined);
assert.equal(explicitRoute('lookuwear.xyz','/app').dest,'/studio.html');
assert.equal(explicitRoute('lookuwear.xyz','/store/samaiahs').dest,'/storefront.html');
console.log('Verified merchant subdomains, storefront assets and admin host isolation.');

for(const file of (await readdir(new URL('static/fonts/',output))).filter(name=>name.endsWith('.ttf'))){
 const path='/fonts/'+file;
 assert.equal(explicitRoute('admin.lookuwear.xyz',path),undefined,'Admin font must reach filesystem: '+path);
 const bytes=await readFile(new URL('static'+path,output));
 assert.equal(bytes.readUInt32BE(0),0x00010000,'Font must retain its TrueType binary header: '+path);
}
assert.equal(explicitRoute('admin.lookuwear.xyz','/fonts/private.json').status,404);
console.log('Verified locally hosted fonts and the admin font allowlist.');

assert.match(studio,/href="\/ui.css"/);
assert.ok((await readFile(new URL('static/ui.css',output))).length);
assert.equal(explicitRoute('admin.lookuwear.xyz','/ui.css'),undefined);

for(const asset of ['/earnings.js','/ui.js']){
 assert.equal(explicitRoute('admin.lookuwear.xyz',asset),undefined);
 assert.ok((await readFile(new URL('static'+asset,output))).length);
}
assert.equal(explicitRoute('admin.lookuwear.xyz','/ui.js'),undefined);
for(const file of (await readdir(new URL('static/',output))).filter(name=>name.endsWith('.html'))){
  assert.match(await readFile(new URL('static/'+file,output),'utf8'),/href="\/ui.css"/,'Shared layout missing from '+file);
}
