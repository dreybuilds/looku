// Each unguessable link requests one contribution to the receiving wallet.
// Only verified authorizations create records. Link data omits the retailer and item name.
const facilitator='https://facilitator.payai.network';
const network='eip155:8453';
const asset='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const usedTopic='0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5';
const transferTopic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const hex32=/^0x[0-9a-f]{64}$/i;
const encode=value=>btoa(JSON.stringify(value));
const topic=address=>'0x'+address.slice(2).toLowerCase().padStart(64,'0');
const headers={'Cache-Control':'private, no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'PAYMENT-SIGNATURE','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Expose-Headers':'PAYMENT-REQUIRED, PAYMENT-RESPONSE'};
function reply(status,data,extra={}){return Response.json(data,{status,headers:{...headers,...extra}})}
async function post(url,data){
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok)throw Error('Service unavailable');
  return response.json();
}
async function rpc(method,params){
  const data=await post('https://mainnet.base.org',{id:1,jsonrpc:'2.0',method,params});
  if(data.error||!Object.hasOwn(data,'result'))throw Error('Base unavailable');
  return data.result;
}
function receipt(row){
  const settlement={success:true,network,transaction:row.tx,payer:row.payer};
  return reply(200,{status:'paid',finalized:row.finalized===true,...settlement},{'PAYMENT-RESPONSE':encode(settlement)});
}
function confirmsContribution(transaction, finalizedBlock, row, offer){
  if(transaction?.status!=='0x1'||BigInt(transaction.blockNumber)>BigInt(finalizedBlock))return false;
  const events=transaction.logs.filter(log=>log.address.toLowerCase()===asset.toLowerCase());
  const payer=topic(row.payer);
  const used=events.some(({topics})=>topics[0]===usedTopic&&topics[1]===payer&&topics[2]===row.nonce);
  const transferred=events.some(({topics,data})=>topics[0]===transferTopic&&topics[1]===payer&&
    topics[2]===topic(offer.payTo)&&BigInt(data)===BigInt(offer.amount));
  return used&&transferred;
}
async function reconcile(store,key,record,offer){
  const row=await record.json();
  if(row.finalized)return receipt(row);
  const block=await rpc('eth_getBlockByNumber',['finalized',false]);
  if(BigInt(block.number)<BigInt(row.start))return reply(202,{status:'pending'});
  const end=BigInt(row.start)+2000n;
  const logs=row.tx?[{transactionHash:row.tx}]:await rpc('eth_getLogs',[{address:asset,fromBlock:row.start,toBlock:BigInt(block.number)>end?'0x'+end.toString(16):block.number,topics:[usedTopic,topic(row.payer),row.nonce]}]);
  if(logs.length){
    const tx=await rpc('eth_getTransactionReceipt',[logs[0].transactionHash]);
    if(confirmsContribution(tx,block.number,row,offer)){
      row.tx=logs[0].transactionHash;row.finalized=true;
      await store.put(key,JSON.stringify(row),{onlyIf:{etagMatches:record.etag}});
      return receipt(row);
    }
  }
  if(row.tx)return receipt(row);
  if(BigInt(block.timestamp)>BigInt(row.expires))return reply(410,{status:'expired'});
  return reply(202,{status:'pending'});
}
export async function wishlistFunding(request,store){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='GET')return reply(405,{error:'Use GET.'});
  const url=new URL(request.url);
  const path=url.pathname.match(/^\/api\/wishlist-funding\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\/(0x[0-9a-f]{40})\/([1-9]\d{0,13})$/);
  if(!path||/^0x0{40}$/.test(path[2])||url.search)return reply(404,{error:'Invalid funding link.'});
  const [,id,payTo,amount]=path;
  const key=['wishlist-funding',id,payTo,amount].join('/');
  const offer={scheme:'exact',network,asset,amount,payTo,maxTimeoutSeconds:120,extra:{name:'USD Coin',version:'2',assetTransferMethod:'eip3009'}};
  const resource={url:url.href,description:'Contribute USDC to a Lookuwear wishlist item',mimeType:'application/json'};
  const challenge={x402Version:2,resource,accepts:[offer]};
  try{
    const record=await store.get(key);
    if(record)return await reconcile(store,key,record,offer);
    const header=request.headers.get('payment-signature');
    if(!header)return reply(402,challenge,{'PAYMENT-REQUIRED':encode(challenge)});
    let proof;
    try{if(header.length>16000)throw Error();proof=JSON.parse(atob(header))}catch{return reply(400,{error:'Invalid payment signature header.'})}
    const auth=proof?.payload?.authorization,now=Math.floor(Date.now()/1000);
    if(proof?.x402Version!==2||(proof.resource&&proof.resource.url!==resource.url)||!auth||
      !['scheme','network','asset','amount','payTo','maxTimeoutSeconds'].every(k=>proof.accepted?.[k]===offer[k])||
      !/^0x[0-9a-f]{40}$/i.test(auth.from)||auth.from.toLowerCase()===payTo||typeof auth.to!=='string'||auth.to.toLowerCase()!==payTo||auth.value!==amount||
      !hex32.test(auth.nonce)||!/^\d{1,12}$/.test(auth.validBefore)||Number(auth.validBefore)<=now||Number(auth.validBefore)>now+125||
      !/^0x(?:[0-9a-f]{2})+$/i.test(proof.payload.signature))return reply(400,{error:'Authorization does not match this contribution.'});
    const payload={x402Version:2,paymentPayload:{...proof,resource,accepted:offer},paymentRequirements:offer};
    const verified=await post(facilitator+'/verify',payload);
    if(verified.isValid!==true||verified.payer?.toLowerCase()!==auth.from.toLowerCase())return reply(402,challenge,{'PAYMENT-REQUIRED':encode(challenge)});
    const start=await rpc('eth_blockNumber',[]);
    const row={payer:auth.from.toLowerCase(),nonce:auth.nonce.toLowerCase(),expires:auth.validBefore,start};
    const once={onlyIf:{etagDoesNotMatch:'*'}};
    const nonceKey='wishlist-authorizations/'+row.payer+'/'+row.nonce;
    const claimed=await store.put(nonceKey,key,once);
    if(!claimed&&(await (await store.get(nonceKey))?.text())!==key)return reply(409,{error:'Authorization already assigned.'});
    const reserved=await store.put(key,JSON.stringify(row),once);
    if(!reserved)return reply(409,{error:'Contribution already in progress. Check the link for its receipt.'});
    // Persist the nonce before submitting. An interrupted response can be recovered on chain.
    const settled=await post(facilitator+'/settle',payload);
    if(settled.success!==true||settled.network!==network||!hex32.test(settled.transaction))return reply(202,{status:'pending'});
    row.tx=settled.transaction;
    await store.put(key,JSON.stringify(row),{onlyIf:{etagMatches:reserved.etag}});
    return receipt(row);
  }catch{return reply(503,{error:'Funding service unavailable. Check this same link before retrying.'})}
}
