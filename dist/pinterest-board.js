import {boards} from './inspiration-data.js';
const board=boards.find(item=>item.id===new URLSearchParams(location.search).get('id'));
const status=document.querySelector('#status'),widget=document.querySelector('#widget');
if(!board){status.textContent='This board is unavailable.'}
else{
 const link=document.createElement('a');link.href=board.url;link.dataset.pinDo='embedBoard';link.dataset.pinBoardWidth=String(Math.max(130,Math.min(900,innerWidth-28)));link.dataset.pinScaleHeight='480';link.dataset.pinScaleWidth=innerWidth<400?'100':'150';link.textContent='View '+board.title+' on Pinterest';link.target='_blank';link.rel='noopener noreferrer';widget.append(link);
 const timeout=setTimeout(()=>{status.textContent='Pinterest is taking longer to load. You can retry or open the board link.'},15000);
 const watch=new MutationObserver(()=>{
   if(widget.querySelector('[data-pin-href*="/pin/"], a[href*="/pin/"]')){status.textContent='Scroll to explore this board.';clearTimeout(timeout);watch.disconnect()}
 });watch.observe(widget,{childList:true,subtree:true});
 const script=document.createElement('script');script.src='https://assets.pinterest.com/js/pinit.js';script.async=true;script.defer=true;
 script.onerror=()=>{clearTimeout(timeout);watch.disconnect();status.textContent='Pinterest images could not load. Check your connection or open the board link.'};document.body.append(script);
 window.addEventListener('pagehide',()=>{clearTimeout(timeout);watch.disconnect()},{once:true});
}
