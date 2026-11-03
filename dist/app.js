import { walletRecord } from './local-wallet.js';
import {devicePanel,deviceAction} from './device.js';
import {garment} from './garments.js';
import {categories,occasions,sample,read,write,styleLook,processPhoto} from './model.js';
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>console.info('Offline mode unavailable'));
const main=document.querySelector('main'),dialog=document.querySelector('dialog'),body=dialog.querySelector('#dialog-body');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const options=(items,current)=>items.map(([v,t])=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(t)}</option>`).join('');
const optOcc=v=>options(occasions.map(x=>[x,x]),v);
let items=await read('items',sample),saved=await read('looks',[]),receipts=await read('receipts',[]),inspo=await read('inspo',null);
let foundPins=[];
let occasion='Everyday',variation=0,filter='',section='',toastTimer,renderId=0,stores;
const notice=t=>{const e=document.querySelector('#toast');e.textContent=t;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{e.textContent=''},4200)};
function modal(html){body.innerHTML=html;dialog.showModal()}
dialog.querySelector('.close').onclick=()=>dialog.close();
dialog.onclick=e=>{if(e.target===dialog)dialog.close()};
const card=(p,i=0)=>`<article class="card"><div class="visual" style="--bg:${esc(p.bg||'#e7e7dc')}"><span class="num">${String(i+1).padStart(2,'0')} / ${esc(categories[p.type])}</span>${p.photo?`<img alt="${esc(p.name)}" src="${esc(p.photo)}">`:garment(p.type,p.color,i)}</div><div class="meta"><h3>${esc(p.name)}</h3><small>${esc(p.occasion)}</small></div></article>`;
const title=(label,heading,desc)=>`<div class="eyebrow">${label}</div><h1 class="page-title">${heading}</h1><p class="intro">${desc}</p>`;
function addPiece(){modal(`<div class="eyebrow">Wardrobe / New piece</div><h2>Add a piece</h2><form id="add-form" class="stack"><label>Clothing photo<input required type="file" name="photo" accept="image/*"></label><label>Piece name<input required maxlength="60" name="name" placeholder="e.g. Olive linen shirt"></label><div class="row"><label>Category<select name="type">${options(Object.entries(categories),'shirt')}</select></label><label>Works best for<select name="occasion">${optOcc(occasion)}</select></label></div><small>Photos stay on this device unless you choose online backup. We sample a colour from each image for styling.</small><button>Add to wardrobe</button><p role="status"></p></form>`);
 const form=body.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{const d=new FormData(form);const name=d.get('name').trim();if(!name)throw Error('Enter a name for this piece.');const image=await processPhoto(d.get('photo'));const next=[{...image,id:crypto.randomUUID(),name,type:d.get('type'),occasion:d.get('occasion')},...items];await write('items',next);items=next;dialog.close();notice('Added to your wardrobe');render()}catch(err){form.querySelector('[role=status]').textContent=err.message}finally{button.disabled=false}}}
function gallery(){
 const subset=items.filter(x=>!filter||x.type===filter);
 return `<div class="grid">${subset.map((p,i)=>`<div>${card(p,i)}<button class="link small" data-remove="${esc(p.id)}">Remove</button></div>`).join('')||'<p class="empty">No pieces in this category yet.</p>'}</div>`
}
function studio(){return `<section class="hero"><div class="hero-copy"><div class="eyebrow">✳ &nbsp; Personal wardrobe studio</div><h1>A new look.<br><em>Already yours.</em></h1><p>Build an outfit around what you own. Find the finishing piece when you need it.</p><div class="actions"><a class="button" href="#stylist">Style an outfit ↗</a><button class="secondary" data-add>＋ Add a piece</button></div></div><div class="hero-art" aria-label="Illustrated study of a camp shirt and denim trousers"><div class="plate">${garment('shirt','#d6c194','hero1').replace('<svg','<svg class="p1"')}${garment('trousers','#708395','hero2').replace('<svg','<svg class="p2"')}</div><span class="stamp label">LOOK STUDY / 001</span><div class="swatches"><i style="--c:#d6c194"></i><i style="--c:#708395"></i><i style="--c:#414835"></i></div></div></section><div class="sectionhead"><div><div class="eyebrow">01 / The collection</div><h2>Wardrobe rail</h2></div><a class="link" href="#wardrobe">View all ${items.length} →</a></div><div class="grid cards4">${items.slice(0,4).map(card).join('')||'<p>Add your first piece to get started.</p>'}</div><p class="fine" style="margin-top:16px">Illustrated pieces are samples. Add a photo to style your own clothes.</p>`;}
function stylist(){
 const look=styleLook(items,occasion,inspo?.color,variation);
 return title('Studio / Outfit builder','Style an outfit','Choose where you’re going. Add a reference photo to match its colour with pieces on your rail.')+`<div class="toolbar"><label>Occasion<select id="occasion">${optOcc(occasion)}</select></label><label>Inspiration photo<input id="inspo" type="file" accept="image/*"></label>${inspo?`${inspo.photo?`<img width="52" height="52" alt="Your reference" src="${esc(inspo.photo)}">`:`<a href="https://www.pinterest.com/pin/${esc(inspo.pinId)}/" target="_blank" rel="noopener noreferrer">${esc(inspo.title||'Pinterest reference')} ↗</a>`}<span class="chip" style="border-color:${esc(inspo.color)}">Colour ${esc(inspo.color)}</span><button class="secondary small" data-clearref>Clear reference</button>`:''}</div><details class="panel"><summary>Find inspiration on Pinterest</summary><p>Search online using only the words you enter. Your wardrobe photos stay on this device.</p><form class="actions" id="pin-search"><label>Search Pins<input name="query" required maxlength="120" placeholder="Olive linen outfits"></label><button>Search Pinterest</button></form><p role="status" id="pin-status"></p><div id="pin-results" class="stack"></div></details><div class="sectionhead"><div><div class="eyebrow">Your fitting room</div><h2>${esc(occasion)} edit</h2></div></div><div class="grid cards4">${look.pieces.map(card).join('')||'<p>Add a piece to start an outfit.</p>'}</div><div class="actions"><button data-save ${look.pieces.length?'':'disabled'}>Save outfit</button><button class="secondary" data-remix>Try another combination</button></div><div class="panel"><h3>${look.missing.length?'Still needed for a full outfit':'Why these pieces'}</h3><p>${look.missing.length?'Add '+look.missing.map(t=>categories[t].toLowerCase()).join(' and ')+' to your rail to finish this look.':look.pieces.map(p=>esc(p.name)).join(' + ')+'.'} ${inspo?'Items closer to your reference colour rank higher.':'Pieces tagged for '+esc(occasion.toLowerCase())+' get first pick.'}</p></div>${look.layer&&look.pieces.length?`<div class="panel split"><div><div class="eyebrow">Optional finishing piece</div><h2>Cropped jacket</h2><p>Your rail has no outer layer. Try this piece from the looku demo boutique.</p></div><div><strong>1 test XLM</strong><p class="fine">Includes a 0.10 test XLM referral commission to looku. Test purchase only.</p><div class="actions"><button data-buy>Review purchase →</button></div></div></div>`:''}`
}
function showSaved(){return saved.length?saved.map(l=>`<div class="panel"><div class="eyebrow">Saved outfit</div><h3>${esc(l.name)}</h3><p>${l.pieces.map(p=>esc(p.name)).join(' · ')}</p><button class="link small" data-unsave="${esc(l.id)}">Remove saved outfit</button></div>`).join(''):'<p class="empty">Your saved outfits will appear here.</p>'}
async function render(){
 const id=++renderId;section=location.hash.slice(1)||'studio';
 document.querySelectorAll('nav a').forEach(a=>{if(a.hash==='#'+(section==='stylist'?'studio':section))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
 if(section==='wardrobe')main.innerHTML=title('Collection / Personal archive','Your wardrobe','Add the pieces you reach for and organise them by occasion.')+`<div class="toolbar"><button data-add>＋ Add a piece</button><label>Category<select id="filter">${options([['','All pieces'],...Object.entries(categories)],filter)}</select></label></div>${gallery()}<div class="sectionhead"><h2>Saved outfits</h2></div>${showSaved()}${devicePanel()}`;
 else if(section==='stylist')main.innerHTML=stylist();
 else if(section==='wallet'){main.innerHTML=title('Account / Stellar','Your wallet','Track your wardrobe budget and review your test purchases.')+'<div id="wallet-panel"></div><div class="sectionhead"><h2>Purchase receipts</h2></div><div id="receipts"></div><details class="panel"><summary>See a verified demo sale</summary><p>The test shopper paid 1 XLM for a cropped jacket. The boutique then paid 0.10 XLM to the looku account.</p><div class="row"><a target="_blank" rel="noopener" href="https://stellar.expert/explorer/testnet/tx/4f6fb6e2771c57828048ee6ebafd57150b0fa24fb47f5efb57719f30b1af8e99">Purchase ↗</a><a target="_blank" rel="noopener" href="https://stellar.expert/explorer/testnet/tx/f758f8ffa69bf2912d9819f46edb06daece16dff4023e5068a2320e3fed160e7">Commission ↗</a></div></details>';drawReceipts();try{const {mountWallet}=await import('./wallet.js');if(id===renderId)await mountWallet(document.querySelector('#wallet-panel'))}catch{if(id===renderId)document.querySelector('#wallet-panel').textContent='Wallet tools could not load. Refresh to retry.'}}
 else if(section==='shops'){main.innerHTML=title('Directory / Retail partners','Store directory','Explore fashion affiliate programs. These links lead to the retailer’s program. looku tracking links become available after approval.')+'<div class="toolbar"><label>Find a program<input type="search" id="store-search" placeholder="Store, category or region"></label></div><div id="store-list" class="store-list"></div>';try{stores??=await fetch('stores.json').then(r=>r.json());if(id===renderId)drawStores('')}catch{if(id===renderId)main.querySelector('#store-list').textContent='Store directory is unavailable. Refresh to retry.'}}
 else main.innerHTML=studio()
}
function drawStores(q){const list=stores.filter(s=>[s.name,s.region,s.note].some(v=>v.toLowerCase().includes(q.toLowerCase())));document.querySelector('#store-list').innerHTML=list.map(s=>`<article class="store"><span class="eyebrow">${esc(s.region)}</span><h3>${esc(s.name)}</h3><p class="fine">${esc(s.note)}</p><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Visit program ↗</a></article>`).join('')||'<p>No programs match your search.</p>'}
const paymentAPI=()=>import('/api/payments/client.js');
const txLink=(hash,label)=>/^[a-f0-9]{64}$/i.test(hash||'')?`<a target="_blank" rel="noopener" href="https://stellar.expert/explorer/testnet/tx/${hash}">${label} ↗</a>`:'';
function drawReceipts(){document.querySelector('#receipts').innerHTML=receipts.length?receipts.map(r=>`<div class="receipt"><h3>${esc(r.item||'Cropped jacket')}</h3><p class="status">${esc(r.status)} · Commission ${esc(r.commission??'0.10')} test XLM</p><div class="row">${txLink(r.purchaseTx,'Purchase transaction')}${txLink(r.payoutTx,'Affiliate payout')}<button class="secondary small" data-refresh="${esc(r.id)}">Refresh receipt</button></div></div>`).join(''):'<p class="empty">Your first test purchase and its affiliate payout will appear here.</p>'}
async function record(r){const next=[r,...receipts.filter(x=>x.id!==r.id)];await write('receipts',next);receipts=next}
async function checkout() {
  modal(`<div class="eyebrow">Demo boutique / Stellar testnet</div><h2>Cropped jacket</h2><p>Order total <b>1 test XLM</b>. The boutique pays looku a 0.10 test XLM commission. No physical item ships.</p>
    <form class="stack" data-local-pay hidden><label>Wallet passphrase<input type="password" name="phrase" autocomplete="current-password" required></label><button>Pay 1 test XLM with device wallet</button></form>
    <div class="actions"><button class="secondary" data-freighter>Connect Freighter</button><a href="#wallet" data-create>Create a testnet wallet</a></div>
    <p role="status"></p>`);
  const local = body.querySelector('[data-local-pay]');
  const extension = body.querySelector('[data-freighter]');
  const create = body.querySelector('[data-create]');
  const message = body.querySelector('[role=status]');
  create.onclick = () => dialog.close();
  let wallet, address;
  try { wallet = await walletRecord(); } catch (e) { message.textContent = e.message; }
  if (wallet) { local.hidden = false; create.hidden = true; }
  async function submit(useLocal) {
    const controls = [extension, local.querySelector('button')];
    if (controls.some(button => button.disabled)) return;
    controls.forEach(button => button.disabled = true);
    try {
      const api = await paymentAPI();
      if (!useLocal && !address) {
        address = await api.connectWallet();
        message.textContent = 'Connected ' + address;
        extension.textContent = 'Approve 1 test XLM in Freighter';
        return;
      }
      const signer = useLocal ? await api.unlockWallet(wallet, local.elements.phrase.value) : undefined;
      local.reset();
      if (!dialog.open || !local.isConnected) return;
      const receipt = await api.buyPiece({sku:'cropped-jacket', address:useLocal ? wallet.address : address, signer,
        onOrder:id => { if (!receipts.some(r => r.id === id)) record({id,status:'awaiting_signature',commission:'0.10'}).catch(() => notice('Receipt storage unavailable')); },
        onStatus:text => { message.textContent = text; }});
      await record(receipt);
      dialog.close();
      location.hash = 'wallet';
      notice('Order receipt saved');
    } catch (e) { message.textContent = e.message; }
    finally { local.reset(); controls.forEach(button => button.disabled = false); }
  }
  extension.onclick = () => submit(false);
  local.onsubmit = event => { event.preventDefault(); submit(true); };
  dialog.addEventListener('close', () => local.reset(), {once:true});
}
main.addEventListener('input',e=>{if(e.target.id==='store-search'&&stores)drawStores(e.target.value)});
main.addEventListener('change',async e=>{try{if(e.target.id==='filter'){filter=e.target.value;render()}if(e.target.id==='occasion'){occasion=e.target.value;variation=0;render()}if(e.target.id==='inspo'&&e.target.files[0]){const next=await processPhoto(e.target.files[0]);await write('inspo',next);inspo=next;render()}}catch(err){notice(err.message)}});
main.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
 if(b.hasAttribute('data-install')||b.hasAttribute('data-backup')){await deviceAction(b,()=>({items,looks:saved,inspo}));return}
 if(b.dataset.pin){const pin=foundPins.find(p=>p.id===b.dataset.pin);if(!pin)return;const color=b.parentElement.querySelector('input').value;const ref={pinId:pin.id,title:pin.title,color};await write('inspo',ref);inspo=ref;render();notice('Pin palette applied');return}
 if(b.hasAttribute('data-add'))addPiece();
 if(b.dataset.remove){const next=items.filter(p=>p.id!==b.dataset.remove);await write('items',next);items=next;render()}
 if(b.hasAttribute('data-remix')){const prior=styleLook(items,occasion,inspo?.color,variation).pieces.map(p=>p.id).join();variation++;render();if(styleLook(items,occasion,inspo?.color,variation).pieces.map(p=>p.id).join()===prior)notice('Add another piece in the same category for more combinations.')}
 if(b.hasAttribute('data-save')){const look=styleLook(items,occasion,inspo?.color,variation);const pieces=look.pieces.map(({id,name})=>({id,name}));if(saved.some(s=>s.name===occasion+' edit'&&s.pieces.map(p=>p.id).join()===pieces.map(p=>p.id).join()))return notice('This outfit is already saved');const next=[{id:crypto.randomUUID(),name:occasion+' edit',pieces},...saved];await write('looks',next);saved=next;notice('Outfit saved to Wardrobe')}
 if(b.dataset.unsave){const next=saved.filter(s=>s.id!==b.dataset.unsave);await write('looks',next);saved=next;render()}
 if(b.hasAttribute('data-clearref')){await write('inspo',null);inspo=null;render()}
 if(b.hasAttribute('data-buy'))checkout();
 if(b.dataset.refresh){b.disabled=true;const api=await paymentAPI();await record(await api.getReceipt(b.dataset.refresh));drawReceipts()}
 }catch(err){b.disabled=false;notice(err.message)}});
window.addEventListener('hashchange',()=>{window.scrollTo(0,0);render()});render();

main.addEventListener('submit',async e=>{
 if(e.target.id!=='pin-search')return;e.preventDefault();
 const form=e.target,status=main.querySelector('#pin-status'),results=main.querySelector('#pin-results');
 results.replaceChildren();status.textContent='Searching Pinterest…';form.querySelector('button').disabled=true;
 try{
 const response=await fetch('/api/pinterest/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:form.elements.query.value.trim()})});
 const data=await response.json();if(!response.ok)throw Error(data.error);
 foundPins=data.pins;status.textContent=foundPins.length?'Open a Pin, then choose the colour to use for your outfit.':'No Pins returned for this search.';
 results.innerHTML=foundPins.map(p=>`<div class="row"><a href="https://www.pinterest.com/pin/${esc(p.id)}/" target="_blank" rel="noopener noreferrer">${esc(p.title)} ↗</a><label>Palette colour<input type="color" value="${esc(p.color||'#718269')}"></label><button class="secondary" data-pin="${esc(p.id)}">Use this reference</button></div>`).join('');
 }catch(err){status.textContent=err.message||'Pinterest is unavailable offline.'}finally{form.querySelector('button').disabled=false}
});
