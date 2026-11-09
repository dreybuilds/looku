import {paused,pausedReply} from './features.mjs';
import {selectedHandles} from './social.mjs';
import {EncryptJWT,jwtDecrypt} from 'jose';
import {session} from './account.mjs';
import {privySubject} from './privy.mjs';

const api='https://api.pinterest.com/v5';
const scopes='boards:read,pins:read,pins:write';
const callback='/api/pinterest/callback';
const pinId=/^\d{1,24}$/;
const cookieName='__Host-looku-pinterest';
const cookie=(value,seconds)=>cookieName+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+seconds;
const reply=(status,data,headers)=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const fail=(status,message)=>Object.assign(Error(message),{status});
const bytes=value=>new TextEncoder().encode(value);
const hash=value=>crypto.subtle.digest('SHA-256',bytes(value));
async function seal(data,key,ttl){
 const jwt=new EncryptJWT(data).setProtectedHeader({alg:'dir',enc:'A256GCM'});
 if(ttl)jwt.setExpirationTime(ttl);
 return jwt.encrypt(key);
}
async function exchange(env,params){
 const response=await fetch(api+'/oauth/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
   headers:{Authorization:'Basic '+btoa((env.PINTEREST_APP_ID||'1634233')+':'+env.PINTEREST_APP_SECRET),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)});
 if(!response.ok)throw fail(response.status===400||response.status===401?401:502,'Pinterest authorization failed. Connect Pinterest again.');
 const token=await response.json();
 if(!token.access_token||!(token.expires_in>0))throw fail(502,'Pinterest returned an incomplete token.');
 return {access:token.access_token,refresh:token.refresh_token,expires:Date.now()+token.expires_in*1000};
}
async function pinterest(req,env){
 const url=new URL(req.url),action=url.pathname.slice('/api/pinterest/'.length),store=env.ORDERS;
 if(!env.PINTEREST_APP_SECRET) return reply(503,{error:'Pinterest account linking is awaiting studio configuration.'});
 const key=new Uint8Array(await hash('looku/pinterest/v1/'+env.PINTEREST_APP_SECRET));
 const redirect=url.origin+callback;
 if(action==='callback'&&req.method==='GET'){
   let outcome='cancelled';
   try{
     const raw=(req.headers.get('Cookie')||'').split('; ').find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
     const {payload}=await jwtDecrypt(raw,key);
     if(!payload.state||payload.state!==url.searchParams.get('state')||payload.origin!==url.origin)throw Error();
     if(!url.searchParams.has('error')){
       const code=url.searchParams.get('code');if(!code)throw Error();
       const tokens=await exchange(env,{grant_type:'authorization_code',code,redirect_uri:redirect});
       await store.put('pinterest/accounts/'+payload.owner,await seal(tokens,key));
       outcome='connected';
     }
   }catch{outcome='failed'}
   return new Response(null,{status:303,headers:{Location:'/app?pinterest='+outcome+'#account','Set-Cookie':cookie('',0),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }
 const owner=await privySubject(req)||(await session(req,store))?.address;
 if(!owner)return reply(401,{error:'Sign in with email to connect Pinterest.'});
 if(req.method!=='GET'&&(req.headers.get('Origin')!==url.origin||req.headers.get('X-Looku-Action')!=='pinterest'))return reply(403,{error:'Open Pinterest in Looku Wear.'});
 const account='pinterest/accounts/'+owner;
 if(action==='connect'&&req.method==='POST'){
   const state=crypto.randomUUID(),auth=new URL('https://www.pinterest.com/oauth/');
   auth.search=new URLSearchParams({client_id:env.PINTEREST_APP_ID||'1634233',redirect_uri:redirect,response_type:'code',scope:scopes,state});
   return reply(200,{url:auth.href},{'Set-Cookie':cookie(await seal({owner,state,origin:url.origin},key,'10m'),600)});
 }
 if(action==='connection'&&req.method==='DELETE'){await store.delete(account);return reply(200,{connected:false},{'Set-Cookie':cookie('',0)})}
 const row=await store.get(account);
 if(action==='connection'&&req.method==='GET')return reply(200,{connected:!!row});
 if(!row)return reply(409,{error:'Connect Pinterest first.'});
 let tokens=(await jwtDecrypt(await row.text(),key)).payload;
 if(tokens.expires<Date.now()+60000){
   if(!tokens.refresh)throw fail(401,'Connect Pinterest again to renew access.');
   const renewed=await exchange(env,{grant_type:'refresh_token',refresh_token:tokens.refresh});
   renewed.refresh||=tokens.refresh;
   if(!await store.put(account,await seal(renewed,key),{onlyIf:{etagMatches:row.etag}}))throw fail(409,'The connection changed. Try again.');
   tokens=renewed;
 }
 async function request(path,body){
   const response=await fetch(api+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),
     headers:{Authorization:'Bearer '+tokens.access,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   if(!response.ok)throw fail(response.status,response.status===401?'Reconnect Pinterest to continue.':response.status===429?'Pinterest is busy. Try again later.':'Pinterest could not complete this action.');
   return response.json();
 }
 if((action==='pins'||action==='boards')&&req.method==='GET'){
   const params=new URLSearchParams({page_size:'25'});
   if(action==='pins')params.set('pin_filter','exclude_repins');
   if(url.searchParams.has('bookmark'))params.set('bookmark',url.searchParams.get('bookmark'));
   const page=await request('/'+action+'?'+params);
   const items=page.items.filter(v=>pinId.test(v.id)&&(action==='boards'||(!v.parent_pin_id&&v.is_owner!==false&&pinPhoto(v)))).map(v=>({id:v.id,title:v.title||v.name||'Untitled Pin'}));
   return reply(200,{items,bookmark:page.bookmark||null});
 }
 if(!['import','publish'].includes(action)||req.method!=='POST')return reply(404,{error:'Unknown Pinterest action.'});
 let data;try{data=await req.json()}catch{return reply(400,{error:'Invalid request.'})}
 if(action==='import'){
   if(!pinId.test(data?.pinId))return reply(400,{error:'Choose a Pin.'});
   const pin=await request('/pins/'+data.pinId);
   const photo=pinPhoto(pin);
   if(pin.id!==data.pinId||!pin.is_owner||pin.parent_pin_id||!pinId.test(pin.board_id)||!photo)return reply(400,{error:'Choose an original image Pin from your public board.'});
   const board=await request('/boards/'+pin.board_id);
   if(board.privacy!=='PUBLIC')return reply(400,{error:'Only public looks can be imported.'});
   const id=Array.from(new Uint8Array(await hash(JSON.stringify([owner,'pinterest',pin.id]))),b=>b.toString(16).padStart(2,'0')).join('');
   const title=(pin.title||pin.description||'Pinterest look').slice(0,180);
   const post={owner,id,kind:'look',title,pinterestId:pin.id,pieces:[{name:title,photo}]};
   if(data.tags&&await paused(store,'social'))return pausedReply();
   if(data.tags)post.tags=await selectedHandles(store,owner,data.tags);
   const saved=await store.put('community/look/'+id,JSON.stringify(post),{onlyIf:{etagDoesNotMatch:'*'}});
   return reply(saved?201:200,{id});
 }
 if(!/^[a-f0-9]{64}$/.test(data?.lookId)||!pinId.test(data.boardId))return reply(400,{error:'Choose a look and board.'});
 const look=await (await store.get('community/look/'+data.lookId))?.json();
 if(!look||look.owner!==owner||look.pinterestId)return reply(404,{error:'Choose one of your original published looks.'});
 const photo=look.pieces.find(p=>p.photo)?.photo;
 if(!photo?.startsWith('data:image/jpeg;base64,'))return reply(400,{error:'Publish a look with a photo first.'});
 const receipt='pinterest/posts/'+look.id+'/'+data.boardId;
 const reserved=await store.put(receipt,'{}',{onlyIf:{etagDoesNotMatch:'*'}});
 if(!reserved){
   const existing=await (await store.get(receipt))?.json();
   return existing?.id?reply(200,{id:existing.id}):reply(409,{error:'This post was already requested. Check the board before posting again.'});
 }
 let pin;
 try{pin=await request('/pins',{board_id:data.boardId,title:look.title.slice(0,100),description:[look.pieces.map(p=>p.name).join(', '),...Object.entries(look.tags||{}).map(([network,handle])=>network+' @'+handle)].join(' · ').slice(0,800),
   link:url.origin+'/app#community/look/'+look.id,media_source:{source_type:'image_base64',content_type:'image/jpeg',data:photo.split(',')[1]}})}
 catch(error){if(error.status>=400&&error.status<500)await store.delete(receipt);throw error}
 if(!pinId.test(pin.id))throw fail(502,'Check your Pinterest board to confirm this post.');
 await store.put(receipt,JSON.stringify({id:pin.id}));
 return reply(201,{id:pin.id});
}
function pinPhoto(pin){
 const images=pin.media?.images||pin.media?.items?.[0]?.images||{};
 return Object.values(images).filter(image=>/^https:\/\/i\.pinimg\.com\//.test(image?.url)).sort((a,b)=>b.width-a.width)[0]?.url;
}
export async function pinterestAccount(req,env){
 try{return await pinterest(req,env)}catch(error){return reply(error.status||502,{error:error.status?error.message:'Pinterest is unavailable. Try again later.'})}
}
