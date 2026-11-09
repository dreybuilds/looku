import {PrivyClient} from '@privy-io/node';
import {Account,Asset,Keypair,Networks,Operation,StrKey,TransactionBuilder} from '@stellar/stellar-sdk';
import {privyAppId} from './privy-config.mjs';

const fail=(status,message)=>Object.assign(Error(message),{status});
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const networks={
  mainnet:{passphrase:Networks.PUBLIC,horizon:'https://horizon.stellar.org',asset:new Asset('USDC','GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'),currency:'USDC'},
  testnet:{passphrase:Networks.TESTNET,horizon:'https://horizon-testnet.stellar.org',asset:Asset.native(),currency:'test XLM'}
};
export function stellarUnits(value){
  if(typeof value!=='string'||!/^\d{1,8}(\.\d{1,7})?$/.test(value))throw fail(400,'Enter an amount with up to seven decimal places.');
  const [whole,part='']=value.split('.');return BigInt(whole)*10000000n+BigInt(part.padEnd(7,'0'));
}
const amount=units=>(units/10000000n)+'.'+String(units%10000000n).padStart(7,'0');
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('')}
function provider(env){
  if(!env.PRIVY_APP_SECRET)throw fail(503,'Account wallet setup is unavailable. Try again later.');
  const client=new PrivyClient({appId:privyAppId,appSecret:env.PRIVY_APP_SECRET});
  return {
    get:id=>client.wallets().get(id),
    create:input=>client.wallets().create(input),
    sign:(id,hash,jwt)=>client.wallets().rawSign(id,{params:{hash},authorization_context:{user_jwts:[jwt]}})
  };
}
async function jsonFetch(url,options){
  const res=await fetch(url,{...options,signal:AbortSignal.timeout(12000),redirect:'error'});
  if(res.status===404)return null;
  if(!res.ok)throw fail(503,'Stellar could not confirm the request. Refresh to retry.');
  return res.json();
}
async function holdings(address,network){
  const config=networks[network],account=await jsonFetch(config.horizon+'/accounts/'+address);
  if(!account)return {active:false,balance:'0',trustline:false};
  const line=account.balances.find(row=>config.asset.isNative()?row.asset_type==='native':row.asset_code==='USDC'&&row.asset_issuer===config.asset.issuer);
  let balance=line?stellarUnits(line.balance)-stellarUnits(line.selling_liabilities||'0'):0n;
  if(config.asset.isNative()){
    const ledgers=await jsonFetch(config.horizon+'/ledgers?order=desc&limit=1');
    const reserve=BigInt(ledgers._embedded.records[0].base_reserve_in_stroops);
    const entries=2+account.subentry_count+(account.num_sponsoring||0)-(account.num_sponsored||0);
    balance-=BigInt(entries)*reserve+10000n;
  }
  return {active:true,balance:String(balance>0n?balance:0n),trustline:!!line,account};
}
async function provision(store,key,owner,api){
  const previous=await store.get(key);if(previous)return previous.json();
  let wallet;
  if(owner.startsWith('G'))wallet={address:owner,kind:'varial'};
  else{
    const externalId='looku-stellar-'+(await digest(owner)).slice(0,48);
    let created;
    try{created=await api.get('ext_wal_'+externalId)}catch(e){if(e.status!==404)throw e}
    if(!created){
      try{created=await api.create({chain_type:'stellar',owner:{user_id:owner},external_id:externalId,idempotency_key:externalId,display_name:'Lookuwear Stellar wallet'})}
      catch(error){try{created=await api.get('ext_wal_'+externalId)}catch{throw error}}
    }
    if(created.chain_type!=='stellar'||!StrKey.isValidEd25519PublicKey(created.address))throw fail(503,'Wallet creation returned an unexpected account.');
    wallet={address:created.address,id:created.id,kind:'privy'};
  }
  const row={...wallet,budgets:{mainnet:{},testnet:{}},active:null};
  const saved=await store.put(key,JSON.stringify(row),{onlyIf:{etagDoesNotMatch:'*'}});
  return saved?row:(await store.get(key)).json();
}
async function change(store,key,fn){
  for(let attempt=0;attempt<4;attempt++){
    const current=await store.get(key);if(!current)throw fail(409,'Open your account wallet first.');
    const row=await current.json(),next=await fn(row);
    if(await store.put(key,JSON.stringify(next),{onlyIf:{etagMatches:current.etag}}))return next;
  }
  throw fail(409,'Your wallet changed in another tab. Retry.');
}
export async function stellarWallet(request,env,owner,services={}){
  try{
    if(!owner)return reply(401,{error:'Sign in with email to use your account’s Stellar wallet.'});
    const url=new URL(request.url),action=url.pathname.slice('/api/stellar-wallet'.length)||'/';
    if(!['GET','POST'].includes(request.method))throw fail(405,'Unsupported method.');
    if(request.method==='POST'&&(request.headers.get('origin')!==url.origin||request.headers.get('x-looku-action')!=='stellar-wallet'))throw fail(403,'Open your wallet in Lookuwear.');
    const network=url.searchParams.get('network')||'mainnet';if(!networks[network])throw fail(400,'Choose Stellar mainnet or testnet.');
    const store=env.ORDERS,key='stellar-wallets/'+await digest(owner),api=services.api||(!owner.startsWith('G')?provider(env):null);
    const readHoldings=services.holdings||holdings;
    let row=await (await store.get(key))?.json();
    if(action==='/'&&request.method==='POST')row=await provision(store,key,owner,api);
    if(!row)return reply(200,{exists:false});
    const data=request.method==='POST'?await request.json():null;
    async function snapshot(){
      const funds=await readHoldings(row.address,network);
      return {exists:true,address:row.address,kind:row.kind,network,currency:networks[network].currency,
        active:funds.active,trustline:funds.trustline,balance:funds.balance,budgets:row.budgets[network],pending:row.active?{id:row.active.id,network:row.active.network}:null};
    }
    if(action==='/')return reply(200,await snapshot());
    if(action==='/budget'&&data){
      if(!/^[0-9a-f]{64}$/.test(data.item))throw fail(400,'Invalid wishlist item.');
      const units=stellarUnits(data.amount),funds=await readHoldings(row.address,network);
      row=await change(store,key,current=>{
        if(current.active)throw fail(409,'Check the pending payment before changing budgets.');
        const budgets={...current.budgets[network]};delete budgets[data.item];
        const used=Object.values(budgets).reduce((sum,value)=>sum+BigInt(value),0n);
        if(units>BigInt(current.budgets[network][data.item]||0)&&used+units>BigInt(funds.balance))throw fail(409,'This exceeds your confirmed balance after other wishlist budgets.');
        if(units)budgets[data.item]=String(units);
        return {...current,budgets:{...current.budgets,[network]:budgets}};
      });
      return reply(200,await snapshot());
    }
    const intentKey=id=>key+'/payments/'+id;
    if(action==='/prepare'&&data){
      if(!/^[0-9a-f-]{36}$/.test(data.id))throw fail(400,'Invalid payment request.');
      const prior=await store.get(intentKey(data.id));if(prior)return reply(200,await prior.json());
      if(row.active?.id===data.id)return reply(200,row.active.record);
      const config=networks[network],funds=await readHoldings(row.address,network);
      if(!funds.active)throw fail(409,'Fund this Stellar address with XLM to activate it first.');
      const isTrust=data.type==='trustline';
      if(isTrust&&network!=='mainnet')throw fail(400,'USDC setup is for mainnet.');
      let units=0n,operation;
      if(isTrust){
        if(funds.trustline)throw fail(409,'USDC is already enabled.');
        operation=Operation.changeTrust({asset:config.asset});
      }else{
        if(data.type!=='payment'||!StrKey.isValidEd25519PublicKey(data.destination)||data.destination===row.address)throw fail(400,'Enter another Stellar G-address.');
        units=stellarUnits(data.amount);if(!units)throw fail(400,'Enter a positive amount.');
        operation=Operation.payment({destination:data.destination,asset:config.asset,amount:amount(units)});
      }
      const source=new Account(row.address,funds.account.sequence);
      const tx=new TransactionBuilder(source,{fee:'10000',networkPassphrase:config.passphrase}).addOperation(operation).setTimeout(180).build();
      const record={id:data.id,network,type:data.type,address:row.address,destination:isTrust?null:data.destination,amount:String(units),item:data.item||null,
        xdr:tx.toXDR(),hash:Buffer.from(tx.hash()).toString('hex'),expires:Number(tx.timeBounds.maxTime),status:'prepared'};
      const reserved=await change(store,key,current=>{
        if(current.active?.id===data.id)return current;
        if(current.active&&current.active.id!==data.id)throw fail(409,'Finish the pending wallet request first.');
        const budgets=current.budgets[network];
        if(record.item&&(!/^[0-9a-f]{64}$/.test(record.item)||units>BigInt(budgets[record.item]||0)))throw fail(409,'Payment exceeds this item’s budget.');
        const reserved=Object.entries(budgets).filter(([id])=>id!==record.item).reduce((total,[,value])=>total+BigInt(value),0n);
        if(!isTrust&&units+reserved>BigInt(funds.balance))throw fail(409,'Payment exceeds the funds available after other wishlist budgets.');
        return {...current,active:{id:data.id,network,record}};
      });
      if(!await store.put(intentKey(data.id),JSON.stringify(reserved.active.record),{onlyIf:{etagDoesNotMatch:'*'}}))return reply(200,await (await store.get(intentKey(data.id))).json());
      return reply(200,reserved.active.record);
    }
    if((action==='/submit'&&data)||action.startsWith('/receipt/')){
      const id=data?.id||action.slice('/receipt/'.length);if(!/^[0-9a-f-]{36}$/.test(id))throw fail(400,'Invalid receipt.');
      let stored=await store.get(intentKey(id));
      if(!stored&&row.active?.id===id){await store.put(intentKey(id),JSON.stringify(row.active.record),{onlyIf:{etagDoesNotMatch:'*'}});stored=await store.get(intentKey(id))}
      if(!stored)throw fail(404,'Receipt not found.');
      const payment=await stored.json(),config=networks[payment.network];
      if(!['complete','failed','expired'].includes(payment.status)){
        let chain=await jsonFetch(config.horizon+'/transactions/'+payment.hash);
        if(!chain&&action==='/submit'){
          if(row.active?.id!==id||Date.now()/1000>payment.expires)throw fail(409,'This wallet request expired. Check its status.');
          const tx=TransactionBuilder.fromXDR(payment.xdr,config.passphrase);
          if(row.kind==='privy'){
            const jwt=request.headers.get('authorization')?.slice(7);if(!jwt)throw fail(401,'Sign in with email to authorize this payment.');
            const {signature}=await api.sign(row.id,'0x'+payment.hash,jwt);
            tx.addSignature(row.address,Buffer.from(signature.slice(2),'hex').toString('base64'));
          }else{
            const signed=TransactionBuilder.fromXDR(data.signedXdr||'',config.passphrase);
            if(Buffer.from(signed.hash()).toString('hex')!==payment.hash||!signed.signatures.some(s=>Keypair.fromPublicKey(row.address).verify(tx.hash(),s.signature)))throw fail(400,'Approve this exact transaction in Varial.');
            tx.signatures.push(...signed.signatures);
          }
          // Retrying always broadcasts the same sequence, operations and hash.
          try{await jsonFetch(config.horizon+'/transactions',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({tx:tx.toXDR()})})}catch{}
          chain=await jsonFetch(config.horizon+'/transactions/'+payment.hash);
        }
        if(chain)payment.status=chain.successful?'complete':'failed';
        else if(Date.now()/1000>payment.expires+60){
          const ledger=await jsonFetch(config.horizon+'/ledgers?order=desc&limit=1');
          if(Date.parse(ledger._embedded.records[0].closed_at)/1000>payment.expires)payment.status='expired';
        }
        if(['complete','failed','expired'].includes(payment.status)){
          // Reconcile a matching intent once, even after a lost response or simultaneous tabs.
          await change(store,key,current=>{
            if(current.active?.id!==id)return current;
            const budgets={...current.budgets[payment.network]};
            if(payment.status==='complete'&&payment.item)budgets[payment.item]=String(BigInt(budgets[payment.item]||0)-BigInt(payment.amount));
            return {...current,active:null,budgets:{...current.budgets,[payment.network]:budgets}};
          });
          await store.put(intentKey(id),JSON.stringify(payment),{onlyIf:{etagMatches:stored.etag}});
        }
      }
      return reply(200,payment);
    }
    throw fail(404,'Unknown wallet action.');
  }catch(error){return reply(error.status>=400&&error.status<500?error.status:503,{error:error.status>=400&&error.status<500?error.message:'Stellar wallet service is unavailable. Refresh before retrying.'})}
}
