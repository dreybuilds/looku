import {pinterestPanel,postToPinterest} from './pinterest.js';
import {emailAccount,emailHeaders} from './email-auth.js';
const labels={look:'Published looks',sale:'Closet sale',donate:'Donations'};
const actions={look:'Publish look',sale:'List for sale',donate:'Offer for donation'};
const headers={'X-Looku-Action':'community','Content-Type':'application/json'};
const route=(kind,id)=>'#community/'+kind+(id?'/'+id:'');
const photoOf=p=>p.photo||(/^sample[1-4]$/.test(p.id)?'/'+p.id+'.webp':'');
const element=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node};
function link(label,href){const a=element('a',label);a.href=href;return a}
async function call(path,options){
 let res;
 const auth=await emailHeaders();
 try{res=await fetch('/api/community/'+path,{cache:'no-store',...options,headers:{...options?.headers,...auth}})}catch{throw Error('Go online to use Community.')}
 let data;try{data=await res.json()}catch{throw Error('Community couldn’t load. Check your connection and try again.')}
 if(!res.ok)throw Object.assign(Error(data.error||'Community is unavailable.'),{status:res.status,id:data.id});
 return data;
}
async function thumbnail(piece){
 const src=photoOf(piece);
 if(!src)return '';
 const img=new Image();img.src=src;await img.decode();
 const scale=Math.min(1,240/Math.max(img.width,img.height));
 const canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
 return canvas.toDataURL('image/jpeg',0.65);
}
export function composePost({kind,source,pieces,modal,body,dialog,esc}){
 modal(`<div class="eyebrow">Looku Wear / Community</div><h2>${actions[kind]}</h2>
 <section data-email-account></section><form class="stack"><label>Public title<input name="title" maxlength="180" required value="${esc(source.name)}"></label>
 <div class="public-pieces">${pieces.map(p=>`<figure>${photoOf(p)?`<img src="${esc(photoOf(p))}" alt="">`:''}<figcaption>${esc(p.name)}</figcaption></figure>`).join('')}</div>
 ${kind==='sale'?'<label>Asking price (KSh)<input type="number" name="price" min="1" max="99999999" step="1" required></label>':''}
 ${kind!=='look'?'<label>Contact email<input type="email" name="email" maxlength="160" required></label>':''}
 <p class="fine">Once published, anyone can see this title, the piece names and their thumbnails.${kind==='look'?'':' An admin reviews this listing first. After approval, signed-in members can see your contact email to arrange a handoff.'} You can withdraw the post in Community.</p>
 <button>${actions[kind]}</button><p role="status"></p></form>`);
 const form=body.querySelector('form'),button=form.querySelector('button'),status=form.querySelector('[role=status]');
 const accountPanel=body.querySelector('[data-email-account]');
 emailAccount(accountPanel,()=>{status.textContent='You can continue with this post.'});
 function signIn(){const details=accountPanel.querySelector('details');if(details){details.open=true;details.querySelector('input').focus()}}
 function postLink(id){const a=link('View submission',route(kind,id));a.onclick=()=>dialog.close();status.append(' ',a)}
 form.onsubmit=async e=>{
   e.preventDefault();if(button.disabled)return;button.disabled=true;status.textContent='Publishing…';
   try{
     const fields=new FormData(form);
     const post={sourceId:source.id,title:fields.get('title'),pieces:await Promise.all(pieces.map(async p=>({name:p.name,photo:await thumbnail(p)})))};
     if(kind!=='look')post.email=fields.get('email').trim();
     if(kind==='sale')post.price=Number(fields.get('price'));
     const result=await call(kind,{method:'POST',headers,body:JSON.stringify(post)});
     if(form.isConnected&&dialog.open){dialog.close();location.hash=route(kind,result.id)}
   }catch(error){
     status.textContent=error.message;if(error.status===401)signIn();if(error.status===409&&error.id)postLink(error.id);
   }finally{button.disabled=false}
 };

}
export async function mountCommunity(panel,[requested,id]){
 const kind=Object.hasOwn(labels,requested)?requested:'look';
 const tabs=element('div');tabs.className='community-tabs actions';
 for(const [key,label] of Object.entries(labels)){
   const tab=link(label,route(key));if(key===kind)tab.setAttribute('aria-current','page');tabs.append(tab);
 }
 const help=element('p','Publish a saved outfit or list one of your own pieces from Wardrobe. ');
 help.append(link('Open Wardrobe →','#wardrobe'));
 const list=element('div');list.className='community-grid';
 const status=element('p');status.setAttribute('role','status');
 const more=element('button','Load more');more.hidden=true;
 const accountPanel=element('section');panel.replaceChildren(tabs,accountPanel,help,list,status,more);
 if(kind==='look')help.after(pinterestPanel());
 emailAccount(accountPanel,()=>mountCommunity(panel,[requested,id]));
 function draw(post){
   const card=element('article');card.className='panel community-post';
   const badge=element('span',post.pinterestId?'Pinterest':post.kind==='look'?'Lookbook':post.kind==='sale'?'For sale':'Free to a new closet');badge.className='eyebrow';
   const pieces=element('div');pieces.className='public-pieces';
   for(const p of post.pieces){
     const figure=element('figure');if(p.photo){const img=element('img');img.src=p.photo;img.alt='';figure.append(img)}
     figure.append(element('figcaption',p.name));pieces.append(figure);
   }
   card.append(badge,element('h2',post.title),pieces);
   if(post.mine&&kind!=='look')card.append(element('p',post.status==='pending'?'Awaiting admin review':post.status==='rejected'?'Rejected · Withdraw to revise and resubmit.':'Approved'));
   if(kind!=='look'&&!post.email)card.append(element('strong',kind==='sale'?'KSh '+post.price.toLocaleString():'Free donation'),link('Sign in to see contact details','#community-email'));
   const contactLogin=card.querySelector('[href="#community-email"]');
   if(contactLogin)contactLogin.onclick=e=>{e.preventDefault();const details=accountPanel.querySelector('details');if(details){details.open=true;details.querySelector('input').focus()}};
   if(post.email){
     card.append(element('strong',post.kind==='sale'?'KSh '+post.price.toLocaleString():'Free donation'),element('p',post.email),link(post.kind==='sale'?'Contact seller':'Contact donor','mailto:'+encodeURIComponent(post.email).replace('%40','@')));
   }
   const tools=element('div');tools.className='actions';if(['approved','published'].includes(post.status))tools.append(link('Public link',route(kind,post.id)));
   if(post.pinterestId)tools.append(link('View original Pin ↗','https://www.pinterest.com/pin/'+post.pinterestId+'/'));
   if(post.mine&&kind==='look'&&!post.pinterestId&&post.pieces.some(p=>p.photo))postToPinterest(tools,post);
   if(post.mine){
     const remove=element('button','Withdraw post');remove.className='secondary small';tools.append(remove);
     remove.onclick=async()=>{
       if(!confirm('Withdraw this post from the public community?'))return;
       remove.disabled=true;
       try{await call(kind+'/'+post.id,{method:'DELETE',headers});card.remove();status.textContent='Post withdrawn.'}
       catch(e){status.textContent=e.message;remove.disabled=false}
     };
   }
   card.append(tools);list.append(card);
 }
 let cursor;
 async function load(){
   more.disabled=true;status.textContent='Loading…';
   try{
     if(id){draw(await call(kind+'/'+encodeURIComponent(id)));status.textContent='';return}
     const page=await call(kind+(cursor?'?cursor='+encodeURIComponent(cursor):''));
     page.posts.forEach(draw);cursor=page.cursor;more.hidden=!cursor;
     status.textContent=list.children.length?'':'Nothing published here yet.';
   }catch(e){status.textContent=e.message}
   finally{more.disabled=false}
 }
 more.onclick=load;await load();
}
