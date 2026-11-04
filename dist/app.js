import {mountWishlist,receiveSharedLink} from './wishlist.js';
import {prices,currency,money,budgetUnits,profileFields,fillProfile,readProfile,saveProfile,mountProfile} from './shopping.js';
import {mountCommunity,composePost} from './community.js';
import {interpretLook} from './look-prompt.js';
import { walletRecord, accountCall } from './local-wallet.js';
import {devicePanel,deviceAction,requestInstall} from './device.js';
import {garment} from './garments.js';
import {categories,occasions,sample,read,write,styleLook,processPhoto} from './model.js';
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>console.info('Offline mode unavailable'));
const main=document.querySelector('main'),dialog=document.querySelector('dialog'),body=dialog.querySelector('#dialog-body');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const options=(items,current)=>items.map(([v,t])=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(t)}</option>`).join('');
const optOcc=v=>options(occasions.map(x=>[x,x]),v);
let items=await read('items',sample),saved=await read('looks',[]),receipts=await read('receipts',[]),inspo=await read('inspo',null);
let foundPins=[];
let lookRequest = null;
let promptDraft = '';
let paletteBook = await read('palette-book',{active:'',entries:[]});
const presets = [
 {id:'orchid',name:'Orchid Hour',colors:['#a77bb6','#544160','#d599ae']},
 {id:'citrus',name:'Citrus Market',colors:['#e2df70','#648454','#f5a562']},
 {id:'denim',name:'Blue Note',colors:['#354e75','#86a9c4','#e5dcd0']},
 {id:'clay',name:'Clay Studio',colors:['#b85f47','#dcad88','#715548']},
 {id:'noir',name:'After Dark',colors:['#292530','#70677c','#c1bac8']},
 {id:'coast',name:'Sea Glass',colors:['#387773','#a2c7b5','#e8d7b9']}
];
const activePalette = () => [...presets,...paletteBook.entries].find(entry => entry.id === paletteBook.active);
function paletteEditor() {
 const palette=activePalette();
 const colors=palette?.colors || ['#a77bb6','#544160','#d599ae'];
 return `<section class="panel palette-library" aria-labelledby="palette-title"><span class="eyebrow">Stylist / Colour</span><h2 id="palette-title">Choose a palette</h2>
 <div class="palette-list">${presets.map(p=>`<button type="button" class="palette-choice" data-preset="${p.id}" aria-pressed="${p.id===paletteBook.active}"><span class="colour-strip" aria-hidden="true">${p.colors.map(c=>`<i style="background:${c}"></i>`).join('')}</span>${p.name}<span aria-hidden="true">${p.id===paletteBook.active?'✓':'↗'}</span></button>`).join('')}</div>
 <details><summary>Custom style palette${palette?' · '+esc(palette.name):''}</summary><form id="custom-palette" class="stack">
 <label>Saved palette<select id="saved-palette">${options([['','New palette'],...presets.map(p=>[p.id,p.name]),...paletteBook.entries.map(p=>[p.id,p.name])],paletteBook.active)}</select></label>
 <label>Palette name<input name="paletteName" maxlength="48" required value="${esc(palette?.name||'')}" placeholder="Weekend lilacs"></label>
 <div class="row">${colors.map((c,i)=>`<label>Colour ${i+1}<input type="color" name="swatch" value="${esc(c)}"></label>`).join('')}</div>
 <p class="fine">Your outfit uses pieces closest to any of the three colours. Palettes are saved on this device.</p>
 <div class="row"><button>Save and style</button>${palette?'<button type="button" class="secondary" data-palette-off>Stop using palette</button>':''}</div></form></details></section>`;
}
async function setPaletteBook(next) { await write('palette-book',next);paletteBook=next;variation=0;await render(); }

const currentLook = () => styleLook(items,occasion,[lookRequest?.color,...(lookRequest?.gptColors||[]),...(activePalette()?.colors || []),inspo?.color].filter(Boolean),variation,lookRequest);
const editName = () => lookRequest?.text || occasion+' edit';
let occasion='Everyday',variation=0,filter='',section='',toastTimer,renderId=0,stores;
const notice=t=>{const e=document.querySelector('#toast');e.textContent=t;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{e.textContent=''},4200)};
function modal(html) {
 body.innerHTML = html;
 body.querySelector('h2').id = 'dialog-title';
 dialog.setAttribute('aria-labelledby','dialog-title');
 dialog.showModal();
}
document.querySelector('.skip-link').onclick = event => { event.preventDefault(); main.focus(); };
dialog.querySelector('.close').onclick=()=>dialog.close();
dialog.onclick=e=>{if(e.target===dialog)dialog.close()};
const currencyPicker=document.querySelector('#shop-currency');
currencyPicker.value=currency();
currencyPicker.onchange=()=>{localStorage.setItem('looku.currency',currencyPicker.value);render()};
let checkoutDraft=null;
const samplePhoto = piece => /^sample[1-4]$/.test(piece.id) ? '/'+piece.id+'.webp' : '';
const card=(p,i=0)=>`<article class="card"><div class="visual" style="--bg:${esc(p.bg||'#e7e7dc')}"><span class="num">${String(i+1).padStart(2,'0')} / ${esc(categories[p.type])}</span>${(p.photo || samplePhoto(p))?`<img class="${p.photo?'upload-photo':'sample-photo'}" alt="${esc(p.name)}" src="${esc(p.photo || samplePhoto(p))}">`:garment(p.type,p.color,i)}</div><div class="meta"><h3>${esc(p.name)}</h3><small>${esc(p.occasion)}</small></div></article>`;
const title=(label,heading,desc)=>`<div class="eyebrow">${label}</div><h1 class="page-title">${heading}</h1><p class="intro">${desc}</p>`;
document.querySelector('#install-looku').onclick = async () => {
 const message = await requestInstall();
 if (message) modal('<h2>Install looku</h2><p>'+esc(message)+'</p>');
};
function addPiece(){modal(`<div class="eyebrow">Wardrobe / New piece</div><h2>Add a piece</h2><form id="add-form" class="stack"><label>Clothing photo<input required type="file" name="photo" accept="image/*"></label><label>Piece name<input required maxlength="60" name="name" placeholder="e.g. Olive linen shirt"></label><div class="row"><label>Category<select name="type">${options(Object.entries(categories),'shirt')}</select></label><label>Works best for<select name="occasion">${optOcc(occasion)}</select></label></div><small>Photos stay on this device until you publish them or choose encrypted backup. We sample a colour from each image for styling.</small><div class="actions"><button>Add to wardrobe</button><button type="submit" value="style" class="secondary">Add and style</button></div><p role="status"></p></form>`);
 const form=body.querySelector('form');
 form.onsubmit=async event=>{
   event.preventDefault();
   const openStylist=event.submitter?.value==='style';
   const buttons=[...form.querySelectorAll('button')];
   if(buttons.some(button=>button.disabled))return;
   buttons.forEach(button=>button.disabled=true);
   try{
     const fields=new FormData(form);
     const name=fields.get('name').trim();
     if(!name)throw Error('Enter a name for this piece.');
     const image=await processPhoto(fields.get('photo'));
     const piece={...image,id:crypto.randomUUID(),name,type:fields.get('type'),occasion:fields.get('occasion')};
     const next=[piece,...items];
     await write('items',next);
     items=next;
     if(filter && filter!==piece.type)filter=piece.type;
     dialog.close();
     if(openStylist){
       promptDraft='Style my '+piece.name+' for '+piece.occasion.toLowerCase();
       lookRequest=interpretLook(promptDraft,items);
       occasion=piece.occasion;
       variation=0;
       location.hash='stylist';
     }
     await render();
     notice('Added to your wardrobe');
   }catch(error){form.querySelector('[role=status]').textContent=error.message}
   finally{buttons.forEach(button=>button.disabled=false)}
 };
}
function gallery(){
 const subset=items.filter(x=>!filter||x.type===filter);
 return `<div class="grid">${subset.map((p,i)=>`<div>${card(p,i)}${samplePhoto(p)?'':`<div class="actions"><button class="secondary small" data-sale="${esc(p.id)}">Sell</button><button class="secondary small" data-donate="${esc(p.id)}">Donate</button></div>`}<button class="link small" data-remove="${esc(p.id)}">Remove</button></div>`).join('')||'<p class="empty">No pieces in this category yet.</p>'}</div>`
}
function studio() {
 return `<section class="hero campaign">
   <div class="hero-copy"><div class="eyebrow"><span class="spark">✷</span> Lookbook &nbsp;/&nbsp; Vol. 01</div>
   <h1>The Orchid<br><em>Edit.</em></h1><p>Lilac nylon, dark denim, a flash of pink. Find your own take with the pieces on your rail.</p>
   <div class="actions"><button data-edit-palette>Style this palette ↗</button><button class="secondary" data-add>Add a piece</button></div></div>
   <div class="campaign-images"><img class="portrait" src="/orchid-portrait.webp" alt="Model in plum sunglasses and a lilac windbreaker with pink piping" fetchpriority="high"><img class="textile" src="/orchid-detail.webp" alt="Silver zipper, lilac nylon and indigo denim in detail"><span class="plate-caption">01 &nbsp;/&nbsp; ORCHID</span></div>
 </section>
 <div class="studio-tools">
   <section class="studio-shortcuts"><div class="eyebrow">Your studio</div><h2>On the rail</h2>
   <div class="shortcut-list"><button data-add><span>Add a piece</span><span aria-hidden="true">＋</span></button>
   <a href="#wishlist"><span>Your wishlist</span><span aria-hidden="true">↗</span></a>
   <a href="#wardrobe"><span>Your wardrobe <small>${items.length} pieces</small></span><span aria-hidden="true">↗</span></a>
   <a href="#wallet"><span>Your wallet</span><span aria-hidden="true">↗</span></a></div></section>
   <section class="object-study"><div class="object-head"><div><div class="eyebrow">Object study &nbsp;/&nbsp; 001</div><h2>Orchid frames</h2></div><span class="chip">3D</span></div>
   <div class="turntable" role="img" aria-label="Rotatable 3D study of glossy orchid sunglasses with smoked lenses"></div>
   <div class="object-controls"><label>Rotate the frames<input aria-label="Rotate the frames" id="turn-frame" type="range" min="0" max="23" value="0" aria-valuetext="0 degrees"></label><a href="/orchid-frames.glb" download="looku-orchid-frames.glb">3D file ↓</a></div></section>
 </div>
 <div class="sectionhead"><div><div class="eyebrow">Your collection</div><h2>Wardrobe rail</h2></div><a class="link" href="#wardrobe">View all ${items.length} →</a></div><div class="grid cards4">${items.slice(0,4).map(card).join('')||'<p>Add your first piece to get started.</p>'}</div><p class="fine" style="margin-top:16px">The starter collection features four studio portraits. Add a photo to style your own clothes.</p>`;
}
function stylist(){
 const look=currentLook();
 return title('Studio / Outfit builder','Style an outfit','Choose where you’re going. Add a reference photo to match its colour with pieces on your rail.')+`<form id="look-prompt" class="panel prompt-panel"><label for="look-brief">Describe your look</label>
 <input id="look-brief" name="brief" required maxlength="180" value="${esc(promptDraft)}" placeholder="A lilac top and denim for brunch">
 <p class="fine">Try a colour, a favourite piece or an occasion. Choose Build my look to match clothes on this device.</p>
 <div class="row"><button>Build my look</button></div><details><summary>Online styling advice</summary><p class="fine">For a styling tip, sign in with your <a href="#wallet">wallet</a>. Only your description goes to the online styling service. Your wardrobe photos stay on this device.</p><button type="submit" name="engine" value="gpt" class="secondary">Get styling advice</button></details><p role="status" data-prompt-status></p><div class="row">${lookRequest?'<button type="button" class="secondary" data-reset-prompt>Clear description</button>':''}</div></form>
 ${paletteEditor()}<div class="toolbar"><label>Occasion<select id="occasion">${optOcc(occasion)}</select></label><label>Inspiration photo<input id="inspo" type="file" accept="image/*"></label>${inspo?`${inspo.photo?`<img width="52" height="52" alt="Your reference" src="${esc(inspo.photo)}">`:`<a href="https://www.pinterest.com/pin/${esc(inspo.pinId)}/" target="_blank" rel="noopener noreferrer">${esc(inspo.title||'Pinterest reference')} ↗</a>`}<span class="chip" style="border-color:${esc(inspo.color)}">Colour ${esc(inspo.color)}</span><button class="secondary small" data-clearref>Clear reference</button>`:''}</div><details class="panel"><summary>Find inspiration on Pinterest</summary><p>Search online using only the words you enter. Your wardrobe photos stay on this device.</p><form class="actions" id="pin-search"><label>Search Pins<input name="query" required maxlength="120" placeholder="Olive linen outfits"></label><button>Search Pinterest</button></form><p role="status" id="pin-status"></p><div id="pin-results" class="stack"></div></details><div class="sectionhead"><div><div class="eyebrow">Your fitting room</div><h2 id="outfit-result" tabindex="-1">${esc(occasion)} edit</h2></div></div>${lookRequest?`<p class="prompt-feedback" role="status">${lookRequest.tip?esc(lookRequest.tip)+' · ':''}${esc([lookRequest.occasion, lookRequest.colorName, ...lookRequest.terms, ...lookRequest.excluded.map(term=>'excluding '+term)].filter(Boolean).join(' · ') || 'No matching details found. Showing your current wardrobe combination.')}</p>`:''}<div class="grid cards4">${look.pieces.map(card).join('')||'<p>Add a piece to start an outfit.</p>'}</div><div class="actions"><button data-save ${look.pieces.length?'':'disabled'}>Save outfit</button><button class="secondary" data-remix>Try another combination</button><a class="link" href="#wardrobe" data-saved-link>View saved outfits</a></div><div class="panel"><h3>${look.missing.length?'Still needed for a full outfit':'Why these pieces'}</h3><p>${look.missing.length?'Add '+look.missing.map(t=>categories[t].toLowerCase()).join(' and ')+' to your rail to finish this look.':look.pieces.map(p=>esc(p.name)).join(' + ')+'.'} ${activePalette()?'Colour match: '+esc(activePalette().name)+'.':inspo?'Items closer to your reference colour rank higher.':'Pieces tagged for '+esc(occasion.toLowerCase())+' get first pick.'}</p></div>${look.layer&&look.pieces.length?`<div class="panel split"><div><div class="eyebrow">Optional finishing piece</div><h2>Cropped jacket</h2><p>Your rail has no outer layer. Try this piece from the looku demo boutique.</p></div><div><strong>${money()}</strong><p class="fine">The boutique pays looku ${money(.1)} for the referral. Demo order.</p><div class="actions"><button data-buy>Review purchase →</button></div></div></div>`:''}`
}
function showSaved(){return saved.length?saved.map(l=>`<div class="panel"><div class="eyebrow">Saved outfit</div><h3>${esc(l.name)}</h3><p>${l.pieces.map(p=>esc(p.name)).join(' · ')}</p><details><summary>View outfit pieces</summary><div class="grid cards4">${l.pieces.map((piece,index)=>{const garment=items.find(item=>item.id===piece.id);return garment?card(garment,index):`<p class="fine">${esc(piece.name)} · removed from wardrobe</p>`}).join('')}</div></details><button class="secondary small" data-publish="${esc(l.id)}">Publish look</button> <button class="link small" data-unsave="${esc(l.id)}">Remove saved outfit</button></div>`).join(''):'<p class="empty">Your saved outfits will appear here.</p>'}
function showAdminNavigation(){
 const nav=document.querySelector('header nav');
 if(nav.querySelector('a[href="#admin"]'))return;
 const home=document.createElement('a');
 home.href='#admin';home.className='nav-link';home.textContent='Admin home';
 nav.prepend(home);
 const logo=document.querySelector('header .logo');logo.href='#admin';logo.setAttribute('aria-label','Looku admin home');
 for(const link of [home,logo])link.addEventListener('click',event=>{
   if(location.hash!=='#admin'||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
   event.preventDefault();render();main.focus();
 });
}
receiveSharedLink();
async function render(){
 const id=++renderId;section=location.hash.slice(1)||(location.hostname==='admin.lookuwear.xyz'?'admin':'welcome');
 if(['lookuwear.xyz','www.lookuwear.xyz'].includes(location.hostname)&&section==='admin'){location.replace('https://admin.lookuwear.xyz/');return}
 if(section==='admin')sessionStorage.setItem('looku.admin-navigation','1');
 if(location.hostname==='admin.lookuwear.xyz'||sessionStorage.getItem('looku.admin-navigation'))showAdminNavigation();
 document.querySelectorAll('nav a').forEach(a=>{a.classList.toggle('active',a.hash==='#'+section.split('/')[0]);if(a.hash==='#'+section.split('/')[0])a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
 document.body.classList.toggle('entry',section==='welcome');
 if(section==='wishlist'||section.startsWith('wishlist?')){await mountWishlist(main);return}
 if(section==='welcome'){
   main.innerHTML='<div id="welcome"></div>';
   const root=main.firstElementChild;
   const {mountWelcome}=await import('./welcome.js');
   if(root.isConnected)await mountWelcome(root);
 }
 else if(section==='wardrobe')main.innerHTML=title('Collection / Personal archive','Your wardrobe','Add the pieces you reach for and organise them by occasion.')+`<div class="toolbar"><button data-add>＋ Add a piece</button><a class="link" href="#stylist">Style an outfit →</a><a class="link" href="#wishlist">Wishlist</a><label>Category<select id="filter">${options([['','All pieces'],...Object.entries(categories)],filter)}</select></label></div><details class="panel" id="shopping-profile"></details>${gallery()}<div class="sectionhead"><h2 id="saved-heading" tabindex="-1">Saved outfits</h2></div>${showSaved()}${devicePanel()}`;
 else if(section==='community'||section.startsWith('community/')){
   main.innerHTML=title('Looku Wear / Community','Community closet','Discover outfits, shop a closet sale or find a piece someone is giving away.')+'<section id="community-feed"></section>';
   await mountCommunity(main.querySelector('#community-feed'),section.split('/').slice(1));
 }
 else if(section==='support'){
   main.innerHTML=title('Looku Wear / Help','Support','Find an answer or send a private request to Looku support.')+'<section id="support-area"></section>';
   const panel=main.querySelector('#support-area');
   const {mountSupport}=await import('./support.js');await mountSupport(panel);
 }
 else if(section==='admin'){
   main.innerHTML=title('Looku Wear / Administration','Admin workspace','Review community listings, manage affiliate links and inspect wallet accounts.')+'<section id="admin-workspace"></section>';
   const panel=main.querySelector('#admin-workspace');
   const {mountAdmin}=await import('./admin.js');await mountAdmin(panel);
 }
 else if(section==='stylist')main.innerHTML=stylist();
 else if(section==='wallet'||section==='wallet/admin'||section==='wallet/support'){
   main.innerHTML=title('Account / Shopping','Your wallet','Choose a wallet action.')+'<p><a class="link" href="#wishlist">Wishlist savings goals →</a></p><div id="wallet-panel"></div><a href="#admin">Owner workspace</a>';
   try{
     const {mountWallet}=await import('./wallet.js');
     if(id!==renderId)return;
     const panel=main.querySelector('#wallet-panel');
     await mountWallet(panel);
     if(id!==renderId)return;
     if(section==='wallet/admin'||section==='wallet/support')panel.querySelector('.wallet-panel').open=true;
     if(sessionStorage.getItem('looku.return-to-order')){
       panel.querySelector('.wallet-panel').open=true;
       panel.insertAdjacentHTML('afterbegin',`<section class="alert order-return"><strong>Cropped jacket · ${money()}</strong><p>Once your wallet is funded, return to review the order.</p><div class="row"><button data-buy>Return to checkout</button><button class="secondary" data-cancel-order>Dismiss order</button></div></section>`);
     }
     panel.insertAdjacentHTML('afterend','<div class="sectionhead"><h2>Purchase receipts</h2></div><div id="receipts"></div><details class="panel"><summary>See a verified demo sale</summary><p>See the shopper’s payment and the boutique’s referral payout in the payment records.</p><div class="row"><a target="_blank" rel="noopener" href="https://stellar.expert/explorer/testnet/tx/4f6fb6e2771c57828048ee6ebafd57150b0fa24fb47f5efb57719f30b1af8e99">Purchase ↗</a><a target="_blank" rel="noopener" href="https://stellar.expert/explorer/testnet/tx/f758f8ffa69bf2912d9819f46edb06daece16dff4023e5068a2320e3fed160e7">Commission ↗</a></div></details>');
     drawReceipts();
     if(sessionStorage.getItem('looku.show-receipt')){
       sessionStorage.removeItem('looku.show-receipt');
       const receiptList=main.querySelector('#receipts');
       receiptList.tabIndex=-1;
       receiptList.focus();
     }
   }catch{if(id===renderId)main.querySelector('#wallet-panel').textContent='Wallet tools could not load. Refresh to retry.'}
 }
 else if(section==='boutique/looku/cropped-jacket'){
   main.innerHTML=title('looku referral / Demo boutique','Cropped jacket','An optional layer to finish your look.')+`<section class="panel stack"><h2>${money()}</h2><p>Delivery included. The boutique pays looku ${money(.1)} for the referral. Practice order only.</p><button data-buy>Review purchase →</button></section>`;
 }
 else if(section==='shops'){main.innerHTML=title('Directory / Retail partners','Store directory','Explore fashion affiliate programs. These links lead to the retailer’s program. looku tracking links become available after approval.')+`<p><a class="button secondary" href="#wishlist">Wishlist · save a product link</a></p><section class="panel"><div class="eyebrow">Featured partner · Practice order</div><h2>Demo boutique</h2><p>Cropped jacket · ${money()} · Delivery included</p><a class="button" href="#boutique/looku/cropped-jacket">Shop the jacket</a></section>`+'<details class="panel"><summary>Kenya applications and next steps</summary><ul id="kenya-applications"></ul></details><div class="toolbar"><label>Find a program<input type="search" id="store-search" placeholder="Store, category or region"></label></div><div id="store-list" class="store-list"></div>';try{const catalog=await fetch('stores.json').then(r=>r.json());
 const partners=await fetch('/api/affiliates',{cache:'no-store'}).then(r=>r.json()).catch(()=>({}));if(id===renderId){
 stores=[...(partners.items||[]).map(p=>({name:p.name,region:'Affiliate partner',note:'Looku may earn a commission through this link.',url:p.url,referral:true})),...catalog];
 drawStores('');
 main.querySelector('#kenya-applications').innerHTML=stores.filter(s=>s.application).map(s=>`<li><b>${esc(s.name)}</b> · ${esc(s.application)}<p>${esc(s.nextStep)} <a href="${esc(s.url)}" target="_blank" rel="noopener">Official program ↗</a></p></li>`).join('');
 }}catch{if(id===renderId)main.querySelector('#store-list').textContent='Store directory is unavailable. Refresh to retry.'}}
 else main.innerHTML=studio();
 if(section==='wardrobe')mountProfile(main.querySelector('#shopping-profile'));
 if (section === 'wardrobe' && sessionStorage.getItem('looku.show-saved')) {
   sessionStorage.removeItem('looku.show-saved');
   document.querySelector('#saved-heading')?.focus();
 }
}
function drawStores(q){const list=stores.filter(s=>[s.name,s.region,s.note].some(v=>v.toLowerCase().includes(q.toLowerCase())));document.querySelector('#store-list').innerHTML=list.map(s=>`<article class="store"><span class="eyebrow">${esc(s.region)}</span><h3>${esc(s.name)}</h3><p class="fine">${esc(s.note)}</p>${s.shop?`<a href="${esc(s.shop)}" target="_blank" rel="noopener noreferrer">Shop ${esc(s.name)} ↗</a>`:''}<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer sponsored">${s.referral?'Shop via referral':'Visit program'} ↗</a></article>`).join('')||'<p>No programs match your search.</p>'}
const paymentAPI=()=>import('/api/payments/client.js');
const txLink=(hash,label)=>/^[a-f0-9]{64}$/i.test(hash||'')?`<a target="_blank" rel="noopener" href="https://stellar.expert/explorer/testnet/tx/${hash}">${label} ↗</a>`:'';
const purchaseStates={
 awaiting_signature:'Waiting for wallet approval',confirming_purchase:'Confirming payment',
 payout_pending:'Payment confirmed',complete:'Payment confirmed',failed:'Payment failed'
};
function drawReceipts(){
 const list=document.querySelector('#receipts');
 if(!list)return;
 list.innerHTML=receipts.length?receipts.map(receipt=>{
   const purchase=receipt.purchaseTx?'Payment confirmed':purchaseStates[receipt.status]||'Check payment status';
   const affiliate=receipt.payoutTx?'Paid to looku':receipt.purchaseTx?'Awaiting payout':'Awaiting purchase';
   const refresh=['complete','failed'].includes(receipt.status)?'':`<button class="secondary small" data-refresh="${esc(receipt.id)}">Refresh receipt</button>`;
   return `<article class="receipt"><h3>${esc(receipt.item||'Cropped jacket')}</h3>
   ${receipt.selection?`<p>Size ${esc(receipt.selection.size)} · Demo order</p>`:''}<p><strong>Your purchase</strong> · ${money(receipt.amount||1)} · ${purchase}</p>
   <p><strong>Affiliate payout</strong> · ${money(receipt.commission??.1)} · ${affiliate}</p>
   <div class="row">${txLink(receipt.purchaseTx,'Purchase transaction')}${txLink(receipt.payoutTx,'Affiliate payout')}${refresh}</div></article>`;
 }).join(''):'<p class="empty">Your first test purchase and its affiliate payout will appear here.</p>';
}
async function record(r){const next=[r,...receipts.filter(x=>x.id!==r.id)];await write('receipts',next);receipts=next}
async function checkout() {
  const unit=currency();
  modal(`<div class="eyebrow">Demo boutique / Practice order</div><h2>Cropped jacket</h2><p>Total <b>${money()}</b>, including delivery. The boutique pays looku ${money(.1)}. This is a demo price. No real money is charged and no item ships.</p>
    <form class="stack" data-order-fields><h3>Size and delivery</h3><p>Review the details the agent will send to the demo boutique. You can use example details.</p><button type="button" class="secondary" data-example>Use example details</button>${profileFields(true)}<button type="button" class="secondary" data-save-delivery>Remember these details on this device</button><span data-saved-detail aria-live="polite"></span></form>
    <section class="panel stack"><label>Spending limit · ${unit}<input data-agent-limit type="text" inputmode="decimal" value="${prices[unit]}" maxlength="16"></label><p class="fine">Approve one jacket from the demo boutique. The agent checks the price and merchant before your wallet signs.</p><button type="button" class="secondary" data-check-limit>Check my limit</button></section>
    <form class="stack" data-local-pay hidden><label>Wallet passphrase<input type="password" name="phrase" autocomplete="current-password" required></label><button>Place demo order · ${money()}</button></form>
    <div class="actions"><button class="secondary" data-freighter>Use an external wallet</button><a href="#wallet" data-create>Set up checkout</a></div>
    <p role="status" data-order-status></p>`);
  const local = body.querySelector('[data-local-pay]');
  const extension = body.querySelector('[data-freighter]');
  const create = body.querySelector('[data-create]');
  const message = body.querySelector('[data-order-status]');
  const budget = body.querySelector('[data-agent-limit]');
  const deliveryForm=body.querySelector('[data-order-fields]');
  fillProfile(deliveryForm);
  if(checkoutDraft)for(const [k,v] of Object.entries(checkoutDraft))if(deliveryForm.elements[k])deliveryForm.elements[k].value=v;
  deliveryForm.onsubmit=event=>event.preventDefault();
  deliveryForm.querySelector('[data-save-delivery]').onclick=()=>{
    if(!deliveryForm.reportValidity())return;
    try{saveProfile(readProfile(deliveryForm));deliveryForm.querySelector('[data-saved-detail]').textContent='Saved for future orders.'}
    catch{deliveryForm.querySelector('[data-saved-detail]').textContent='Could not save on this device.'}
  };
  body.querySelector('[data-example]').onclick=()=>{
    const sample={name:'Demo Shopper',street:'10 Example Lane',city:'Nairobi',country:'Kenya',postal:'00100',phone:'',jacket:'M'};
    for(const [k,v] of Object.entries(sample))deliveryForm.elements[k].value=v;
  };
  if(sessionStorage.getItem('looku.return-to-order') && sessionStorage.getItem('looku.limit-unit')===unit)budget.value=sessionStorage.getItem('looku.jacket-limit')??String(prices[unit]);
  body.querySelector('[data-check-limit]').onclick = async () => {
    try {
      budgetUnits(budget.value.trim(),unit);
      message.textContent='The jacket fits your limit. Choose a wallet to approve this purchase.';
    } catch (error) { message.textContent=error.message; }
  };
  create.onclick = () => { checkoutDraft=readProfile(deliveryForm);sessionStorage.setItem('looku.limit-unit',unit);sessionStorage.setItem('looku.jacket-limit',budget.value.trim()); sessionStorage.setItem('looku.return-to-order','1'); dialog.close(); };
  let wallet, address;
  try { wallet = await walletRecord(); } catch (e) { message.textContent = e.message; }
  if (wallet) { local.hidden = false; create.hidden = true; }
  async function submit(useLocal) {
    const controls = [extension, local.querySelector('button')];
    if (controls.some(button => button.disabled)) return;
    controls.forEach(button => button.disabled = true);
    try {
      const api = await paymentAPI();
      const limit=budgetUnits(budget.value.trim(),unit);
      if(!deliveryForm.reportValidity())return;
      const details={...readProfile(deliveryForm),referral:'looku'};
      if (!useLocal && !address) {
        address = await api.connectWallet();
        message.textContent = 'Connected ' + address;
        extension.textContent = 'Place demo order · '+money();
        return;
      }
      message.textContent=useLocal?'Unlocking your wallet and checking the order…':'Checking the order…';
      const signer = useLocal ? await api.unlockWallet(wallet, local.elements.phrase.value) : undefined;
      local.reset();
      if (!dialog.open || !local.isConnected) return;
      const receipt = await api.buyPiece({limit,details,sku:'cropped-jacket', address:useLocal ? wallet.address : address, signer,
        onOrder:id => { if (!receipts.some(r => r.id === id)) return record({id,status:'awaiting_signature',commission:'0.10'}).catch(() => notice('Receipt storage unavailable')); },
        onStatus:text => { message.textContent = text; }});
      await record(receipt);
      checkoutDraft=null;
      sessionStorage.removeItem('looku.return-to-order');
      sessionStorage.removeItem('looku.jacket-limit');
      sessionStorage.setItem('looku.show-receipt','1');
      dialog.close();
      if (location.hash === '#wallet') await render();
      location.hash = 'wallet';
      notice('Order receipt saved');
    } catch (e) { message.textContent = e.message; }
    finally { local.reset(); controls.forEach(button => button.disabled = false); }
  }
  extension.onclick = () => submit(false);
  local.onsubmit = event => { event.preventDefault(); submit(true); };
  dialog.addEventListener('close', () => local.reset(), {once:true});
}
main.addEventListener('input', e => {
 if(e.target.id==='look-brief') promptDraft=e.target.value;
 if (e.target.id !== 'turn-frame') return;
 const frame = e.target.valueAsNumber;
 main.querySelector('.turntable').style.backgroundPosition = (frame % 6 * 20) + '% ' + (Math.floor(frame / 6) * 100 / 3) + '%';
 e.target.setAttribute('aria-valuetext', (frame * 15) + ' degrees');
});
main.addEventListener('input',e=>{if(e.target.id==='store-search'&&stores)drawStores(e.target.value)});
main.addEventListener('change',async e=>{try{if(e.target.id==='saved-palette'){await setPaletteBook({...paletteBook,active:e.target.value});const form=main.querySelector('#custom-palette');form.closest('details').open=true;form.elements.paletteName.focus();return}if(e.target.id==='filter'){filter=e.target.value;render()}if(e.target.id==='occasion'){lookRequest=null;occasion=e.target.value;variation=0;render()}if(e.target.id==='inspo'&&e.target.files[0]){lookRequest=null;const next=await processPhoto(e.target.files[0]);await write('inspo',next);inspo=next;render()}}catch(err){notice(err.message)}});
main.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
 if(b.hasAttribute('data-install')||b.hasAttribute('data-backup')){await deviceAction(b,()=>({items,looks:saved,inspo}));return}
 if(b.dataset.publish||b.dataset.sale||b.dataset.donate){
   const look=saved.find(entry=>entry.id===b.dataset.publish);
   const piece=items.find(entry=>entry.id===(b.dataset.sale||b.dataset.donate));
   const pieces=look?look.pieces.map(ref=>items.find(item=>item.id===ref.id)||ref):[piece];
   composePost({kind:look?'look':b.dataset.sale?'sale':'donate',source:look||piece,pieces,modal,body,dialog,esc});
   return;
 }
 if(b.dataset.preset){
   await setPaletteBook({...paletteBook,active:b.dataset.preset});
   main.querySelector('[data-preset="'+b.dataset.preset+'"]').focus({preventScroll:true});
   notice(activePalette().name+' palette applied');return
 }
 if(b.hasAttribute('data-palette-off')){await setPaletteBook({...paletteBook,active:''});return}
 if(b.hasAttribute('data-reset-prompt')){promptDraft='';lookRequest=null;variation=0;render();main.querySelector('#look-brief')?.focus();return}
 if(b.dataset.pin){lookRequest=null;const pin=foundPins.find(p=>p.id===b.dataset.pin);if(!pin)return;const color=b.parentElement.querySelector('input').value;const ref={pinId:pin.id,title:pin.title,color};await write('inspo',ref);inspo=ref;render();notice('Pin palette applied');return}
 if(b.hasAttribute('data-edit-palette')) {
   lookRequest=null;
   const reference = {photo:'/orchid-detail.webp',color:'#a77bb6',title:'The Orchid Edit'};
   await write('inspo', reference);
   inspo = reference;
   variation = 0;
   location.hash = 'stylist';
   return;
 }
 if(b.hasAttribute('data-add'))addPiece();
 if(b.dataset.remove){if(!confirm('Remove '+items.find(piece=>piece.id===b.dataset.remove)?.name+' from your wardrobe?'))return;const next=items.filter(p=>p.id!==b.dataset.remove);await write('items',next);items=next;render()}
 if(b.hasAttribute('data-remix')){const prior=currentLook().pieces.map(p=>p.id).join();variation++;render();if(currentLook().pieces.map(p=>p.id).join()===prior)notice('Add another piece in the same category for more combinations.')}
 if(b.hasAttribute('data-save')){const look=currentLook();const pieces=look.pieces.map(({id,name})=>({id,name}));if(saved.some(s=>s.name===editName()&&s.pieces.map(p=>p.id).join()===pieces.map(p=>p.id).join()))return notice('This outfit is already saved');const next=[{id:crypto.randomUUID(),name:editName(),pieces},...saved];await write('looks',next);saved=next;notice('Outfit saved to Wardrobe')}
 if(b.dataset.unsave){if(!confirm('Remove this saved outfit? Your wardrobe pieces stay on this device.'))return;const next=saved.filter(s=>s.id!==b.dataset.unsave);await write('looks',next);saved=next;render()}
 if(b.hasAttribute('data-clearref')){await write('inspo',null);inspo=null;render()}
 if(b.hasAttribute('data-cancel-order')){
   sessionStorage.removeItem('looku.return-to-order');sessionStorage.removeItem('looku.jacket-limit');
   checkoutDraft=null;b.closest('.order-return').remove();main.focus();return;
 }
 if(b.hasAttribute('data-buy'))checkout();
 if(b.dataset.refresh){b.disabled=true;b.textContent='Checking payment…';try{const api=await paymentAPI();await record(await api.getReceipt(b.dataset.refresh));drawReceipts()}finally{b.textContent='Refresh receipt'}}
 }catch(err){b.disabled=false;notice(err.message)}});
document.addEventListener('click', event => {
 if (event.target.closest('[data-saved-link]')) sessionStorage.setItem('looku.show-saved','1');
});
window.addEventListener('hashchange',()=>{window.scrollTo(0,0);render();if(document.activeElement?.id!=='saved-heading')main.focus({preventScroll:true})});render();

main.addEventListener('submit',async e=>{
 if(e.target.id==='custom-palette'){
   e.preventDefault();
   const name=e.target.elements.paletteName.value.trim();
   if(!name){notice('Give your palette a name.');return}
   const id=paletteBook.entries.find(p=>p.id===paletteBook.active)?.id || crypto.randomUUID();
   const colors=new FormData(e.target).getAll('swatch');
   try {
     await setPaletteBook({active:id,entries:[...paletteBook.entries.filter(p=>p.id!==id),{id,name,colors}]});
     main.querySelector('#outfit-result').focus();
     notice(name+' palette applied');
   } catch { notice('Could not save this palette on your device.'); }
   return;
 }
 if(e.target.id==='look-prompt'){
   e.preventDefault();
   const text=e.target.elements.brief.value.trim();
   if(!text){notice('Describe the look you want to build.');return}
   const form=e.target;
   const parsed=interpretLook(text,items);
   if(e.submitter?.value==='gpt'){
     const button=e.submitter;button.disabled=true;
     const note=form.querySelector('[data-prompt-status]');note.textContent='Getting your styling advice…';
     try{
       const result=await accountCall('/api/stylist/gpt',{prompt:text});
       if(!form.isConnected)return;
       Object.assign(parsed,{occasion:result.occasion,gptColors:result.colors,terms:[...parsed.terms,...result.prefer],excluded:[...parsed.excluded,...result.exclude],tip:result.tip});
     }catch(error){note.textContent=error.message;return}finally{button.disabled=false}
   }
   lookRequest=parsed;
   occasion=lookRequest.occasion || occasion;
   variation=0;
   await render();
   main.querySelector('#outfit-result').focus();
   return;
 }
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
