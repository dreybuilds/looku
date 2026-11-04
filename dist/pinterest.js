import {tagChoices,chosenTags} from './social.js';
import {emailHeaders} from './email-auth.js';

function node(tag,text){
 const el=document.createElement(tag);
 if(text)el.textContent=text;
 return el;
}
async function call(path,method='GET',body){
 const response=await fetch('/api/pinterest/'+path,{method,cache:'no-store',
   headers:{...await emailHeaders(),'X-Looku-Action':'pinterest','Content-Type':'application/json'},
   ...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'Pinterest is unavailable.');
 return data;
}
function action(parent,label,status,fn){
 const button=node('button',label);button.type='button';button.className='secondary small';
 button.onclick=async()=>{
   button.disabled=true;status.textContent='Loading…';
   try{await fn();if(status.textContent==='Loading…')status.textContent=''}
   catch(error){status.textContent=error.message||'Go online to use Pinterest.'}
   finally{button.disabled=false}
 };
 parent.append(button);
 return button;
}
async function choose(parent,resource,label,status,onPick){
 const select=node('select'),caption=node('label',resource==='pins'?'Your published image Pins':'Destination board');
 caption.append(select);
 let bookmark;
 async function page(){
   const result=await call(resource+(bookmark?'?bookmark='+encodeURIComponent(bookmark):''));
   for(const item of result.items)select.add(new Option(item.title,item.id));
   bookmark=result.bookmark;more.hidden=!bookmark;submit.disabled=!select.length;
   if(!select.length)status.textContent='No choices on this page.';
 }
 const controls=node('div');controls.className='stack';
 controls.append(caption);
 const tags=node('div');if(resource==='pins'){controls.append(tags);await tagChoices(tags)}
 const more=action(controls,'Load more',status,page);
 const submit=action(controls,label,status,()=>onPick(select.value,chosenTags(tags)));
 await page();parent.replaceChildren(controls);
}
export function pinterestPanel(){
 const panel=node('details');panel.className='panel';
 panel.append(node('summary','Pinterest account and imports'));
 const controls=node('div'),picker=node('div'),status=node('p');
 status.setAttribute('role','status');panel.append(controls,picker,status);
 const messages={connected:'Pinterest connected.',cancelled:'Pinterest authorization cancelled.',failed:'Could not link Pinterest. Try connecting again.'};
 const url=new URL(location.href),outcome=url.searchParams.get('pinterest');
 if(Object.hasOwn(messages,outcome)){status.textContent=messages[outcome];url.searchParams.delete('pinterest');history.replaceState(null,'',url);panel.open=true}
 async function connect(){location.assign((await call('connect','POST')).url)}
 async function load(){
   controls.replaceChildren();picker.replaceChildren();
   try{
     const {connected}=await call('connection');
     if(connected){
       action(controls,'Choose a Pin to import',status,()=>choose(picker,'pins','Publish selected Pin to Lookuwear',status,async (pinId,tags)=>{
         const result=await call('import','POST',{pinId,...(Object.keys(tags).length?{tags}:{})});location.hash='community/look/'+result.id;
         status.textContent='Published in Lookuwear.';
       }));
       action(controls,'Disconnect Pinterest',status,async()=>{await call('connection','DELETE');await load();status.textContent='Pinterest disconnected.'});
     }else action(controls,'Connect Pinterest',status,connect);
   }catch(error){status.textContent=error.message;action(controls,'Try again',status,load)}
 }
 panel.ontoggle=()=>{if(panel.open)load()};
 return panel;
}
export function postToPinterest(tools,look){
 const picker=node('div'),status=node('p');status.setAttribute('role','status');
 let button;
 button=action(tools,'Post to Pinterest',status,async()=>{
   if(!(await call('connection')).connected){status.textContent='Open Account → Pinterest account and imports to connect first.';return}
   await choose(picker,'boards','Post look to selected board',status,async boardId=>{
     const pin=await call('publish','POST',{boardId,lookId:look.id});
     const link=node('a','Open Pin on Pinterest');link.href='https://www.pinterest.com/pin/'+pin.id+'/';
     picker.replaceChildren(link);status.textContent='Posted to Pinterest.';button.hidden=true;
   });
   status.textContent='The first piece photo is the cover. The Pin links to this look and includes any social tags you published with it.';
 });
 tools.append(picker,status);
}
