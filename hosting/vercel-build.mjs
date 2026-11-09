import {build} from '../payments/node_modules/esbuild/lib/main.js';
import {cp, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const out = '.vercel/output';
const fn = path.join(out, 'functions/studio.func');
const site = path.join(out, 'static');
await mkdir(fn, {recursive: true});
await cp('dist', site, {recursive: true, filter: file => !['server', '.openai'].includes(path.basename(file))});
await mkdir(path.join(site, 'api/payments'), {recursive: true});
await cp('payments/build/privy.js',path.join(site,'privy.js'));
await cp('payments/build/client.js', path.join(site, 'api/payments/client.js'));
await build({
  entryPoints: ['hosting/vercel-handler.mjs'], outfile: path.join(fn, 'index.cjs'),
  platform: 'node', format: 'cjs', target: 'node24', bundle: true, minify: false,
  nodePaths: [path.resolve('payments/node_modules')],
  plugins: [{name: 'static-files-served-by-vercel', setup(build) {
    build.onResolve({filter: /^looku:public$/}, () => ({path: 'empty', namespace: 'assets'}));
    build.onLoad({filter: /.*/, namespace: 'assets'}, () => ({contents: '{}', loader: 'json'}));
  }}]
});
await writeFile(path.join(fn, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs24.x', handler: 'index.cjs', launcherType: 'Nodejs', shouldAddHelpers: false,
  supportsResponseStreaming: true, maxDuration: 60
}));
const adminHost=[{type:'host',value:'admin.lookuwear.xyz'}];
// Match the host before Vercel serves any shopper files or API routes.
const adminAssets='earnings\\.js|ui\\.js|ui\\.css|bookings\\.js|admin\\.js|support\\.js|email-auth\\.js|local-wallet\\.js|privy\\.js|style\\.css|api/payments/client\\.js';
const adminApi='api/admin/[^?]*|api/account(?:/(?:verify|challenge|logout))?|api/community/session';
const ownerRoutes=[
  {src:'^/(?:index\\.html|owner\\.html)?$',has:adminHost,dest:'/owner.html'},
  {src:'^/sw\\.js$',has:adminHost,dest:'/owner-sw.js',headers:{'Cache-Control':'no-store'}},
  {src:'^/(?!(?:'+adminAssets+'|'+adminApi+')$).*$',has:adminHost,status:404}
];
// Merchant hosts serve a storefront and public store data. Management stays on the main site.
const merchantHost=[{type:'host',value:'(?!admin\\.|www\\.)[a-z0-9-]+\\.lookuwear\\.xyz'}];
const merchantAssets='ui\\.css|ui\\.js|storefront\\.js|merchant-stores\\.js|store-branding\\.js|features\\.js|email-auth\\.js|style\\.css';
const merchantRoutes=[
  {src:'^/$',has:merchantHost,dest:'/storefront.html'},
  {src:'^/api/merchant-stores/[^?]*$',has:merchantHost,dest:'/studio'},
  {src:'^/(?!(?:'+merchantAssets+')$).*$',has:merchantHost,status:404}
];
await writeFile(path.join(out, 'config.json'), JSON.stringify({
  version: 3, routes: [...ownerRoutes,...merchantRoutes,{src:'^/store/[a-z0-9-]+/?$',dest:'/storefront.html'},{src: '^/app/?$', dest: '/studio.html'}, {src: '^/privacy-policy/?$', dest: '/privacy-policy.html'}, {handle: 'filesystem'}, {src: '^/api/(.*)$', dest: '/studio'}]
}));
