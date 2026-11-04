// Run after node hosting/build.mjs. No credentials or Pinterest requests leave this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import worker from '../dist/server/index.js';

test('Pinterest connects a member, imports public original Pins and posts only their own looks',async t=>{
 const rows=new Map();
 const store={
   async get(key){const row=rows.get(key);return row&&{etag:row.etag,text:async()=>row.value,json:async()=>JSON.parse(row.value)}},
   async put(key,value,{onlyIf}={}){const old=rows.get(key);if(onlyIf?.etagDoesNotMatch==='*'&&old||onlyIf?.etagMatches&&onlyIf.etagMatches!==old?.etag)return null;
     const row={value,etag:crypto.randomUUID()};rows.set(key,row);return row},
   async delete(key){rows.delete(key)},
   async list(){return {objects:[]}}
 };
 const env={ORDERS:store,PINTEREST_APP_SECRET:'test-only'};
 const origin='https://lookuwear.test';
 async function wallet(name){
   const raw=crypto.randomUUID(),digest=createHash('sha256').update(raw).digest('hex');
   await store.put('wallet-sessions/'+digest,JSON.stringify({address:name,expires:Date.now()+60000}));
   await store.put('wallet-accounts/'+name,'{}');
   return '__Host-looku-session='+raw;
 }
 const alice=await wallet('alice'),bob=await wallet('bob');
 function call(path,method='GET',body,cookie=alice){
   return worker.fetch(new Request(origin+path,{method,headers:{Origin:origin,Cookie:cookie,'X-Looku-Action':'pinterest'},...(body?{body:JSON.stringify(body)}:{})}),env);
 }
 const path='/api/pinterest/',pin={id:'12345',is_owner:true,board_id:'99999',title:'Denim',media:{images:{original:{url:'https://i.pinimg.com/example.jpg'}}}};
 let posts=0,exchanges=0,privacy='PUBLIC';
 t.mock.method(globalThis,'fetch',async(url,options)=>{
   const endpoint=new URL(url).pathname;
   if(endpoint==='/v5/oauth/token'){exchanges++;return Response.json({access_token:'sample-test-token',refresh_token:'sample-refresh',expires_in:3600})}
   assert.equal(options.headers.Authorization,'Bearer sample-test-token');
   if(endpoint==='/v5/pins/12345')return Response.json(pin);
   if(endpoint==='/v5/boards/99999')return Response.json({privacy});
   if(endpoint==='/v5/pins'&&options.method==='POST'){posts++;assert.equal(JSON.parse(options.body).board_id,'99999');return Response.json({id:'67890'})}
   return Response.json({items:[pin],bookmark:null});
 });
 assert.equal((await call(path+'connect','POST',null,'')).status,401);
 const start=await call(path+'connect','POST'),auth=new URL((await start.json()).url);
 const cookie=start.headers.get('set-cookie').split(';')[0],callback=path+'callback?code=test&state=';
 assert.match((await call(callback+'wrong','GET',null,cookie)).headers.get('location'),/failed/);
 assert.equal(exchanges,0);
 assert.match((await call(callback+auth.searchParams.get('state'),'GET',null,cookie)).headers.get('location'),/connected/);
 assert.ok(!rows.get('pinterest/accounts/alice').value.includes('sample-test-token'));
 assert.equal((await (await call(path+'connection','GET',null,bob)).json()).connected,false);
 assert.equal((await (await call(path+'pins')).json()).items[0].id,pin.id);
 privacy='SECRET';
 assert.equal((await call(path+'import','POST',{pinId:pin.id})).status,400);
 privacy='PUBLIC';
 const imported=await call(path+'import','POST',{pinId:pin.id});assert.equal(imported.status,201);
 const {id}=await imported.json();
 assert.equal((await (await call('/api/community/look/'+id)).json()).pinterestId,pin.id);
 assert.equal((await call(path+'import','POST',{pinId:pin.id})).status,200);
 assert.equal((await call(path+'publish','POST',{boardId:'99999',lookId:id})).status,404);
 const lookId='1'.repeat(64),look={id:lookId,title:'Denim jacket',pieces:[{name:'Jacket',photo:'data:image/jpeg;base64,/9j/'}]};
 await store.put('community/look/'+lookId,JSON.stringify({...look,owner:'bob'}));
 assert.equal((await call(path+'publish','POST',{boardId:'99999',lookId})).status,404);
 await store.put('community/look/'+lookId,JSON.stringify({...look,owner:'alice'}));
 for(const status of [201,200])assert.equal((await call(path+'publish','POST',{boardId:'99999',lookId})).status,status);
 assert.equal(posts,1);
 assert.equal((await call(path+'connection','DELETE')).status,200);
 assert.equal((await call(path+'pins')).status,409);
 const featured=(await (await call('/api/community/look')).json()).posts;
 assert.equal(featured.length,2);
 for(const post of featured)assert.equal((await (await call('/api/community/look/'+post.id)).json()).pinterestId,post.pinterestId);
});
