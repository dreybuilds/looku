import {boards} from './inspiration-data.js';
const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el};
const labels={audience:'Inspiration',clothes:'Clothing type',colors:'Colour',styles:'Style'};
const normalize=text=>text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\bgrey\b/g,'gray').replace(/\bcolour\b/g,'color').replace(/\bjeans\b/g,'denim');
export function matchingBoards(query,filters){
 const words=normalize(query).trim().split(/\s+/).filter(Boolean);
 return boards.filter(board=>Object.entries(filters).every(([key,value])=>!value||board[key].includes(value))&&words.every(word=>normalize([board.title,board.curator,...board.keywords,...Object.keys(labels).flatMap(key=>board[key])].join(' ')).includes(word)));
}
export function openInspiration(){
 const previous=document.activeElement,dialog=node('dialog');dialog.className='inspiration-dialog';dialog.setAttribute('aria-labelledby','inspiration-title');
 const close=node('button','×');close.type='button';close.className='close';close.setAttribute('aria-label','Close inspiration');
 const heading=node('h2','Find your next look');heading.id='inspiration-title';
 const intro=node('p','Browse curated Pinterest boards. Filter their themes, then open a board to scroll through its Pins.');
 const content=node('div');dialog.append(close,heading,intro,content);document.body.append(dialog);
 close.onclick=()=>dialog.close();dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();dialog.close()}});dialog.addEventListener('close',()=>{dialog.remove();previous?.focus()},{once:true});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
 const searchLabel=node('label','Search boards'),search=node('input');search.type='search';search.placeholder='Black girl, office, blue denim…';searchLabel.append(search);
 const toolbar=node('div');toolbar.className='inspiration-filters';toolbar.append(searchLabel);
 const filters={};const controls={};
 for(const [key,label] of Object.entries(labels)){
   filters[key]='';const field=node('label',label),select=node('select');controls[key]=select;
   const all=node('option','All');all.value='';select.append(all);
   for(const value of [...new Set(boards.flatMap(board=>board[key]))].sort()){const option=node('option',value);option.value=value;select.append(option)}
   select.onchange=()=>{filters[key]=select.value;limit=6;draw()};field.append(select);toolbar.append(field);
 }
 const clear=node('button','Clear filters');clear.type='button';clear.className='secondary';toolbar.append(clear);
 const count=node('p');count.setAttribute('role','status');
 const grid=node('div');grid.className='inspiration-grid';
 const more=node('button','Show more boards');more.type='button';
 const note=node('p','Filters match board themes. Individual Pins may vary. Pinterest loads when you open a board; its Pin links may open a new tab.');note.className='fine';
 let limit=6;
 function browse(board){
   const back=node('button','← Back to boards');back.type='button';back.className='secondary';back.onclick=()=>{catalog();search.focus()};
   const title=node('h3',board.title),credit=node('p','Curated on Pinterest by '+board.curator);
   const iframe=node('iframe');iframe.title=board.title+' — Pinterest board';iframe.src='/pinterest-board.html?id='+encodeURIComponent(board.id);iframe.className='inspiration-frame';iframe.referrerPolicy='strict-origin-when-cross-origin';
   const fallback=node('a','Open this board on Pinterest ↗');fallback.href=board.url;fallback.target='_blank';fallback.rel='noopener noreferrer';
   content.replaceChildren(back,title,credit,iframe,fallback);back.focus();dialog.scrollTop=0;
 }
 function draw(){
   const results=matchingBoards(search.value,filters);grid.replaceChildren();count.textContent=results.length+' of '+boards.length+' boards';more.hidden=results.length<=limit;
   for(const board of results.slice(0,limit)){
     const card=node('article');card.className='panel inspiration-card';
     const title=node('h3',board.title),credit=node('p','By '+board.curator);credit.className='fine';
     const tags=node('p', [...board.audience,...board.styles].join(' · '));tags.className='fine';
     const button=node('button','Browse board');button.type='button';button.onclick=()=>browse(board);
     card.append(title,credit,tags,button);grid.append(card);
   }
   if(!results.length)grid.append(node('p','No boards match all those filters. Try fewer filters or clear your search.'));
 }
 function catalog(){content.replaceChildren(toolbar,count,grid,more,note);draw()}
 search.oninput=()=>{limit=6;draw()};clear.onclick=()=>{search.value='';for(const key of Object.keys(filters)){filters[key]='';controls[key].value=''}limit=6;draw();search.focus()};
 more.onclick=()=>{limit+=6;draw()};catalog();dialog.showModal();search.focus();
}
