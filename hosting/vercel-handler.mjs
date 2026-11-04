import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {get, put, del, list, BlobPreconditionFailedError, issueSignedToken, presignUrl} from '@vercel/blob';
import worker from './worker.mjs';
import {session} from './account.mjs';

const orders = {
  async get(key) {
    const result = await get(key, {access: 'private', useCache: false});
    if (!result) return null;
    const response = new Response(result.stream);
    return {etag: result.blob.etag, body: result.stream, json: () => response.json(), text: () => response.text()};
  },
  async put(key, value, {onlyIf} = {}) {
    const createOnly = onlyIf?.etagDoesNotMatch === '*';
    try {
      return await put(key, value, {access: 'private', addRandomSuffix: false,
        allowOverwrite: !createOnly, ifMatch: onlyIf?.etagMatches});
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError || (createOnly && /already exists/i.test(error.message))) return null;
      throw error;
    }
  },
  delete: key => del(key),
  async list(options) {
    const page = await list(options);
    return {objects: page.blobs.map(blob => ({key: blob.pathname})), truncated: page.hasMore, cursor: page.cursor};
  }
};

export default async function handler(req, res) {
  const url = new URL(req.url, 'https://' + req.headers.host);
  const headers = new Headers(req.headers);
  headers.delete('oai-authenticated-user-id');
  let response;
  if (url.pathname === '/api/wardrobe-backup' || url.pathname === '/api/pinterest/search') {
    const user = await session(new Request(url, {headers}), orders);
    if (user) headers.set('oai-authenticated-user-id', user.address);
    if (url.pathname === '/api/wardrobe-backup' && req.method === 'POST') {
      if (!user || headers.get('origin') !== url.origin || headers.get('x-looku-action') !== 'wardrobe-backup') {
        response = new Response(null, {status: user ? 403 : 401});
      } else {
        const pathname = 'wardrobe-backups/' + user.address;
        const constraints = {maximumSizeInBytes: 12 * 1024 * 1024, allowedContentTypes: ['application/octet-stream']};
        const token = await issueSignedToken({pathname, operations: ['put'], validUntil: Date.now() + 60000, ...constraints});
        response = Response.json(await presignUrl(token, {operation: 'put', pathname, access: 'private', allowOverwrite: true, addRandomSuffix: false, ...constraints}));
      }
    }
  }
  if (!response) {
    const request = new Request(url, {method: req.method, headers,
      ...(['GET', 'HEAD'].includes(req.method) ? {} : {body: Readable.toWeb(req), duplex: 'half'})});
    response = await worker.fetch(request, {...process.env, ORDERS: orders});
  }
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.setHeader('Cache-Control', 'private, no-store');
  if (response.body) await pipeline(Readable.fromWeb(response.body), res);
  else res.end();
}
