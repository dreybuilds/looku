import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { URL, fileURLToPath } from 'node:url'
import { checkout, makeChain, HttpError } from './checkout.mjs'
import { BASE, NETWORK } from './common.mjs'

const bytes = value => Buffer.from(JSON.stringify(value)).toString('base64')
export function service(shop,{origin='http://127.0.0.1:4020', allowedOrigin}={}) {
  return createServer({maxHeaderSize:32768},async (req,res) => {
    const json = (status,value,headers={}) => {
      res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers})
      res.end(JSON.stringify(value))
    }
    try {
      const url = new URL(req.url,origin)
      const path = url.pathname
      if (req.headers.origin && req.headers.origin !== new URL(origin).origin && req.headers.origin !== allowedOrigin)
        throw new HttpError(403,'This origin is not enabled for checkout.')
      if (req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin',req.headers.origin)
        res.setHeader('Vary','Origin')
        res.setHeader('Access-Control-Allow-Headers','content-type,payment-signature')
        res.setHeader('Access-Control-Expose-Headers','payment-required,payment-response')
        res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS')
      }
      if (req.method === 'OPTIONS') return json(204,{})
      if (path === BASE + '/client.js' && req.method === 'GET') {
        const client = await readFile(new URL('./build/client.js',import.meta.url))
        res.writeHead(200,{'Content-Type':'text/javascript'}); return res.end(client)
      }
      if (path === BASE + '/catalog' && req.method === 'GET') return json(200,shop.catalog)
      if (path === BASE + '/orders' && req.method === 'POST') {
        let body = ''
        for await (const part of req) {
          body += part
          if (body.length > 2048) throw new HttpError(413,'Order request is too large.')
        }
        let order
        try {order = JSON.parse(body)} catch {throw new HttpError(400,'Invalid order JSON.')}
        return json(201,shop.create(order?.sku,order?.address))
      }
      const route = path.match(/^\/api\/payments\/orders\/([a-f0-9-]{36})(\/checkout)?$/)
      if (!route) throw new HttpError(404,'Route not found.')
      const [,id,pay] = route
      if (!pay && req.method === 'GET') return json(200,shop.receipt(id))
      if (!pay || req.method !== 'POST') throw new HttpError(405,'Unsupported HTTP method.')
      const resource = {url:new URL(path,origin).href,description:'looku demo cropped jacket',mimeType:'application/json'}
      const order = shop.receipt(id)
      let receipt = order
      if (order.status === 'awaiting_signature') {
        const encoded = req.headers['payment-signature']
        if (!encoded) {
          const challenge = {x402Version:2,resource,accepts:[shop.offer]}
          return json(402,challenge,{'Payment-Required':bytes(challenge)})
        }
        let payload
        try {payload = JSON.parse(Buffer.from(encoded,'base64').toString('utf8'))}
        catch {throw new HttpError(400,'Invalid x402 payment header.')}
        receipt = await shop.pay(id,payload,resource)
      }
      const headers = receipt.purchaseTx ? {'Payment-Response':bytes({success:true,network:NETWORK,
        transaction:receipt.purchaseTx,payer:receipt.address})} : {}
      return json(200,receipt,headers)
    } catch (err) {
      if (!err.status) console.error('Payment service error:',err.name)
      return json(err.status || 503,{error:err.status ? err.message : 'Unable to contact Stellar Testnet. Check your receipt for payment status.'})
    }
  })
}
if (import.meta.main) {
  const dir = fileURLToPath(new URL('./.data/',import.meta.url))
  mkdirSync(dir,{recursive:true,mode:0o700})
  const shop = checkout({file:dir + '/orders.sqlite',chain:makeChain(process.env)})
  const port = Number(process.env.PORT || 4020)
  let restoring = false
  setInterval(async () => {
    if (restoring) return
    restoring = true
    try { await shop.resume() } finally { restoring = false }
  },6000).unref()
  service(shop,{origin:process.env.LOOKU_API_ORIGIN || 'http://127.0.0.1:' + port,
    allowedOrigin:process.env.LOOKU_UI_ORIGIN}).listen(port,process.env.LOOKU_BIND || '127.0.0.1',() => console.log('looku testnet checkout listening on port ' + port))
}
