import {pageHeader,sectionHeader} from './ui.js';
import {emailAccount,emailHeaders} from './email-auth.js';

const questions=[
 ['Wardrobe','How do I find my wardrobe on another device?','Your wardrobe lives in this browser. In Account, open “Install looku & manage storage” to save an encrypted backup. Sign in with the same account on the other device and restore it with your backup passphrase.'],
 ['Listings','Why is my sale or donation still pending?','Public listings go through review. Private sales and donations can be shared immediately with anyone who has the link. Open your post in Community to check its status. After approval, signed-in users can see the contact email to arrange a handoff.'],
 ['Payments','Where can I find a payment receipt?','Open Wallet and look under Purchase receipts. Sign in with the wallet you used for the purchase to see its linked purchases. Demo boutique purchases use Stellar testnet.'],
 ['Wallet','How do I restore my device wallet?','In Wallet, open “Device wallet · demo”. Use your encrypted recovery file and wallet passphrase. Keep both private.'],
 ['Requests','Where will I see a support reply?','Return to Support with the same email account or wallet you used to submit the request. Open it under My requests to read replies or add a follow-up.']
];
function node(tag,text){const el=document.createElement(tag);if(text)el.textContent=text;return el}
function button(text,fn){const el=node('button',text);el.type='button';el.onclick=fn;return el}
async function userApi(data,cursor){
 const r=await fetch('/api/support'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{cache:'no-store',headers:{...await emailHeaders(),...(data?{'X-Looku-Action':'support','Content-Type':'application/json'}:{})},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
 const result=await r.json();if(!r.ok)throw Object.assign(Error(result.error||'Support is unavailable.'),{status:r.status});return result;
}
export async function ticketList(root,api,isAdmin=false){
 const list=node('div');list.className='stack';const status=node('p');status.setAttribute('role','status');
 let cursor;
 const more=button('Load more',()=>load(false)),refresh=button('Refresh requests',()=>load(true));more.hidden=true;
 root.append(refresh,list,more,status);
 function draw(t){
   const entry=node('details');entry.className='panel';entry.open=false;
   entry.append(node('summary',t.subject+' · '+t.status),node('p',t.category+' · '+new Date(t.messages[0].at).toLocaleDateString()));
   for(const m of t.messages){
     const item=node('div');item.className='support-message';
     item.append(node('strong',m.by==='Support'?'Looku support':isAdmin?'Requester':'You'),node('p',m.text));entry.append(item);
   }
   const form=node('form');form.className='stack';const label=node('label','Reply'),msg=node('textarea');msg.maxLength=2000;msg.required=!isAdmin;label.append(msg);form.append(label);
   const select=node('select');
   if(isAdmin){const state=node('label','Request status');for(const s of ['Open','In progress','Resolved'])select.add(new Option(s,s));select.value=t.status;state.append(select);form.append(state)}
   const save=node('button',isAdmin?'Save update':'Send reply'),note=node('p');note.setAttribute('role','status');form.append(save,note);entry.append(form);
   form.onsubmit=async e=>{
     e.preventDefault();save.disabled=true;
     try{
       await api({id:t.id,key:t.key,revision:t.revision,message:msg.value,status:select.value});
       await load(true);status.textContent='Request updated.';
     }catch(err){note.textContent=err.message}finally{save.disabled=false}
   };
   list.append(entry);
 }
 async function load(reset){
   more.disabled=refresh.disabled=true;status.textContent='';
   try{
     const page=await api(null,reset?undefined:cursor);
     if(reset)list.replaceChildren();
     page.items.forEach(draw);cursor=page.next;more.hidden=!cursor;
     if(!list.children.length)status.textContent='No support requests yet.';
   }finally{more.disabled=refresh.disabled=false}
 }
 more.onclick=()=>load(false).catch(e=>status.textContent=e.message);refresh.onclick=()=>load(true).catch(e=>status.textContent=e.message);
 await load(true);
 return ()=>load(true);
}
export async function mountSupport(root){
 root.innerHTML=pageHeader({eyebrow:'Help desk',title:'Support',description:'Find an answer or send us a private request.'}).outerHTML+
   '<div class="help-layout"><section class="help-faq">'+sectionHeader({title:'Frequently asked questions'}).outerHTML+'</section><section class="help-contact ui-surface" aria-label="Private support"></section></div>';
 const faq=root.querySelector('.help-faq'),area=root.querySelector('.help-contact');
 for(const [topic,q,a] of questions){
   const item=node('details'),summary=node('summary'),label=node('span',topic),copy=node('span',q);
   label.className='help-topic';summary.append(label,copy);item.append(summary,node('p',a));faq.append(item);
 }
 async function start(){
   area.replaceChildren();const kicker=node('div','Private correspondence');kicker.className='eyebrow';area.append(kicker);const form=document.createElement('form');form.className='stack';form.dataset.newTicket='';
   form.innerHTML='<h2>New support request</h2><label>Topic<select name="category"><option>Account</option><option>Wardrobe</option><option>Listings</option><option>Payments</option><option>Other</option></select></label><label>Subject<input name="subject" maxlength="100" required></label><label>How can we help?<textarea name="message" maxlength="2000" required></textarea></label><p class="fine">Only you and Looku support can see this conversation. Keep passwords, recovery files and payment details private.</p><button>Submit request</button><p role="status"></p>';
   const inbox=node('div');area.append(form,sectionHeader({title:'My requests'}),inbox);
   const submit=form.querySelector('button');submit.disabled=true;let refresh;
   try{refresh=await ticketList(inbox,userApi);submit.disabled=false}
   catch(e){
     area.replaceChildren(kicker,node('h2','Contact support'));
     if(e.status===401){
       area.append(node('p','Sign in with email to send a private request and read replies.'));
       const auth=node('div');area.append(auth);emailAccount(auth,start);const wallet=node('a','Use an existing wallet instead');wallet.href='#wallet/support';area.append(wallet);
     }else area.append(node('p',e.message),button('Try again',start));
     return;
   }
   let id=crypto.randomUUID();const note=form.querySelector('[role=status]');
   form.onsubmit=async e=>{
     e.preventDefault();submit.disabled=true;note.textContent='';
     try{
       await userApi({id,...Object.fromEntries(new FormData(form))});id=crypto.randomUUID();form.reset();
       note.textContent='Request submitted. You can read replies under My requests.';
       await refresh();
     }catch(err){note.textContent=err.message}finally{submit.disabled=false}
   };
 }
 await start();
}
