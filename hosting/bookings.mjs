import {session} from './account.mjs';
import {privySubject} from './privy.mjs';
import {userPrefix,pageOf} from './support.mjs';

const prefix='bookings/';
const idPattern=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const error=(status,message)=>reply(status,{error:message});
export async function bookings(req,env){
  const store=env.ORDERS,url=new URL(req.url);
  const owner=await privySubject(req)||(await session(req,store))?.address;
  if(!owner)return error(401,'Sign in to request an appointment and see your bookings.');
  const path=await userPrefix(owner,prefix);
  if(req.method==='GET')return pageOf(store,path,url.searchParams.get('cursor'));
  if(req.method!=='POST'||req.headers.get('origin')!==url.origin||req.headers.get('x-looku-action')!=='booking')return error(403,'Open Book a stylist to send a request.');
  const data=await req.json().catch(()=>null);
  if(!data||!idPattern.test(data.id)||!['Fashion stylist','Makeup artist','Hair stylist'].includes(data.service))return error(400,'Choose an available service.');
  const when=Date.parse(data.when);
  if(!Number.isFinite(when)||when<=Date.now())return error(400,'Choose a future appointment time.');
  const {contact,brief}=data;
  if(typeof contact!=='string'||contact.length>160||!/^\S+@\S+\.\S+$/.test(contact)||typeof brief!=='string'||brief.length>600)return error(400,'Enter a contact email and keep your notes under 600 characters.');
  const row={id:data.id,service:data.service,when:new Date(when).toISOString(),contact,brief:brief.trim(),status:'Requested'};
  const saved=await store.put(path+data.id,JSON.stringify(row),{onlyIf:{etagDoesNotMatch:'*'}});
  return reply(saved?201:200,{id:data.id});
}
export async function adminBookings(req,store,data){
  if(req.method==='GET')return pageOf(store,prefix,new URL(req.url).searchParams.get('cursor'),prefix);
  if(typeof data.key!=='string'||!/^[a-f0-9]{64}\//.test(data.key)||!idPattern.test(data.key.slice(65))||!['Confirmed','Declined'].includes(data.status))return error(400,'Choose a booking and a decision.');
  const key=prefix+data.key,record=await store.get(key);
  if(!record)return error(404,'Booking not found.');
  const row=await record.json();
  if(row.status==='Requested'&&data.revision===record.etag&&await store.put(key,JSON.stringify({...row,status:data.status}),{onlyIf:{etagMatches:record.etag}}))return reply(200,{ok:true});
  return error(409,'This booking changed. Reopen Bookings to refresh.');
}
