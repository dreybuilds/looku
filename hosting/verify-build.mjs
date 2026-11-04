import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import handler from '../.vercel/output/functions/studio.func/index.cjs';

const output = new URL('../.vercel/output/', import.meta.url);
const home = await readFile(new URL('static/index.html', output), 'utf8');
assert.match(home, /<title>looku \/ Wardrobe studio<\/title>/);
assert.ok((await readFile(new URL('static/api/payments/client.js', output))).length);
assert.equal(typeof handler.default, 'function');
console.log('Verified studio homepage, browser signer and server entry point.');
