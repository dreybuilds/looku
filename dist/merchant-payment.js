import {baseUSDC} from './wallet.js';

const requestOptions={credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store'};
const network='eip155:8453';
const fields=(entries)=>entries.map(([name,type])=>({name,type}));
const types={
  EIP712Domain:fields([['name','string'],['version','string'],['chainId','uint256'],['verifyingContract','address']]),
  TransferWithAuthorization:fields([['from','address'],['to','address'],['value','uint256'],['validAfter','uint256'],['validBefore','uint256'],['nonce','bytes32']])
};
function decode(value){
  if(!value||value.length>32768)throw Error('The merchant did not return a readable x402 header.');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0))));
}
function encode(data){
  return btoa(Array.from(new TextEncoder().encode(JSON.stringify(data)),c=>String.fromCharCode(c)).join(''));
}
export async function merchantOffer(url,limit){
  const response=await fetch(url,{...requestOptions,signal:AbortSignal.timeout(12000)});
  if(response.status!==402)throw Error('No x402 offer at this product link. Use View at store for retailer checkout.');
  const challenge=decode(response.headers.get('payment-required'));
  if(challenge.x402Version!==2||challenge.resource?.url!==url||!Array.isArray(challenge.accepts))throw Error('The payment offer does not match this item.');
  const offer=challenge.accepts.find(o=>o.scheme==='exact'&&o.network===network&&o.asset?.toLowerCase()===baseUSDC.toLowerCase()&&
    /^0x[0-9a-f]{40}$/i.test(o.payTo)&&!/^0x0{40}$/i.test(o.payTo)&&/^\d{1,18}$/.test(o.amount)&&BigInt(o.amount)>0n&&
    BigInt(o.amount)<=limit&&Number.isInteger(o.maxTimeoutSeconds)&&o.maxTimeoutSeconds>0&&
    (!o.extra?.assetTransferMethod||o.extra.assetTransferMethod==='eip3009'));
  if(!offer)throw Error('No exact Base USDC offer fits this item’s available budget.');
  return {resource:challenge.resource,offer};
}
export function newNonce(){
  return '0x'+Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function signOffer(wallet,address,{resource,offer},expires,nonce){
  const authorization={from:address,to:offer.payTo,value:offer.amount,validAfter:String(Math.floor(Date.now()/1000)-10),validBefore:String(expires),nonce};
  const typed={types,primaryType:'TransferWithAuthorization',domain:{name:'USD Coin',version:'2',chainId:8453,verifyingContract:baseUSDC},message:authorization};
  const signature=await wallet.request({method:'eth_signTypedData_v4',params:[address,JSON.stringify(typed)]});
  if(!/^0x[0-9a-f]{130}$/i.test(signature))throw Error('Unsupported wallet signature.');
  return encode({x402Version:2,resource,accepted:offer,payload:{authorization,signature}});
}
export async function submitOffer(url,signature){
  const r=await fetch(url,{...requestOptions,headers:{'PAYMENT-SIGNATURE':signature},signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('Check your wallet and the merchant before attempting another payment.');
  const receipt=decode(r.headers.get('payment-response'));
  if(receipt.success!==true||receipt.network!==network||!/^0x[0-9a-f]{64}$/i.test(receipt.transaction))throw Error('The merchant has not provided a settlement receipt. Check your wallet.');
  let confirmation='';
  if(r.body&&/^(text\/plain|application\/json)\b/i.test(r.headers.get('content-type')||'')){
    const reader=r.body.getReader(),decoder=new TextDecoder();
    try{
      while(confirmation.length<2000){
        const {done,value}=await reader.read();if(done)break;
        confirmation+=decoder.decode(value.subarray(0,8000),{stream:true});
      }
      confirmation=confirmation.slice(0,2000);
    }catch{confirmation=''}finally{void reader.cancel().catch(()=>{})}
  }
  return {tx:receipt.transaction,confirmation};
}

export async function authorizationStatus(address,payment){
  async function rpc(method,params){
    const res=await fetch('https://mainnet.base.org',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(12000),body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
    if(!res.ok)throw Error('Base is unavailable. Check again later.');
    const {result}=await res.json();if(result==null)throw Error('Could not verify payment on Base.');return result;
  }
  const block=await rpc('eth_getBlockByNumber',['finalized',false]);
  const data='0xe94a0102'+address.slice(2).padStart(64,'0')+payment.nonce.slice(2);
  const state=await rpc('eth_call',[{to:baseUSDC,data},block.number]);
  if(!/^0x0{63}[01]$/.test(state))throw Error('Unexpected USDC authorization state.');
  if(BigInt(state)===1n)return 'used';
  return BigInt(block.timestamp)>BigInt(payment.expires)?'expired':'pending';
}
