import {build} from '../payments/node_modules/esbuild/lib/main.js';
import {cp, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const out = '.vercel/output';
const fn = path.join(out, 'functions/studio.func');
const site = path.join(out, 'static');
await mkdir(fn, {recursive: true});
await cp('dist', site, {recursive: true, filter: file => !['server', '.openai'].includes(path.basename(file))});
await mkdir(path.join(site, 'api/payments'), {recursive: true});
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
await writeFile(path.join(out, 'config.json'), JSON.stringify({
  version: 3, routes: [{src: '^/privacy-policy/?$', dest: '/privacy-policy.html'}, {handle: 'filesystem'}, {src: '^/api/(.*)$', dest: '/studio'}]
}));
