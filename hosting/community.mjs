import {savedHandles,saveHandles,selectedHandles} from './social.mjs';
import {privySubject} from './privy.mjs';
import {session} from './account.mjs';

const featuredLooks=[
 {id:'e7fad9f391aa82fc506e38f9c0927b90e7040e583fe6b881fe7484ce243ddcb6',pinterestId:'7388786884333608',kind:'look',owner:'editorial',title:'Menswear · Olive overshirt and sand trousers',
  pieces:[{name:'Olive overshirt, white tee, beige trousers and white sneakers',photo:'https://i.pinimg.com/originals/33/c1/2a/33c12a641b587194632499da8730a2ad.png'}]},
 {id:'50e0782f757de2940f710a7c710e34fa09a42aeb0887aa1e662e9fe3872392bd',pinterestId:'496803402663384164',kind:'look',owner:'editorial',title:'Womenswear · White linen and woven straw',
  pieces:[{name:'White linen shirt, wide-leg trousers and a woven tote',photo:'https://i.pinimg.com/originals/a4/a0/53/a4a053ea0e956ad41f64e030f54d651b.jpg'}]}
];
const kinds=['look','sale','donate'];
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const textFits=(s,n)=>typeof s==='string'&&s.trim().length>0&&s.length<=n;
const visible=(row,address)=>row.owner===address||row.kind==='look'||row.status==='approved';
function publicPost(row,address){
 const {id,kind,title,pieces,price}=row,mine=row.owner===address;
 if(row.status==='private')return {id,kind,title,pieces,price,mine,status:'private',email:row.email,...(mine?{shareKey:row.shareKey}:{})};
 return {id,kind,title,pieces,price,mine,...(row.tags?{tags:row.tags}:{}),...(row.pinterestId?{pinterestId:row.pinterestId}:{}),status:kind==='look'?'published':row.status||'pending',
   ...(address&&(mine||row.status==='approved')?{email:row.email}:{})};
}

export async function community(req,{ORDERS:store}){
 const url=new URL(req.url);
 const [, , ,kind,id,...rest]=url.pathname.split('/');
 const did=await privySubject(req);
 const owner=did||(await session(req,store))?.address;
 if(kind==='session'&&!id&&req.method==='GET')return reply(200,{signedIn:!!owner});
 const profile=kind==='profile'&&!id;
 if(!profile&&!kinds.includes(kind)||rest.length||(id&&!/^[a-f0-9]{64}$/.test(id)))return reply(404,{error:'Post not found.'});
 const prefix='community/'+kind+'/';

 if(profile&&!owner)return reply(401,{error:'Sign in to manage social accounts.'});
 if(profile&&req.method==='GET')return reply(200,{handles:await savedHandles(store,owner)});
 if(req.method==='GET'&&!id){
   const cursor=url.searchParams.get('cursor')||undefined;
   const page=await store.list({prefix,limit:8,cursor});
   const rows=await Promise.all(page.objects.map(async obj=>(await store.get(obj.key))?.json()));
   return reply(200,{posts:[...(kind==='look'&&!cursor?featuredLooks:[]),...rows].filter(row=>row&&visible(row,owner)).map(row=>publicPost(row,owner)),cursor:page.truncated?page.cursor:null});
 }
 if(req.method==='GET'){
   const row=(kind==='look'&&featuredLooks.find(look=>look.id===id))||await (await store.get(prefix+id))?.json();
   const shared=row?.status==='private'&&row.shareKey&&row.shareKey===req.headers.get('X-Looku-Share');
   return row&&(visible(row,owner)||shared)?reply(200,publicPost(row,owner)):reply(404,{error:'This post is no longer available.'});
 }
 if(req.headers.get('Origin')!==url.origin||req.headers.get('X-Looku-Action')!=='community')return reply(403,{error:'Open Community in Looku Wear.'});
 if(!owner)return reply(401,{error:'Sign in with email or your Looku wallet to publish or withdraw a post.'});
 if(req.method==='DELETE'&&id){
   const row=await (await store.get(prefix+id))?.json();
   if(!row||row.owner!==owner)return reply(404,{error:'Post not found.'});
   await store.delete(prefix+id);
   return reply(200,{removed:true});
 }
 if(req.method!=='POST'||id)return reply(405,{error:'Unsupported action.'});
 const maxBytes=profile?1024:300000;
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
 if(profile)return await saveHandles(store,owner,data?.handles)?reply(200,{saved:true}):reply(400,{error:'Enter valid social usernames without a profile URL.'});
 if(!textFits(data?.sourceId,80)||!textFits(data.title,180)||!Array.isArray(data.pieces)||!data.pieces.length||data.pieces.length>(kind==='look'?5:1))return reply(400,{error:'Choose a title and wardrobe pieces.'});
 const pieces=[];
 for(const piece of data.pieces){
   const photo=piece?.photo||'';
   if(!textFits(piece?.name,60)||typeof photo!=='string'||photo.length>60000||photo&&!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+=*$/.test(photo))return reply(400,{error:'Invalid piece or thumbnail.'});
   pieces.push({name:piece.name.trim(),photo});
 }
 const post={kind,title:data.title.trim(),pieces};
 if(kind==='look'&&data.tags)post.tags=await selectedHandles(store,owner,data.tags);
 if(kind!=='look'){
   if(!textFits(data.email,160)||!/^[^\s@?<>&#]+@[^\s@?<>&#]+\.[^\s@?<>&#]+$/.test(data.email))return reply(400,{error:'Enter a contact email.'});
   if(data.visibility!==undefined&&!['public','private'].includes(data.visibility))return reply(400,{error:'Choose a listing audience.'});
   post.email=data.email;
   post.status=data.visibility==='private'?'private':'pending';
   if(post.status==='private')post.shareKey=crypto.randomUUID();
   if(kind==='sale'){
     if(!Number.isSafeInteger(data.price)||data.price<=0||data.price>99999999)return reply(400,{error:'Enter a positive price in whole KSh.'});
     post.price=data.price;
   }
 }
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([owner,kind,data.sourceId])));
 post.id=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
 const stored=await store.put(prefix+post.id,JSON.stringify({...post,owner}),{onlyIf:{etagDoesNotMatch:'*'}});
 return reply(stored?201:409,{id:post.id,...(stored&&post.shareKey?{shareKey:post.shareKey}:{}),...(!stored?{error:'Already submitted. Withdraw the existing post to change it.'}:{})});
}
