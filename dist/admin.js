import {ticketList} from './support.js';
import {emailHeaders,emailAccount} from './email-auth.js';
const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n};
const link=(text,href)=>{const a=node('a',text);a.href=href;return a};
async function api(path,data){
 const res=await fetch('/api/admin/'+path,{cache:'no-store',headers:{...await emailHeaders(),...(data?{'Content-Type':'application/json','X-Looku-Action':'admin'}:{})},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
 const result=await res.json();if(!res.ok)throw Error(result.error);return result;
}
export async function mountAdmin(root,{ownerOnly=false}={}){
 const status=node('p');status.setAttribute('role','status');
 const body=node('section');root.append(body,status);
 function button(label,action){
   const b=node('button',label);b.type='button';
   b.onclick=async()=>{b.disabled=true;status.textContent='';try{await action()}catch(e){status.textContent=e.message}finally{b.disabled=false}};return b;
 }
 async function start(){
   const state=await api('access');body.replaceChildren();
   if(state.state==='email-sign-in'){const open=emailAccount(body,start,'Sign in to Admin');open?.();return}
   if(state.state==='sign-in'){
     const a=link('Sign in with ChatGPT','/signin-with-chatgpt?return_to='+encodeURIComponent('/#admin'));a.target='_top';body.append(a);return;
   }
   if(state.state==='wallet'&&ownerOnly){
     const {mountDeviceWallet}=await import('./local-wallet.js');
     await mountDeviceWallet(body,null,()=>start().catch(err=>status.textContent=err.message));return;
   }
   if(state.state==='wallet'){body.append(node('p','Sign in with your owner wallet to continue to Admin home.'),link('Open Wallet','#wallet/admin'));return}
   if(state.state==='unavailable'){body.append(node('p','This account and wallet do not have admin access.'));return}
   if(state.state==='enroll'){
     body.append(node('h2','Link your admin wallet'),node('p','Confirm this public address. Future admin visits require this wallet and the same signed-in email.'),node('code',state.address),button('Link this wallet',async()=>{
       if(!confirm('Permanently link this wallet for owner access?'))return;
       await api('enroll',{address:state.address});await start();
     }));return;
   }
   const tabs=node('div');tabs.className='actions';const content=node('div');body.append(tabs,content);
   async function section(name,path,address){
     const view=node('section');content.replaceChildren(view);status.textContent='';
     const heading=node('h2',name);view.append(heading);
     if(address)view.append(node('code',address));
     const refresh=()=>section(name,path,address);
     if(path==='bookings'){
       const {bookingList}=await import('./bookings.js');
       await bookingList(view,(data,cursor)=>api(path+(cursor?'?cursor='+encodeURIComponent(cursor):''),data),true);return;
     }
     if(path==='partner-programs'){
       view.append(node('p','Research and application notes for potential partners. Review each program’s current terms before applying. Add customer shopping links in Affiliates once ready.'));
       const catalog=await api(path);
       if(!view.isConnected)return;
       const searchLabel=node('label','Find a partner program'),search=node('input');
       search.type='search';search.placeholder='Store or region';searchLabel.append(search);
       const results=node('div');results.className='stack';view.append(searchLabel,results);
       function draw(){
         results.replaceChildren();
         const query=search.value.trim().toLowerCase();
         for(const program of catalog.items.filter(item=>[item.name,item.region,item.note].some(value=>value.toLowerCase().includes(query)))){
           const card=node('article');card.className='panel';
           card.append(node('h3',program.name),node('p',program.region),node('p',program.note));
           if(program.application)card.append(node('p','Application · '+program.application),node('p',program.nextStep));
           const application=link('Open program ↗',program.url);application.target='_blank';application.rel='noopener noreferrer';card.append(application);
           results.append(card);
         }
         if(!results.children.length)results.append(node('p','No partner programs match your search.'));
       }
       search.oninput=draw;draw();return;
     }
     if(path==='features'){
       const settings=await api(path);
       view.append(node('p','Turn features on or off for the shopper app. Changes take effect online without a deployment.'));
       const controls=node('div');controls.className='grid';view.append(controls);
       for(const [id,label] of Object.entries(settings.labels)){
         const card=node('article');card.className='panel';
         const on=settings.enabled[id];
         const toggle=button(label,async()=>{
           await api(path,{id,enabled:!on,revision:settings.revision});await refresh();
           status.textContent=label+' turned '+(on?'off.':'on.');
           Array.from(content.querySelectorAll('[role=switch]')).find(el=>el.textContent===label)?.focus();
         });
         toggle.setAttribute('role','switch');toggle.setAttribute('aria-checked',String(on));
         card.append(toggle,node('p',on?'On':'Off'));controls.append(card);
       }return;
     }
     if(path==='reports'){
       view.append(node('p','Current records across the workspace. Percentages use the total in each group.'));
       for(const [group,title,metric,positive] of [['support','Support requests','Resolution rate','Resolved'],['sales','Closet sales','Approval rate','approved'],['donations','Donations','Approval rate','approved']]){
         const counts={};let cursor;
         do{
           const page=await api('reports?group='+group+(cursor?'&cursor='+encodeURIComponent(cursor):''));
           if(!view.isConnected)return;
           for(const [state,n] of Object.entries(page.counts))counts[state]=(counts[state]||0)+n;
           cursor=page.next;
         }while(cursor);
         const card=node('article');card.className='panel';
         const total=Object.values(counts).reduce((a,b)=>a+b,0);
         card.append(node('h3',title),node('p',total+' total · '+metric+' '+(total?Math.round(100*counts[positive]/total)+'%':'—')));
         for(const [state,n] of Object.entries(counts))card.append(node('p',state+' · '+n));
         view.append(card);
       }return;
     }
     if(path==='support'){
       await ticketList(view,(data,cursor)=>api(path+(cursor?'?cursor='+encodeURIComponent(cursor):''),data),true);return;
     }
     if(path==='dashboard'){
       const counts=await api(path);
       const cards=node('div');cards.className='grid';
       for(const [label,key,target] of [['Support requests','support','support'],['Closet sales','sales','review/sale'],['Donations','donations','review/donate'],['Wallet accounts','accounts','accounts']]){
         const card=node('article');card.className='panel';
         card.append(node('h3',label),node('p',String(counts[key])),button('View '+label.toLowerCase(),()=>section(label,target)));cards.append(card);
       }
       view.append(cards,button('Manage app features',()=>section('App features','features')),button('Manage bookings',()=>section('Bookings','bookings')));return;
     }
     const rows=node('div');rows.className='stack';view.append(rows);
     const more=button('Load more',()=>load(next));view.append(more);let next;
     async function load(cursor){
       const page=await api(path+(cursor?(path.includes('?')?'&':'?')+'cursor='+encodeURIComponent(cursor):''));
       if(!view.isConnected)return;
       more.hidden=!page.next;next=page.next;
       if(path==='affiliates'){
         const form=node('form');form.className='stack panel';
         const nameLabel=node('label','Partner name'),urlLabel=node('label','Referral link');
         const partner=node('input'),url=node('input');partner.required=url.required=true;partner.maxLength=80;url.type='url';url.placeholder='https://';url.maxLength=2000;
         nameLabel.append(partner);urlLabel.append(url);const save=node('button','Add partner');form.append(node('p','These links appear in customer Stores. Use a link to the shop or a product, including your referral code when available.'),nameLabel,urlLabel,save);view.insertBefore(form,rows);
         let editing;
         form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await api(path,{id:editing,name:partner.value,url:url.value,revision:page.revision});await refresh()}catch(err){status.textContent=err.message}finally{save.disabled=false}};
         for(const x of page.items){
           const card=node('article');card.className='panel';card.append(node('h3',x.name),node('p',x.url),button('Edit',()=>{editing=x.id;partner.value=x.name;url.value=x.url;save.textContent='Save partner';partner.focus()}),button('Remove',async()=>{if(confirm('Remove this referral link from Shops?')){await api(path,{id:x.id,remove:true,revision:page.revision});await refresh()}}));rows.append(card);
         }
       }else for(const x of page.items||page.receipts){
         const card=node('article');card.className='panel';rows.append(card);
         if(path==='accounts'){
           card.append(node('code',x.address),node('p',(x.self?'Owner':x.suspended?'Suspended':'Active')+' · Joined '+x.createdAt.slice(0,10)),button('Linked payments',()=>section('Linked payments','receipts?address='+encodeURIComponent(x.address),x.address)));
           if(!x.self)card.append(button(x.suspended?'Restore account':'Suspend account',async()=>{if(confirm(x.suspended?'Restore wallet access?':'Suspend sign-in and new purchases for this wallet?')){await api(path,{address:x.address,suspended:!x.suspended,revision:x.revision});await refresh()}}));
         }else if(address){
           card.append(node('h3','Cropped jacket · 1 test XLM'),node('p',x.status.replaceAll('_',' ')));
           for(const [label,hash] of [['Purchase',x.purchaseTx],['Affiliate payout',x.payoutTx]])if(hash)card.append(link(label+' ↗','https://stellar.expert/explorer/testnet/tx/'+encodeURIComponent(hash)),' ');
           if(x.status==='payout_pending')card.append(button('Recheck payout',async()=>{await api('recheck-payout',{id:x.id});await refresh()}));
         }else{
           card.append(node('h3',x.title),node('p',x.status+(x.price?' · KSh '+x.price.toLocaleString():'')));
           for(const piece of x.pieces){if(piece.photo){const image=node('img');image.src=piece.photo;image.alt=piece.name;image.width=90;card.append(image)}card.append(node('p',piece.name))}
           for(const [label,value] of [['Approve','approved'],['Reject','rejected']])if(value!==x.status)card.append(button(label,async()=>{await api(path+'/'+x.id,{status:value,revision:x.revision});await refresh()}));
         }
       }
       if(!rows.children.length)rows.append(node('p',address?'No verified payments linked to this wallet.':'No records yet.'));
     }
     more.hidden=true;await load();
   }
   for(const [name,path] of [['Dashboard','dashboard'],['App features','features'],['Bookings','bookings'],['Reports','reports'],['Support requests','support'],['Closet sales','review/sale'],['Donations','review/donate'],['Affiliates','affiliates'],['Partner programs','partner-programs'],['Accounts','accounts']])tabs.append(button(name,()=>section(name,path)));
   await section('Dashboard','dashboard');
 }
 try{await start()}catch(e){status.textContent=e.message}
}
