import {enabled} from './features.js';
import {emailHeaders} from './email-auth.js';
const networks={Instagram:'https://www.instagram.com/',TikTok:'https://www.tiktok.com/@',Pinterest:'https://www.pinterest.com/',X:'https://x.com/'};
const el=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text||''});
async function profile(handles){
 const r=await fetch('/api/community/profile',{method:handles?'POST':'GET',cache:'no-store',headers:{...await emailHeaders(),'Content-Type':'application/json','X-Looku-Action':'community'},...(handles?{body:JSON.stringify({handles})}:{})});
 const result=await r.json();if(!r.ok)throw Object.assign(Error(result.error),{status:r.status});return result.handles;
}
export function accountDetails(){
 const panel=el('details');panel.className='panel ui-disclosure';panel.append(el('summary','Account details · social accounts'));
 const body=el('div');panel.append(body);
 panel.ontoggle=async()=>{
   if(!panel.open)return;body.textContent='Loading account details…';
   try{
     const handles=await profile(),form=el('form');form.className='stack ui-form-grid';
     form.append(el('p','Save your usernames here, then choose which ones to tag when you publish a look.'));
     for(const name of Object.keys(networks)){
       const label=el('label',name+' username'),input=el('input');input.name=name;input.value=handles[name]||'';input.placeholder='@username';input.maxLength=31;label.append(input);form.append(label);
     }
     const save=el('button','Save social accounts'),status=el('p');status.setAttribute('role','status');form.append(save,status);body.replaceChildren(form);
     form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await profile(Object.fromEntries(new FormData(form)));status.textContent='Social accounts saved.'}catch(error){status.textContent=error.message}finally{save.disabled=false}};
   }catch(error){body.textContent=error.message}
 };
 return panel;
}
export async function tagChoices(container){
 container.replaceChildren();if(!enabled('social'))return;let saved;
 try{saved=await profile()}catch(error){if(error.status!==401)container.textContent='Social accounts could not load.';return}
 const entries=Object.entries(saved);
 if(!entries.length){container.textContent='Add usernames in Account → Social accounts to tag them on looks.';return}
 const field=el('fieldset');field.append(el('legend','Tag social accounts on this look'));
 for(const [name,handle] of entries){
   const label=el('label',name+' @'+handle),check=el('input');check.type='checkbox';check.dataset.network=name;check.value=handle;label.prepend(check);field.append(label);
 }
 container.replaceChildren(field);
}
export function chosenTags(container){
 return Object.fromEntries([...container.querySelectorAll('input[data-network]:checked')].map(input=>[input.dataset.network,input.value]));
}
export function tagLinks(tags){
 const links=el('div');links.className='actions';
 for(const [name,handle] of Object.entries(tags||{})){
   if(!Object.hasOwn(networks,name))continue;
   const a=el('a',name+' @'+handle);a.href=networks[name]+encodeURIComponent(handle);a.target='_blank';a.rel='noopener noreferrer';links.append(a);
 }
 return links;
}
