import {session} from './account.mjs';

const kinds=['look','sale','donate'];
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const textFits=(s,n)=>typeof s==='string'&&s.trim().length>0&&s.length<=n;
const publicPost=(row,address)=>{
 const {owner,...post}=row;
 return {...post,mine:owner===address};
};

export async function community(req,{ORDERS:store}){
 const url=new URL(req.url);
 const [, , ,kind,id,...rest]=url.pathname.split('/');
 if(!kinds.includes(kind)||rest.length||(id&&!/^[a-f0-9]{64}$/.test(id)))return reply(404,{error:'Post not found.'});
 const prefix='community/'+kind+'/';
 const account=await session(req,store);
 if(req.method==='GET'&&!id){
   const cursor=url.searchParams.get('cursor')||undefined;
   const page=await store.list({prefix,limit:8,cursor});
   const rows=await Promise.all(page.objects.map(async obj=>(await store.get(obj.key))?.json()));
   return reply(200,{posts:rows.filter(Boolean).map(row=>publicPost(row,account?.address)),cursor:page.truncated?page.cursor:null});
 }
 if(req.method==='GET'){
   const row=await (await store.get(prefix+id))?.json();
   return row?reply(200,publicPost(row,account?.address)):reply(404,{error:'This post is no longer available.'});
 }
 if(req.headers.get('Origin')!==url.origin||req.headers.get('X-Looku-Action')!=='community')return reply(403,{error:'Open Community in Looku Wear.'});
 if(!account)return reply(401,{error:'Sign in with your Looku wallet to publish or withdraw a post.'});
 if(req.method==='DELETE'&&id){
   const row=await (await store.get(prefix+id))?.json();
   if(!row||row.owner!==account.address)return reply(404,{error:'Post not found.'});
   await store.delete(prefix+id);
   return reply(200,{removed:true});
 }
 if(req.method!=='POST'||id)return reply(405,{error:'Unsupported action.'});
 const maxBytes=300000;
 if(!req.body||Number(req.headers.get('Content-Length'))>maxBytes)return reply(413,{error:'Post too large.'});
 const reader=req.body.getReader(),chunks=[];
 let size=0;
 for(;;){
   const {done,value}=await reader.read();if(done)break;
   size+=value.length;
   if(size>maxBytes){await reader.cancel();return reply(413,{error:'Post too large.'})}
   chunks.push(value);
 }
 let data;try{data=JSON.parse(await new Blob(chunks).text())}catch{return reply(400,{error:'Invalid post.'})}
 if(!textFits(data?.sourceId,80)||!textFits(data.title,180)||!Array.isArray(data.pieces)||!data.pieces.length||data.pieces.length>(kind==='look'?5:1))return reply(400,{error:'Choose a title and wardrobe pieces.'});
 const pieces=[];
 for(const piece of data.pieces){
   const photo=piece?.photo||'';
   if(!textFits(piece?.name,60)||typeof photo!=='string'||photo.length>60000||photo&&!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+=*$/.test(photo))return reply(400,{error:'Invalid piece or thumbnail.'});
   pieces.push({name:piece.name.trim(),photo});
 }
 const post={kind,title:data.title.trim(),pieces};
 if(kind!=='look'){
   if(!textFits(data.email,160)||!/^[^\s@?<>&#]+@[^\s@?<>&#]+\.[^\s@?<>&#]+$/.test(data.email))return reply(400,{error:'Enter a contact email.'});
   post.email=data.email;
   if(kind==='sale'){
     if(!Number.isSafeInteger(data.price)||data.price<=0||data.price>99999999)return reply(400,{error:'Enter a positive price in whole KSh.'});
     post.price=data.price;
   }
 }
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([account.address,kind,data.sourceId])));
 post.id=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
 const stored=await store.put(prefix+post.id,JSON.stringify({...post,owner:account.address}),{onlyIf:{etagDoesNotMatch:'*'}});
 return reply(stored?201:409,{id:post.id,...(!stored?{error:'Already published. Withdraw the existing post to change it.'}:{})});
}
