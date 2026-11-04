import {enabled} from './features.js';
import {fillProfile} from './shopping.js';
import {accountDetails,tagChoices,chosenTags,tagLinks} from './social.js';
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
 <section data-email-account></section><form class="stack"><label><span data-title-label>Public title</span><input name="title" maxlength="180" required value="${esc(source.name)}"></label>
 <div class="public-pieces">${pieces.map(p=>`<figure>${photoOf(p)?`<img src="${esc(photoOf(p))}" alt="">`:''}<figcaption>${esc(p.name)}</figcaption></figure>`).join('')}</div>
 ${kind!=='look'?'<label>Who can see this listing?<select name="visibility"><option value="public">Public Community listing</option><option value="private">Private · anyone with the link</option></select></label>':''}
 ${kind==='sale'?'<label>Asking price (KSh)<input type="number" name="price" min="1" max="99999999" step="1" required></label>':''}
 ${kind!=='look'?'<label>Contact email<input type="email" name="email" maxlength="160" required></label>':''}
 ${kind==='look'?'<div data-tags></div>':''}
 <p class="fine" data-audience-note>Once published, anyone can see this title, the piece names and their thumbnails.${kind==='look'?'':' An admin reviews this listing first. After approval, signed-in members can see your contact email to arrange a handoff.'} You can withdraw the post in Community.</p>
 <button>${actions[kind]}</button><p role="status"></p></form>`);
 const form=body.querySelector('form'),button=form.querySelector('button'),status=form.querySelector('[role=status]');
 const visibility=form.elements.visibility;
 if(visibility){
   fillProfile(form);
   const note=form.querySelector('[data-audience-note]'),publicNote=note.textContent;
   visibility.onchange=()=>{
     const privateLink=visibility.value==='private';
     note.textContent=privateLink?'Anyone with the link can see this listing and your contact email, including people it is forwarded to. It skips admin review. Withdraw it to disable the link.':publicNote;
     form.querySelector('[data-title-label]').textContent=privateLink?'Listing title':'Public title';
   };
 }
 const accountPanel=body.querySelector('[data-email-account]');
 const tags=form.querySelector('[data-tags]');if(tags)tagChoices(tags);
 const signIn=emailAccount(accountPanel,()=>{if(tags)tagChoices(tags);status.textContent='You can continue with this post.'});
 function postLink(id){const a=link('View submission',route(kind,id));a.onclick=()=>dialog.close();status.append(' ',a)}
 form.onsubmit=async e=>{
   e.preventDefault();if(button.disabled)return;button.disabled=true;status.textContent='Publishing…';
   try{
     const fields=new FormData(form);
     const post={sourceId:source.id,title:fields.get('title'),pieces:await Promise.all(pieces.map(async p=>({name:p.name,photo:await thumbnail(p)})))};
     if(tags&&Object.keys(chosenTags(tags)).length)post.tags=chosenTags(tags);
     if(visibility){post.email=fields.get('email').trim();post.visibility=visibility.value}
     if(kind==='sale')post.price=Number(fields.get('price'));
     const result=await call(kind,{method:'POST',headers,body:JSON.stringify(post)});
     if(form.isConnected&&dialog.open){dialog.close();location.hash=route(kind,result.id)+(result.shareKey?'/'+result.shareKey:'')}
   }catch(error){
     status.textContent=error.message;if(error.status===401)signIn?.();if(error.status===409&&error.id)postLink(error.id);
   }finally{button.disabled=false}
 };

}
export function mountMemberAccount(panel,[kind,id]=[]){
 const login=element('section');
 panel.replaceChildren(login);if(enabled('social'))panel.append(accountDetails());if(enabled('pinterest'))panel.append(pinterestPanel());
 emailAccount(login,()=>{
   if(['sale','donate'].includes(kind)&&/^[a-f0-9]{64}$/.test(id))location.hash=route(kind,id);
   else mountMemberAccount(panel);
 });
}
export async function mountCommunity(panel,[requested,id,shareKey]){
 const kind=Object.hasOwn(labels,requested)?requested:Object.keys(labels).find(enabled)||'look';
 const tabs=element('div');tabs.className='community-tabs actions';
 for(const [key,label] of Object.entries(labels)){
   if(!enabled(key))continue;
   const tab=link(label,route(key));if(key===kind)tab.setAttribute('aria-current','page');tabs.append(tab);
 }
 const help=element('p','Publish a saved outfit or list one of your own pieces from Wardrobe. ');
 help.append(link('Open Wardrobe →','#wardrobe'));
 const list=element('div');list.className='community-grid';
 const status=element('p');status.setAttribute('role','status');
 const more=element('button','Load more');more.hidden=true;
 panel.replaceChildren(tabs,help,list,status,more);
 function draw(post){
   const card=element('article');card.className='panel community-post';
   const badge=element('span',post.pinterestId?'Pinterest':post.kind==='look'?'Lookbook':post.kind==='sale'?'For sale':'Free to a new closet');badge.className='eyebrow';
   const pieces=element('div');pieces.className='public-pieces';
   for(const p of post.pieces){
     const figure=element('figure');if(p.photo){const img=element('img');img.src=p.photo;img.alt='';figure.append(img)}
     figure.append(element('figcaption',p.name));pieces.append(figure);
   }
   card.append(badge,element('h2',post.title),pieces);
   if(post.tags)card.append(tagLinks(post.tags));
   if(post.mine&&kind!=='look')card.append(element('p',post.status==='private'?'Private · anyone with the link':post.status==='pending'?'Awaiting admin review':post.status==='rejected'?'Rejected · Withdraw to revise and resubmit.':'Approved'));
   if(kind!=='look'&&!post.email)card.append(element('strong',kind==='sale'?'KSh '+post.price.toLocaleString():'Free donation'),link('Sign in to see contact details','#account/'+kind+'/'+post.id));
   if(post.email){
     card.append(element('strong',post.kind==='sale'?'KSh '+post.price.toLocaleString():'Free donation'),element('p',post.email),link(post.kind==='sale'?'Contact seller':'Contact donor','mailto:'+encodeURIComponent(post.email).replace('%40','@')));
   }
   const tools=element('div');tools.className='actions';if(['approved','published'].includes(post.status))tools.append(link('Public link',route(kind,post.id)));
   if(post.mine&&post.status==='private'){
     const url=new URL('/app'+route(kind,post.id)+'/'+post.shareKey,location.origin);
     const copy=element('button','Copy private link');
     copy.onclick=async()=>{
       try{await navigator.clipboard.writeText(url.href);status.textContent='Private link copied.'}
       catch{status.textContent='Copy the address from the Private link below.'}
     };
     tools.append(copy,link('Private link',url.href));
   }
   if(post.pinterestId)tools.append(link('View original Pin ↗','https://www.pinterest.com/pin/'+post.pinterestId+'/'));
   if(enabled('pinterest')&&post.mine&&kind==='look'&&!post.pinterestId&&post.pieces.some(p=>p.photo))postToPinterest(tools,post);
   if(post.mine){
     const remove=element('button','Withdraw post');remove.className='secondary small';tools.append(remove);
     remove.onclick=async()=>{
       if(!confirm(post.status==='private'?'Withdraw this listing and disable its private link?':'Withdraw this post from the public community?'))return;
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
     if(id){draw(await call(kind+'/'+encodeURIComponent(id),shareKey?{headers:{'X-Looku-Share':shareKey}}:{}));status.textContent='';return}
     const page=await call(kind+(cursor?'?cursor='+encodeURIComponent(cursor):''));
     page.posts.forEach(draw);cursor=page.cursor;more.hidden=!cursor;
     status.textContent=list.children.length?'':'Nothing published here yet.';
   }catch(e){status.textContent=e.message}
   finally{more.disabled=false}
 }
 more.onclick=load;await load();
}
