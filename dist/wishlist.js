import {processPhoto} from './model.js';

const db = new Promise((resolve,reject)=>{
  const open=indexedDB.open('looku-wishlist',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('items',{keyPath:'url'});
  open.onsuccess=()=>resolve(open.result);
  open.onerror=()=>reject(Error('Wishlist storage is unavailable on this device.'));
});
async function items(){
  const database=await db;
  return new Promise((resolve,reject)=>{
    const req=database.transaction('items').objectStore('items').getAll();
    req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.created-a.created));
    req.onerror=()=>reject(req.error);
  });
}
// Read and update in one transaction so two tabs cannot overwrite a contribution.
async function update(url,change) {
  const database=await db;
  return new Promise((resolve,reject)=>{
    const tx=database.transaction('items','readwrite'),store=tx.objectStore('items');
    const read=store.get(url); let reason;
    read.onsuccess=()=>{
      try {const next=change(read.result); if(next)store.put(next);else store.delete(url);}
      catch(e){reason=e;tx.abort()}
    };
    tx.oncomplete=resolve;tx.onabort=()=>reject(reason||Error('Could not update this wishlist.'));
  });
}
function productUrl(text){
  const url=new URL(text);
  if(url.protocol!=='https:'||url.username||url.password||url.href.length>4096)throw Error('Use the full HTTPS product link.');
  return url;
}
function guessName(url){
  let slug=url.pathname.split('/').filter(Boolean).pop()||url.hostname;
  try{slug=decodeURIComponent(slug)}catch{}
  return slug.replace(/[-_]+/g,' ').replace(/^./,c=>c.toUpperCase()).slice(0,120);
}
function cents(text){
  if(!/^\d{1,8}(\.\d{1,2})?$/.test(text))throw Error('Enter an amount with up to two decimal places.');
  const [whole,part='']=text.split('.');
  return Number(whole)*100+Number(part.padEnd(2,'0'));
}
function fmt(n,currency){
  return new Intl.NumberFormat('en-KE',{style:'currency',currency,currencyDisplay:'code',minimumFractionDigits:0,maximumFractionDigits:2}).format(n/100);
}
function el(tag,text){const node=document.createElement(tag);node.textContent=text;return node}
function extractShared(text){return (text||'').match(/https?:\/\/[^\s<>"]+/i)?.[0]||''}
export function receiveSharedLink(){
  const q=new URLSearchParams(location.search);
  if(!['share_url','share_text','share_title'].some(k=>q.has(k)))return;
  const next=new URLSearchParams({url:q.get('share_url')||extractShared(q.get('share_text')),title:q.get('share_title')||''});
  history.replaceState(null,'',location.pathname+'#wishlist?'+next);
}
function makeBookmark(){
  const target=location.origin+location.pathname+'#wishlist?';
  // Run only when clicked on a retailer page. Never read form contents.
  const code="(()=>{if(location.protocol!=='https:')return;const meta=n=>document.querySelector('meta[property=\"'+n+'\"]')?.content||'';const q=new URLSearchParams({url:location.href,title:meta('og:title')||document.title,price:meta('product:price:amount')||meta('og:price:amount'),currency:meta('product:price:currency')||meta('og:price:currency')});window.open("+JSON.stringify(target)+"+q,'_blank','noopener,noreferrer')})()";
  return 'javascript:'+encodeURIComponent(code);
}
export async function mountWishlist(main){
  const seed=new URLSearchParams(location.hash.split('?').slice(1).join('?'));
  main.innerHTML=`<div class="eyebrow">Your shopping list</div><h1 class="page-title">Wishlist</h1>
  <p class="intro">Keep a piece you love, track what you’ve set aside and return to the exact store page when you’re ready.</p>
  <details class="panel" data-editor><summary>Save a product link</summary><form class="stack">
  <label>Product link<input type="url" name="url" placeholder="https://…" maxlength="4096" required></label>
  <p class="fine" data-preview-status role="status"></p><img data-preview width="120" alt="Product thumbnail" hidden>
  <label>Item name<input name="title" maxlength="120" placeholder="e.g. Ayla Knit Top in Plum"></label>
  <label>Size or colour note<input name="variant" maxlength="100" placeholder="What you selected at the store"></label>
  <div class="row"><label>Currency<select name="currency" aria-label="Wishlist currency"><option>KES</option><option>USD</option></select></label>
  <label>Target price (optional)<input type="number" name="price" min="0.01" step="0.01" max="99999999"></label></div>
  <label>Product photo (optional)<input type="file" name="photo" accept="image/*"></label>
  <p class="fine">Check the price and size on the retailer’s page. Add delivery costs to your target if you want to save for them too.</p>
  <button>Save item</button></form></details>
  <p role="status" data-wish-note></p><div class="stack" data-items></div>
  <details class="panel"><summary>Save while browsing</summary><p>On a supported phone with looku installed, share the product page to looku. You can always copy the link and paste it above.</p><p>On desktop, drag <a data-bookmark>Save to looku</a> to your bookmarks bar. Click that bookmark on a product page to review it here.</p></details>
  <p class="fine">Your wishlist, photos and savings notes stay in this browser. Logging an amount records money you set aside elsewhere. Clearing site data removes this list.</p>`;
  const editor=main.querySelector('[data-editor]'),form=editor.querySelector('form'),f=form.elements;
  const note=main.querySelector('[data-wish-note]'),list=main.querySelector('[data-items]');
  const bookmark=main.querySelector('[data-bookmark]');
  bookmark.href=makeBookmark();
  bookmark.onclick=e=>{e.preventDefault();note.textContent='Drag Save to looku to your bookmarks bar, then click it on a product page.'};
  let editing=null,previewUrl='',previewTask=null,controller,timer;
  const preview=form.querySelector('[data-preview]'),previewStatus=form.querySelector('[data-preview-status]');
  const imported=new Map(),changed=new Set();
  for(const key of ['title','variant','price','currency']){
    f[key].addEventListener('input',()=>{changed.add(key);imported.delete(key)});
  }
  function clearPreview(){
    clearTimeout(timer);controller?.abort();previewUrl='';previewTask=null;
    for(const [key,value] of imported)if(f[key].value===value)f[key].value=key==='currency'?'KES':'';
    imported.clear();preview.removeAttribute('src');preview.hidden=true;previewStatus.textContent='';
  }
  function setImported(key,value){
    if(value&&!changed.has(key)&&(key==='currency'||!f[key].value)){
      f[key].value=value;imported.set(key,f[key].value);
    }
  }
  function loadPreview(){
    if(editing)return;
    let url;try{url=productUrl(f.url.value.trim()).href}catch{return}
    if(url===previewUrl)return previewTask;
    clearPreview();previewUrl=url;controller=new AbortController();
    const signal=controller.signal;
    previewStatus.textContent='Loading product details…';
    previewTask=(async()=>{
      try{
        const res=await fetch('/api/product-preview',{method:'POST',headers:{'X-Looku-Action':'product-preview'},body:url,signal});
        if(!res.ok)throw Error();
        const data=await res.json();
        if(signal.aborted)return;
        setImported('title',data.title);setImported('variant',data.variant);
        if(['KES','USD'].includes(data.currency)&&!f.price.value&&!changed.has('price')&&(!changed.has('currency')||data.currency===f.currency.value)&&/^\d{1,8}(\.\d{1,2})?$/.test(data.price)&&Number(data.price)>0){
          setImported('currency',data.currency);setImported('price',data.price);
        }
        if(data.photo){
          const blob=await (await fetch(data.photo)).blob();
          const {photo}=await processPhoto(blob,320);
          if(signal.aborted)return;
          preview.src=photo;preview.hidden=false;
        }
        previewStatus.textContent=data.title||data.photo?'Review the imported details before saving.':'No product details were available. You can enter them below.';
      }catch{if(!signal.aborted)previewStatus.textContent='Preview unavailable. You can still enter the details and save this link.'}
    })();
    return previewTask;
  }
  f.url.addEventListener('input',()=>{clearPreview();timer=setTimeout(loadPreview,450)});
  f.url.addEventListener('change',loadPreview);
  function populate(item){
    reset();editing=item.url;if(item.photo){preview.src=item.photo;preview.hidden=false;}f.url.value=item.url;f.url.readOnly=true;f.title.value=item.title;f.variant.value=item.variant;f.currency.value=item.currency;
    f.currency.disabled=item.saved>0;f.price.value=item.target?item.target/100:'';editor.open=true;
    form.querySelector('button').textContent='Save changes';
    f.title.focus();
  }
  function reset(){clearPreview();changed.clear();editing=null;form.reset();f.url.readOnly=false;f.currency.disabled=false;form.querySelector('button').textContent='Save item';}
  const cancel=el('button','Cancel');cancel.type='button';cancel.className='secondary';form.append(cancel);
  cancel.onclick=()=>{reset();editor.open=false};
  async function refresh(){
    const all=await items();list.replaceChildren();
    if(!all.length)list.append(el('p','Your saved pieces will appear here.'));
    for(const item of all){
      const url=productUrl(item.url),card=el('article','');card.className='panel wish-card';
      if(item.photo){const image=document.createElement('img');image.src=item.photo;image.alt=item.title;image.width=100;card.append(image)}
      card.append(el('small',url.hostname.replace(/^www\./,'')),el('h2',item.title));
      if(item.variant)card.append(el('p',item.variant));
      const saved=fmt(item.saved,item.currency);
      card.append(el('p',item.target?saved+' set aside of '+fmt(item.target,item.currency)+' · '+(item.saved>=item.target?'Goal reached':fmt(item.target-item.saved,item.currency)+' to go'):saved+' set aside · Add a target when you know the price.'));
      if(item.target){const bar=document.createElement('progress');bar.max=item.target;bar.value=Math.min(item.target,item.saved);bar.setAttribute('aria-label','Savings progress');card.append(bar)}
      const row=el('div','');row.className='actions';
      const shop=el('a','View at store ↗');shop.href=item.url;shop.target='_blank';shop.rel='noopener noreferrer';shop.className='button';
      const edit=el('button','Edit item');edit.className='secondary';edit.onclick=()=>populate(item);
      const remove=el('button','Remove');remove.className='link';remove.onclick=async()=>{if(!confirm('Remove this item and its savings note?'))return;try{await update(item.url,()=>null);if(editing===item.url)reset();await refresh();note.textContent='Item removed.'}catch(e){note.textContent=e.message}};
      row.append(shop,edit,remove);card.append(row);
      const savings=document.createElement('form');savings.className='row';
      const label=el('label','Amount set aside ('+item.currency+')'),amount=document.createElement('input');amount.type='number';amount.min='0.01';amount.max='99999999';amount.step='0.01';amount.required=true;label.append(amount);
      savings.append(label,el('button','Log savings'));card.append(savings);
      savings.onsubmit=async e=>{e.preventDefault();const btn=savings.querySelector('button');btn.disabled=true;try{
        const value=cents(amount.value);if(!value)throw Error('Enter a positive amount.');
        await update(item.url,current=>{if(!current||current.currency!==item.currency)throw Error('Item changed. Reopen the wishlist.');if(current.saved+value>9999999999)throw Error('Amount too large.');return {...current,saved:current.saved+value}});
        await refresh();note.textContent='Savings recorded for '+item.title+'.';
      }catch(err){note.textContent=err.message}finally{btn.disabled=false}};
      list.append(card);
    }
    return all;
  }
  form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('button');btn.disabled=true;
    try{const submittedUrl=f.url.value;await loadPreview();if(!editor.open||submittedUrl!==f.url.value||!form.isConnected)return;const url=productUrl(f.url.value.trim()),title=f.title.value.trim()||guessName(url),variant=f.variant.value.trim(),currency=f.currency.value,target=f.price.value?cents(f.price.value):0;
      const photo=f.photo.files[0]?(await processPhoto(f.photo.files[0],320)).photo:preview.getAttribute('src');
      await update(url.href,old=>{
        if(old && !editing)throw Error('This exact product link is already on your wishlist. Choose Edit item to change it.');
        if(editing&&!old)throw Error('This item was removed.');
        if(old?.saved && old.currency!==currency)throw Error('Keep the original currency for recorded savings.');
        return {url:url.href,title,variant,currency,target,photo:photo||old?.photo||null,saved:old?.saved||0,created:old?.created||Date.now()};
      });reset();editor.open=false;history.replaceState(null,'',location.pathname+'#wishlist');await refresh();note.textContent='Saved '+title+'.';
    }catch(err){note.textContent=err.message}finally{btn.disabled=false}};

  try{const all=await refresh();editor.open=!all.length;
    if(seed.has('url')){
      editor.open=true;const url=productUrl(seed.get('url'));const prior=all.find(item=>item.url===url.href);
      if(prior){populate(prior);note.textContent='Already saved. Your progress is here.';return}
      f.url.value=url.href;f.title.value=(seed.get('title')||'').slice(0,120);
      const cur=seed.get('currency');if(['KES','USD'].includes(cur)){f.currency.value=cur;const price=seed.get('price')||'';if(/^\d{1,8}(\.\d{1,2})?$/.test(price)&&Number(price)>0)f.price.value=price}
      loadPreview();
    }
  }catch(e){note.textContent=e.message}
}
