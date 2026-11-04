import https from 'node:https';
import {lookup} from 'node:dns';
import {isIP} from 'node:net';
import ipaddr from 'ipaddr.js';
import {parseDocument,DomUtils} from 'htmlparser2';

// Validate the address used by the socket, including after every redirect.
function publicLookup(host,options,callback){
 lookup(host,{family:4,all:true},(err,addresses)=>{
   const found=addresses?.find(({address})=>ipaddr.parse(address).range()==='unicast');
   if(err||!found)return callback(Error('No public retailer address.'));
   if(options.all)callback(null,[found]);else callback(null,found.address,4);
 });
}
async function readPublic(input,accept,limit,signal){
 let url=new URL(input);
 for(let hop=0;hop<4;hop++){
   if(url.protocol!=='https:'||url.port||url.username||url.password||isIP(url.hostname)||url.hostname.includes(':')||!url.hostname.includes('.'))throw Error('Invalid retailer link.');
   const response=await new Promise((resolve,reject)=>{
     https.get(url,{lookup:publicLookup,agent:false,signal,headers:{Accept:accept,'Accept-Encoding':'identity','User-Agent':'LookuWear/1.0 product preview'}},resolve).on('error',reject);
   });
   if([301,302,303,307,308].includes(response.statusCode)){
     response.destroy();url=new URL(response.headers.location,url);continue;
   }
   const type=(response.headers['content-type']||'').split(';')[0].toLowerCase().trim();
   if(response.statusCode!==200||!accept.split(',').includes(type)){response.destroy();throw Error('Unavailable content.')}
   let size=0;const chunks=[];
   for await(const chunk of response){
     size+=chunk.length;if(size>limit)throw Error('Page too large.');
     chunks.push(chunk);
   }
   return {url,type,bytes:Buffer.concat(chunks)};
 }
 throw Error('Too many redirects.');
}
export function productDetails(html){
 const doc=parseDocument(html);
 const tags=DomUtils.findAll(e=>['meta','script','title'].includes(e.name),doc.children);
 const meta=new Map();let product,title;
 for(const tag of tags){
   const a=tag.attribs;
   if(tag.name==='meta'){
     const key=(a.property||a.name||'').toLowerCase();
     if(key&&!meta.has(key))meta.set(key,a.content);
   }else if(tag.name==='title')title=DomUtils.textContent(tag);
   else if(!product&&a.type==='application/ld+json'){
     try{
       const parsed=JSON.parse(DomUtils.textContent(tag));
       const nodes=[parsed].flat().flatMap(n=>[n,...(Array.isArray(n?.['@graph'])?n['@graph']:[])]);
       product=nodes.find(n=>[n?.['@type']].flat().includes('Product'));
     }catch{}
   }
 }
 const offer=[product?.offers].flat()[0],img=[product?.image].flat()[0];
 const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
 return {
   title:clean(product?.name||meta.get('og:title')||meta.get('twitter:title')||title,120),
   variant:[product?.size,product?.color].filter(v=>typeof v==='string').join(' · ').slice(0,100),
   price:String(offer?.price??meta.get('product:price:amount')??meta.get('og:price:amount')??''),
   currency:clean(offer?.priceCurrency||meta.get('product:price:currency')||meta.get('og:price:currency'),3).toUpperCase(),
   image:clean((typeof img==='string'?img:img?.url||img?.contentUrl)||meta.get('og:image')||meta.get('twitter:image'),4096)
 };
}
export async function productPreview(req){
 const json=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
 if(req.method!=='POST'||req.headers.get('X-Looku-Action')!=='product-preview'||req.headers.get('Origin')!==new URL(req.url).origin)return json(403,{error:'Open Wishlist to load product details.'});
 try{
   // A plain URL is the entire body. Bound chunked requests as well.
   let input='';for await(const chunk of req.body){if(input.length+chunk.length>4096)throw Error();input+=Buffer.from(chunk).toString()}
   const signal=AbortSignal.timeout(10000);
   const page=await readPublic(input,'text/html,application/xhtml+xml',1500000,signal);
   const {image,...result}=productDetails(page.bytes.toString());
   if(image)try{
     const pic=await readPublic(new URL(image,page.url),'image/jpeg,image/png,image/webp,image/avif',2500000,signal);
     result.photo='data:'+pic.type+';base64,'+pic.bytes.toString('base64');
   }catch{ /* A missing photo still leaves usable product details. */ }
   return json(200,result);
 }catch{return json(422,{error:'This store could not provide a preview. You can enter the details yourself.'})}
}
