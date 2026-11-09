import {boards} from './inspiration-data.js';
import {contentCard,sectionHeader,actionLink} from './ui.js';
import {occasions} from './style-options.js';
const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el};
const button=(text,click)=>{const el=node('button',text);el.type='button';el.onclick=click;return el};
const labels={audience:'Inspiration',clothes:'Clothing type',colors:'Colour',styles:'Style'};
const normalize=text=>text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\bgrey\b/g,'gray').replace(/\bcolour\b/g,'color').replace(/\bjeans\b/g,'denim').replace(/\bolive\b/g,'green');
export function pinIdFromUrl(value){
 try{const url=new URL(value);if(url.protocol!=='https:'||!['pinterest.com','www.pinterest.com'].includes(url.hostname)||url.username||url.password)return null;return url.pathname.match(/^\/pin\/(\d{5,24})\/?$/)?.[1]||null}catch{return null}
}
export function matchingBoards(query,filters){
 const words=normalize(query).trim().split(/\s+/).filter(Boolean);
 return boards.filter(board=>Object.entries(filters).every(([key,value])=>!value||board[key].includes(value))&&words.every(word=>normalize([board.title,board.curator,...board.keywords,...Object.keys(labels).flatMap(key=>board[key])].join(' ')).includes(word)));
}
export function openInspiration({query='',onUse,reference=null,occasion='Everyday'}={}){
 const previous=document.activeElement,dialog=node('dialog');dialog.className='inspiration-dialog';dialog.setAttribute('aria-labelledby','inspiration-title');
 const close=button('×',()=>dialog.close());close.className='close';close.setAttribute('aria-label','Close inspiration');
 const header=sectionHeader({title:'Find your next look',description:'Explore Pinterest boards, choose a Pin, then match its colour and clothing details to your closet.'});header.querySelector('h2').id='inspiration-title';
 const content=node('div');dialog.append(close,header,content);document.body.append(dialog);
 let activeFrame=null,activeBoard=null;
 dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();dialog.close()}});
 dialog.addEventListener('close',()=>{window.removeEventListener('message',receivePin);dialog.remove();if(previous?.isConnected)previous.focus()},{once:true});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
 const searchLabel=node('label','Search boards'),search=node('input');search.type='search';search.value=query;search.placeholder='Black girl, office, blue denim…';searchLabel.append(search);
 const toolbar=node('div');toolbar.className='inspiration-filters';toolbar.append(searchLabel);
 const filters={},controls={};
 for(const [key,label] of Object.entries(labels)){
   filters[key]='';const field=node('label',label),select=node('select');controls[key]=select;
   const all=node('option','All');all.value='';select.append(all);
   for(const value of [...new Set(boards.flatMap(board=>board[key]))].sort()){const option=node('option',value);option.value=value;select.append(option)}
   select.onchange=()=>{filters[key]=select.value;limit=6;draw()};field.append(select);toolbar.append(field);
 }
 const clear=button('Clear filters',()=>{search.value='';for(const key of Object.keys(filters)){filters[key]='';controls[key].value=''}limit=6;draw();search.focus()});clear.className='secondary';toolbar.append(clear);
 const count=node('p');count.setAttribute('role','status');
 const grid=node('div');grid.className='inspiration-grid';
 const more=button('Show more boards',()=>{limit+=6;draw()});
 const note=node('p','Filters match board themes, not individual Pins. Olive searches include green boards. Pinterest loads when you open a board.');note.className='fine';
 let limit=6;
 function frame(src,title){const el=node('iframe');el.title=title;el.src=src;el.className='inspiration-frame';el.referrerPolicy='strict-origin-when-cross-origin';return el}
 function backButton(label,fn){const el=button(label,fn);el.className='secondary';return el}
 function receivePin(event){
   if(event.origin!==location.origin||event.source!==activeFrame?.contentWindow||!activeBoard||event.data?.type!=='looku:choose-pin')return;
   const pinId=pinIdFromUrl(event.data.url);if(!pinId)return;
   showReference({pinId,title:activeBoard.title+' inspiration',boardId:activeBoard.id},activeBoard);
 }
 window.addEventListener('message',receivePin);
 function pastePin(){
   const details=node('details');details.className='inspiration-paste';details.append(node('summary','Use a Pin link'));
   const form=node('form');form.className='stack';const label=node('label','Pinterest Pin URL'),input=node('input');input.type='url';input.required=true;input.placeholder='https://www.pinterest.com/pin/…';label.append(input);
   const message=node('p');message.setAttribute('role','status');const submit=node('button','Preview Pin');submit.type='submit';
   form.append(label,submit,message);form.onsubmit=e=>{e.preventDefault();const pinId=pinIdFromUrl(input.value.trim());if(!pinId){message.textContent='Use a full pinterest.com/pin/ link with a numeric Pin ID.';return}showReference({pinId,title:'Pinterest inspiration'})};details.append(form);return details;
 }
 function browse(board){
   activeBoard=board;
   const back=backButton('← Back to boards',()=>{catalog();search.focus()});
   const title=node('h3',board.title),credit=node('p','Curated on Pinterest by '+board.curator);
   const instruction=node('p',onUse?'Tap a Pin to choose it for your closet. You’ll select the colour and clothing details next.':'Scroll to explore this board.');instruction.className='inspiration-instruction';
   const iframe=frame('/pinterest-board.html?id='+encodeURIComponent(board.id)+(onUse?'&choose=1':''),board.title+' — Pinterest board');activeFrame=iframe;
   const fallback=actionLink({label:'Open this board on Pinterest ↗',href:board.url,external:true});
   content.replaceChildren(back,title,credit,instruction,iframe,...(onUse?[pastePin()]:[]),fallback);back.focus();dialog.scrollTop=0;
 }
 function showReference(ref,board=boards.find(b=>b.id===ref.boardId)){
   activeFrame=null;activeBoard=null;
   const back=backButton(board?'← Back to board':'← Back to boards',()=>board?browse(board):catalog());
   const layout=node('div');layout.className='inspiration-match';
   const preview=node('div');preview.append(frame('/pinterest-board.html?pin='+encodeURIComponent(ref.pinId),'Selected Pinterest inspiration'),actionLink({label:'View original Pin on Pinterest ↗',href:'https://www.pinterest.com/pin/'+ref.pinId+'/',external:true}));
   const form=node('form');form.className='stack';
   const title=node('h3','Match this inspiration');title.tabIndex=-1;
   const explanation=node('p','Choose the colour and clothing details you want to recreate. Looku matches these choices to clothes on this device.');
   const nameLabel=node('label','Reference name'),name=node('input');name.required=true;name.maxLength=100;name.value=ref.title||'Pinterest inspiration';nameLabel.append(name);
   const colorLabel=node('label','Colour to match'),color=node('input');color.type='color';color.value=/^#[0-9a-f]{6}$/i.test(ref.color)?ref.color:'#718269';colorLabel.append(color);
   const notesLabel=node('label','Clothing details'),notes=node('textarea');notes.maxLength=180;notes.rows=2;notes.placeholder='A linen shirt, wide-leg trousers and loafers';notes.value=ref.notes||'';notesLabel.append(notes);
   const occasionLabel=node('label','Occasion'),choice=node('select');for(const value of occasions)choice.add(new Option(value,value));choice.value=occasions.includes(ref.occasion)?ref.occasion:occasion;occasionLabel.append(choice);
   const privacy=node('p','Saves one active Pin reference on this device. The picture stays on Pinterest. No account or wallet is needed.');privacy.className='fine';
   const status=node('p');status.setAttribute('role','status');const submit=node('button','Save inspiration and build look');submit.type='submit';submit.disabled=!onUse;
   form.append(title,explanation,nameLabel,colorLabel,notesLabel,occasionLabel,privacy,submit,status);
   form.onsubmit=async e=>{e.preventDefault();if(!onUse)return;submit.disabled=true;status.textContent='Saving inspiration…';try{
     await onUse({pinId:ref.pinId,title:name.value.trim()||'Pinterest inspiration',color:color.value,notes:notes.value.trim(),occasion:choice.value,...(board?{boardId:board.id}:{})});dialog.close();
   }catch{status.textContent='Could not finish saving this inspiration on your device. Please try again.'}finally{submit.disabled=false}};
   layout.append(preview,form);content.replaceChildren(back,layout);dialog.scrollTop=0;title.focus();
 }
 function draw(){
   const results=matchingBoards(search.value,filters);grid.replaceChildren();count.textContent=results.length+' of '+boards.length+' boards';more.hidden=results.length<=limit;
   for(const board of results.slice(0,limit)){
     const card=contentCard({title:board.title,label:'By '+board.curator,description:[...board.audience,...board.styles].join(' · ')});card.classList.add('inspiration-card');
     card.append(button('Browse board',()=>browse(board)));grid.append(card);
   }
   if(!results.length)grid.append(node('p','No boards match all those filters. Try fewer filters or clear your search.'));
 }
 function catalog(){activeFrame=null;activeBoard=null;content.replaceChildren(toolbar,count,grid,more,note,...(onUse?[pastePin()]:[]));draw()}
 search.oninput=()=>{limit=6;draw()};catalog();dialog.showModal();
 if(reference?.pinId&&/^\d{5,24}$/.test(reference.pinId))showReference(reference);else search.focus();
}
