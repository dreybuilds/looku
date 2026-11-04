import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import handler from '../.vercel/output/functions/studio.func/index.cjs';

const output = new URL('../.vercel/output/', import.meta.url);
const home = await readFile(new URL('static/index.html', output), 'utf8');
assert.match(home, /<title>looku \/ Wardrobe studio<\/title>/);
assert.match(home, /href="\/privacy-policy"/);
const config = JSON.parse(await readFile(new URL('config.json', output), 'utf8'));
const policyRoute = config.routes.find(route => !route.has && route.src && new RegExp(route.src).test('/privacy-policy'));
assert.ok(policyRoute?.dest, 'The public privacy URL must resolve to a built page.');
const policy = await readFile(new URL('static' + policyRoute.dest, output), 'utf8');
assert.match(policy, /<h1>Privacy policy<\/h1>/);
assert.ok((await readFile(new URL('static/api/payments/client.js', output))).length);
assert.ok((await readFile(new URL('static/privy.js', output))).length);
assert.match(home, /href="#community"/);
assert.equal(typeof handler.default, 'function');
console.log('Verified studio homepage, browser signer and server entry point.');
