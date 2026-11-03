export const categories={shirt:'Top',trousers:'Bottom',shoe:'Shoes',jacket:'Layer',dress:'Dress'};
export const occasions=['Everyday','Office','Evening','Weekend'];
export const sample=[
 {id:'sample1',name:'Cotton camp shirt',type:'shirt',color:'#d7d1ad',occasion:'Everyday',bg:'#e9e5da'},
 {id:'sample2',name:'Straight-leg denim',type:'trousers',color:'#71869a',occasion:'Weekend',bg:'#e1e6e6'},
 {id:'sample3',name:'Leather trainers',type:'shoe',color:'#d5b99d',occasion:'Everyday',bg:'#efdfd1'},
 {id:'sample4',name:'Slip dress',type:'dress',color:'#8d7364',occasion:'Evening',bg:'#e6dfd9'}];
export function distance(a,b){const rgb=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));const x=rgb(a),y=rgb(b);return Math.hypot(...x.map((v,i)=>v-y[i]));}
export function styleLook(items,occasion,palette,variation=0){
 const rank=item=>(item.occasion===occasion?2:0)+(palette?(442-distance(item.color,palette))/442:0)+(item.id.startsWith('sample')?0:.35);
 const pick=type=>{const candidates=items.filter(i=>i.type===type).sort((a,b)=>rank(b)-rank(a));return candidates.length?candidates[variation%candidates.length]:null};
 const dress=pick('dress'),top=pick('shirt'),bottom=pick('trousers');
 const useDress=dress&&(!top||!bottom||((occasion==='Evening'||variation%2===1)&&dress.occasion===occasion));
 const base=useDress?[dress]:[top,bottom];
 const pieces=[...base,pick('shoe'),pick('jacket')].filter(Boolean);
 return {pieces,missing:[...(useDress?[]:[!top&&'shirt',!bottom&&'trousers']),!pick('shoe')&&'shoe'].filter(Boolean),layer:!pick('jacket')};
}
const db=new Promise((resolve,reject)=>{const r=indexedDB.open('looku-studio',1);r.onupgradeneeded=()=>{r.result.createObjectStore('state')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
export async function read(k,fallback){const d=await db;return new Promise((yes,no)=>{const r=d.transaction('state').objectStore('state').get(k);r.onsuccess=()=>yes(r.result??fallback);r.onerror=()=>no(r.error)})}
export async function write(k,v){const d=await db;return new Promise((yes,no)=>{const tx=d.transaction('state','readwrite');tx.objectStore('state').put(v,k);tx.oncomplete=yes;tx.onabort=()=>no(tx.error);tx.onerror=()=>no(tx.error)})}
export async function processPhoto(file){
 if(!file||!file.type.startsWith('image/'))throw Error('Choose an image file.');
 if(file.size>16*1024*1024)throw Error('Choose a photo smaller than 16 MB.');
 const url=URL.createObjectURL(file),img=new Image();try{img.src=url;await img.decode();const scale=Math.min(1,800/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
 const data=ctx.getImageData(0,0,c.width,c.height).data,bins=new Map();
 for(let y=Math.floor(c.height*.2);y<c.height*.8;y+=5)for(let x=Math.floor(c.width*.2);x<c.width*.8;x+=5){const i=4*(y*c.width+x);const key=[data[i],data[i+1],data[i+2]].map(v=>Math.min(255,Math.floor(v/32)*32+16)).map(v=>v.toString(16).padStart(2,'0')).join('');bins.set(key,(bins.get(key)||0)+1)}
 const color='#'+([...bins].sort((a,b)=>b[1]-a[1])[0]?.[0]||'808080');return {photo:c.toDataURL('image/webp',.8),color}
 }finally{URL.revokeObjectURL(url)}
}
export async function restoreWardrobe({items,looks,inspo}){
 const database=await db;
 return new Promise((resolve,reject)=>{
  const tx=database.transaction('state','readwrite'),store=tx.objectStore('state');
  for(const [key,value] of Object.entries({items,looks,inspo}))store.put(value,key);
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
 });
}
