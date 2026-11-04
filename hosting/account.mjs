import {walletReceipts} from './wallet-receipts.mjs';
import {Keypair,StrKey} from '@stellar/stellar-sdk';
const reply=(status,data,cookie)=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
const encode=text=>new TextEncoder().encode(text);
const uuid=/^[0-9a-f-]{36}$/;
const sessionCookie=(value,seconds)=>'__Host-looku-session='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+seconds;
async function digest(text){
 const bytes=await crypto.subtle.digest('SHA-256',encode(text));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function session(req,store){
 const raw=(req.headers.get('Cookie')||'').match(/(?:^|;\s*)__Host-looku-session=([0-9a-f-]{36})\b/)?.[1];
 if(!raw)return null;
 const key='wallet-sessions/'+await digest(raw);
 const row=await (await store.get(key))?.json();
 if(!row||row.expires<=Date.now())return null;
 const account=await (await store.get('wallet-accounts/'+row.address))?.json();
 return account&&!account.suspended?{...row,key}:null;
}
async function takeQuota(store){
 const key='gpt-budget/'+new Date().toISOString().slice(0,10);
 for(let attempt=0;attempt<4;attempt++){
   const previous=await store.get(key);
   const used=previous?Number(await previous.text()):0;
   if(used>=30)return false;
   if(await store.put(key,String(used+1),{onlyIf:previous?{etagMatches:previous.etag}:{etagDoesNotMatch:'*'}}))return true;
 }
 return false;
}
const wardrobeTypes=['shirt','trousers','shoe','jacket','dress'];
const occasions=['Everyday','Office','Evening','Weekend'];
export async function account(req,env){
 const url=new URL(req.url),route=url.pathname,store=env.ORDERS;
 if(route==='/api/account/receipts'&&req.method==='GET'){
   const user=await session(req,store);
   if(!user)return reply(401,{error:'Sign in with your wallet to see its purchases.'});
   return reply(200,await walletReceipts(store,user.address,url.searchParams.get('cursor')));
 }
 if(route==='/api/account'&&req.method==='GET'){
   const user=await session(req,store);
   return reply(200,{address:user?.address||null,gptAvailable:Boolean(env.OPENROUTER_API_KEY)});
 }
 if(req.method!=='POST'||req.headers.get('Origin')!==url.origin||req.headers.get('X-Looku-Action')!=='wallet-account')return reply(403,{error:'Open your account in looku.'});
 if(route==='/api/account/logout'){
   const user=await session(req,store);if(user)await store.delete(user.key);
   return reply(200,{ok:true},sessionCookie('',0));
 }
 let data;try{data=await req.json()}catch{return reply(400,{error:'Invalid request.'})}
 if(route==='/api/stylist/gpt'){
   if(!env.OPENROUTER_API_KEY)return reply(503,{error:'GPT styling is awaiting an API connection. Use on-device styling.'});
   if(!await session(req,store))return reply(401,{error:'Sign in with your device wallet in Wallet, then try GPT.'});
   if(typeof data.prompt!=='string'||!data.prompt.trim()||data.prompt.length>180)return reply(400,{error:'Describe a look in 1–180 characters.'});
   if(!await takeQuota(store))return reply(429,{error:'The demo has used its daily GPT allowance. On-device styling is available.'});
   const string={type:'string'}, array={type:'array',items:string};
   const schema={type:'object',additionalProperties:false,properties:{occasion:{type:'string',enum:occasions},colors:array,prefer:{type:'array',items:{type:'string',enum:wardrobeTypes}},exclude:{type:'array',items:{type:'string',enum:wardrobeTypes}},tip:string},required:['occasion','colors','prefer','exclude','tip']};
   let result;
   try {
     const upstream=await fetch('https://openrouter.ai/api/v1/responses',{method:'POST',signal:AbortSignal.timeout(18000),headers:{Authorization:'Bearer '+env.OPENROUTER_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:'openai/gpt-4.1-mini',store:false,max_output_tokens:300,instructions:'Interpret a fashion brief as styling preferences for a local wardrobe matcher. Provide up to three hex colours (#rrggbb), desired and excluded categories, and one practical short styling tip. Do not claim the user owns any particular item.',input:data.prompt,text:{format:{type:'json_schema',name:'look_preferences',strict:true,schema}}})});
     if(!upstream.ok)throw Error();
     const body=await upstream.json();
     result=JSON.parse(body.output.flatMap(o=>o.content||[]).find(c=>c.type==='output_text').text);
     if(!occasions.includes(result.occasion)||!Array.isArray(result.colors)||!Array.isArray(result.prefer)||!Array.isArray(result.exclude)||typeof result.tip!=='string')throw Error();
   }catch{return reply(502,{error:'GPT could not finish this look. Try on-device styling or retry later.'})}
   return reply(200,{occasion:result.occasion,colors:result.colors.filter(x=>/^#[a-f0-9]{6}$/i.test(x)).slice(0,3),prefer:result.prefer.filter(x=>wardrobeTypes.includes(x)),exclude:result.exclude.filter(x=>wardrobeTypes.includes(x)),tip:result.tip.slice(0,350)});
 }
 const address=data?.address;
 if(typeof address!=='string'||!StrKey.isValidEd25519PublicKey(address))return reply(400,{error:'Choose a valid device wallet.'});
 const challengeKey='wallet-challenges/'+address;
 if(route==='/api/account/challenge'){
   const nonce=crypto.randomUUID(),expires=Date.now()+180000;
   const message=['looku wallet sign-in',url.origin,'Stellar testnet',address,nonce,String(expires)].join('\n');
   await store.put(challengeKey,JSON.stringify({message,expires,nonce}));
   return reply(200,{message,nonce});
 }
 if(route!=='/api/account/verify')return reply(404,{error:'Unknown account action.'});
 const challenge=await store.get(challengeKey);
 const record=await challenge?.json();
 if(!record||record.expires<=Date.now()||!uuid.test(data.nonce)||data.nonce!==record.nonce)return reply(401,{error:'Sign-in expired. Try again.'});
 let valid=false;
 try{valid=Keypair.fromPublicKey(address).verify(encode(record.message),Uint8Array.from(atob(data.signature),c=>c.charCodeAt(0)))}catch{}
 if(!valid)return reply(401,{error:'Wallet signature did not match.'});
 if(!await store.put(challengeKey,'null',{onlyIf:{etagMatches:challenge.etag}}))return reply(409,{error:'This sign-in was already used.'});
 await store.put('wallet-accounts/'+address,JSON.stringify({address,createdAt:new Date().toISOString()}),{onlyIf:{etagDoesNotMatch:'*'}});
 if((await (await store.get('wallet-accounts/'+address)).json()).suspended)return reply(403,{error:'This wallet account is suspended.'});
 const token=crypto.randomUUID(),hours=12;
 await store.put('wallet-sessions/'+await digest(token),JSON.stringify({address,expires:Date.now()+hours*3600000}));
 return reply(200,{address},sessionCookie(token,hours*3600));
}
