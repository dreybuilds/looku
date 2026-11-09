import {boards} from './inspiration-data.js';
import {pinIdFromUrl} from './inspiration.js';
const params=new URLSearchParams(location.search),board=boards.find(item=>item.id===params.get('id'));
const pin=params.get('pin'),pinId=/^\d{5,24}$/.test(pin||'')?pin:null;
const choosing=!!board&&params.get('choose')==='1';
const status=document.querySelector('#status'),widget=document.querySelector('#widget');
if(!board&&!pinId){status.textContent='This Pinterest reference is unavailable.'}
else{
 const link=document.createElement('a');link.href=pinId?'https://www.pinterest.com/pin/'+pinId+'/':board.url;
 link.dataset.pinDo=pinId?'embedPin':'embedBoard';
 if(pinId){link.dataset.pinWidth='medium'}
 else{link.dataset.pinBoardWidth=String(Math.max(130,Math.min(900,innerWidth-28)));link.dataset.pinScaleHeight='480';link.dataset.pinScaleWidth=innerWidth<400?'100':'150'}
 link.textContent=pinId?'View original Pin on Pinterest':'View '+board.title+' on Pinterest';link.target='_blank';link.rel='noopener noreferrer';widget.append(link);
 // Read only the URL the visitor chooses. Keep image rendering and attribution in Pinterest's widget.
 // The pasted-link flow in the parent remains available if Pinterest changes its link markup.
 if(choosing)document.addEventListener('click',event=>{
   const target=event.target.closest('[data-pin-href],a[href]');if(!target||!widget.contains(target))return;
   const url=target.dataset.pinHref||target.href;if(!pinIdFromUrl(url))return;
   event.preventDefault();event.stopImmediatePropagation();parent.postMessage({type:'looku:choose-pin',url},location.origin);
 },true);
 const timeout=setTimeout(()=>{status.textContent='Pinterest is taking longer to load. Use the original link if the images do not appear.'},15000);
 const watch=new MutationObserver(()=>{
   if(widget.querySelector('[data-pin-href*="/pin/"], a[href*="/pin/"]:not([data-pin-do])')){
     status.textContent=choosing?'Tap a Pin to choose it for your closet.':pinId?'Pinterest inspiration':'Scroll to explore this board.';clearTimeout(timeout);watch.disconnect();
   }
 });watch.observe(widget,{childList:true,subtree:true});
 const script=document.createElement('script');script.src='https://assets.pinterest.com/js/pinit.js';script.async=true;script.defer=true;
 script.onerror=()=>{clearTimeout(timeout);watch.disconnect();status.textContent='Pinterest images could not load. Check your connection or open the original link.'};document.body.append(script);
 window.addEventListener('pagehide',()=>{clearTimeout(timeout);watch.disconnect()},{once:true});
}
