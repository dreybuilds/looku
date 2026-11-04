import {session} from './account.mjs';
import {privySubject} from './privy.mjs';

const prefix='support/';
const categories=['Account','Wardrobe','Listings','Payments','Other'];
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const error=(status,message)=>reply(status,{error:message});
const fits=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
async function userPrefix(owner){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner));
 return prefix+Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('')+'/';
}
async function pageOf(store,path,cursor){
 const page=await store.list({prefix:path,limit:12,cursor:cursor||undefined});
 const items=await Promise.all(page.objects.map(async({key})=>{
   const record=await store.get(key);
   if(!record)return null;
   return {...await record.json(),...(path===prefix?{key:key.slice(prefix.length)}:{}),revision:record.etag};
 }));
 return reply(200,{items:items.filter(Boolean),next:page.truncated?page.cursor:null});
}
async function update(store,key,data,isAdmin){
 const record=await store.get(key);
 if(!record)return error(404,'Request not found.');
 if(record.etag!==data.revision)return error(409,'This request changed. Refresh the conversation before replying.');
 const ticket=await record.json();
 if(data.message!==undefined&&typeof data.message!=='string')return error(400,'Invalid message.');
 const message=data.message?.trim();
 const status=isAdmin?data.status:'Open';
 if(!['Open','In progress','Resolved'].includes(status)||(!message&&(!isAdmin||status===ticket.status))||(message&&!fits(message,2000)))return error(400,'Write a reply or change the request status.');
 if(message){
   if(ticket.messages.length>=80)return error(400,'This conversation is full. Please open a new request.');
   ticket.messages.push({by:isAdmin?'Support':'You',text:message,at:new Date().toISOString()});
 }
 ticket.status=status;
 const saved=await store.put(key,JSON.stringify(ticket),{onlyIf:{etagMatches:record.etag}});
 return saved?reply(200,{ok:true}):error(409,'This request changed. Refresh before replying.');
}
export async function support(req,env){
 const store=env.ORDERS,url=new URL(req.url);
 const owner=await privySubject(req)||(await session(req,store))?.address;
 if(!owner)return error(401,'Sign in to open or view your support requests.');
 const path=await userPrefix(owner);
 if(req.method==='GET')return pageOf(store,path,url.searchParams.get('cursor'));
 if(req.method!=='POST'||req.headers.get('Origin')!==url.origin||req.headers.get('X-Looku-Action')!=='support')return error(403,'Open Support in Looku to make changes.');
 let data;try{data=await req.json()}catch{return error(400,'Invalid support request.')}
 if(!data||!uuid.test(data.id))return error(400,'Invalid request ID.');
 if(data.revision)return update(store,path+data.id,data,false);
 if(!fits(data.subject,100)||!fits(data.message,2000)||!categories.includes(data.category))return error(400,'Choose a topic and enter a subject and message.');
 const row={id:data.id,category:data.category,subject:data.subject.trim(),status:'Open',messages:[{by:'You',text:data.message.trim(),at:new Date().toISOString()}]};
 const saved=await store.put(path+data.id,JSON.stringify(row),{onlyIf:{etagDoesNotMatch:'*'}});
 return reply(saved?201:200,{id:data.id});
}
export function adminSupport(req,store,data){
 if(req.method==='GET')return pageOf(store,prefix,new URL(req.url).searchParams.get('cursor'));
 if(typeof data.key!=='string'||!/^([a-f0-9]{64})\//.test(data.key)||!uuid.test(data.key.slice(65)))return error(400,'Choose a support request.');
 return update(store,prefix+data.key,data,true);
}
export async function dashboard(store){
 async function count(prefix){
   let total=0,cursor;
   do{const page=await store.list({prefix,limit:1000,cursor});total+=page.objects.length;cursor=page.truncated?page.cursor:undefined}while(cursor);
   return total;
 }
 const [support,sales,donations,accounts]=await Promise.all(['support/','community/sale/','community/donate/','wallet-accounts/'].map(count));
 return reply(200,{support,sales,donations,accounts});
}
