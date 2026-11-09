// Expose only a member's own funding attempts, never the provider's phone or receipt data.
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
import {paused,pausedReply} from './features.mjs';
export async function wishlistMpesa(req,env,owner){
  const url=new URL(req.url);
  if(url.pathname==='/api/wishlist-mpesa'&&req.method==='GET')return reply(200,{enabled:Boolean(env.MINISEND_API_KEY)&&!await paused(env.ORDERS,'mpesa')});
  if(!env.MINISEND_API_KEY)return reply(503,{error:'Tracked M-Pesa funding is unavailable.'});
  if(!owner)return reply(401,{error:'Sign in with email in Account to fund an item with M-Pesa.'});
  const id=url.pathname.slice('/api/wishlist-mpesa/'.length);
  if(!uuid.test(id))return reply(404,{error:'Unknown funding attempt.'});
  const key='mpesa-wishlist/'+id;
  const headers={Authorization:'Bearer '+env.MINISEND_API_KEY,'Content-Type':'application/json'};
  const orders='https://merchant.minisend.xyz/api/onramp/orders';
  let record=await env.ORDERS.get(key),row=record&&await record.json();
  if(row&&row.owner!==owner)return reply(403,{error:'Sign in with the account that started this payment.'});
  if(req.method==='POST'){
    if(req.headers.get('origin')!==url.origin||req.headers.get('x-looku-action')!=='wishlist-mpesa')return reply(403,{error:'Open this item in Lookuwear.'});
    const {phone,kes,address}=await req.json();
    if(!/^(?:0|\+?254)[17]\d{8}$/.test(phone)||!Number.isSafeInteger(kes)||kes<=0||kes>250000||
      !/^0x[0-9a-f]{40}$/.test(address)||/^0x0{40}$/.test(address))return reply(400,{error:'Enter a Kenyan mobile number and a valid KES amount.'});
    if(!row&&await paused(env.ORDERS,'mpesa'))return pausedReply();
    if(!row){
      row={owner,address,kes,reference:'wish-'+crypto.randomUUID()};
      record=await env.ORDERS.put(key,JSON.stringify(row),{onlyIf:{etagDoesNotMatch:'*'}});
      if(!record)return reply(409,{error:'This payment request is being prepared. Retry this request.'});
    }
    if(row.address!==address||row.kes!==kes)return reply(409,{error:'Payment details have changed.'});
    if(!row.orderId){
      const result=await fetch(orders,{method:'POST',headers:{...headers,'Idempotency-Key':row.reference},redirect:'error',signal:AbortSignal.timeout(12000),
        body:JSON.stringify({phone,currency:'KES',amount_kes:kes,address,reference:row.reference})});
      if(result.status===400||result.status===403)return reply(result.status,{error:result.status===400?'MiniSend rejected the number or amount.':'MiniSend has not enabled onramp for this merchant.'});
      if(!result.ok)return reply(503,{error:'Could not confirm whether the prompt was sent. Retry this same request.'});
      const order=await result.json();
      if(!uuid.test(order.order_id)||order.external_reference!==row.reference)throw Error('Invalid provider order');
      row.orderId=order.order_id;
      await env.ORDERS.put(key,JSON.stringify(row),{onlyIf:{etagMatches:record.etag}});
    }
    return reply(200,{status:'pending'});
  }
  if(req.method!=='GET')return reply(405,{error:'Unsupported method.'});
  if(!row?.orderId)return reply(200,{status:'unsubmitted'});
  const result=await fetch(orders+'/'+row.orderId,{headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!result.ok)return reply(503,{error:'Unable to check MiniSend yet.'});
  const order=await result.json();
  if(order.order_id!==row.orderId||order.external_reference!==row.reference||order.currency!=='KES'||order.payment_method!=='mpesa'||
    order.release_address?.toLowerCase()!==row.address||order.release_chain!=='base'||order.release_asset!=='USDC'||Number(order.amount_local)!==row.kes)throw Error('Mismatched provider order');
  if(['cancelled','failed','expired'].includes(order.status))return reply(200,{status:order.status});
  if(order.status!=='completed'||!/^0x[0-9a-f]{64}$/i.test(order.release_tx_hash))return reply(200,{status:'pending'});
  if(!/^\d{1,8}(\.\d{1,6})?$/.test(String(order.amount_usdc))||!(order.amount_usdc>0))throw Error('Invalid release amount');
  return reply(200,{status:'released',usdc:String(order.amount_usdc),transaction:order.release_tx_hash,address:row.address});
}
