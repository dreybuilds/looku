import {productUrl,guessName,fetchProductPreview} from './shopping.js';
import {merchantOffer,signOffer,submitOffer,newNonce,authorizationStatus} from './merchant-payment.js';
import {baseUSDC,readWalletBalance} from './wallet.js';
import {processPhoto} from './model.js';

const db = new Promise((resolve,reject)=>{
  const open=indexedDB.open('looku-wishlist',3);
  open.onupgradeneeded=event=>{
    const store=event.oldVersion?open.transaction.objectStore('items'):open.result.createObjectStore('items',{keyPath:'url'});
    if(store.indexNames.contains('goalWallet'))store.deleteIndex('goalWallet');
  };
  open.onblocked=()=>reject(Error('Close other Lookuwear tabs, then reload to update your wishlist.'));
  open.onsuccess=()=>{const db=open.result;db.onversionchange=()=>db.close();resolve(db)};
  open.onerror=()=>reject(Error('Wishlist storage is unavailable on this device.'));
});
export async function items(){
  const database=await db;
  return new Promise((resolve,reject)=>{
    const req=database.transaction('items').objectStore('items').getAll();
    req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.created-a.created));
    req.onerror=()=>reject(req.error);
  });
}
// Read and update in one transaction so two tabs cannot overwrite a contribution.
async function update(url,change,includeWalletItems=false) {
  const database=await db;
  return new Promise((resolve,reject)=>{
    const tx=database.transaction('items','readwrite'),store=tx.objectStore('items');
    const read=includeWalletItems?store.getAll():store.get(url); let reason;
    read.onsuccess=()=>{
      try {const rows=includeWalletItems?read.result:[];const next=change(includeWalletItems?rows.find(row=>row.url===url):read.result,rows); if(next)store.put(next);else store.delete(url);}
      catch(e){reason=e;tx.abort()}
    };
    tx.oncomplete=resolve;tx.onabort=()=>reject(reason||Error('Could not update this wishlist.'));
  });
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
  <p class="intro">Keep a piece you love, plan for its price and return to the exact store page when you’re ready.</p>
  <details class="panel" data-editor><summary>Save a product link</summary><form class="stack">
  <label>Product link<input type="url" name="url" placeholder="https://…" maxlength="4096" required></label>
  <p class="fine" data-preview-status role="status"></p><img data-preview width="120" alt="Product thumbnail" hidden>
  <label>Item name<input name="title" maxlength="120" placeholder="e.g. Ayla Knit Top in Plum"></label>
  <label>Size or colour note<input name="variant" maxlength="100" placeholder="What you selected at the store"></label>
  <div class="row"><label>Currency<select name="currency" aria-label="Wishlist currency"><option>KES</option><option>USD</option></select></label>
  <label>Target price (optional)<input type="number" name="price" min="0.01" step="0.01" max="99999999"></label></div>
  <label>Product photo (optional)<input type="file" name="photo" accept="image/*"></label>
  <p class="fine">Check the price and size on the retailer’s page. Add delivery costs to your target if you want to save for them too.</p>
  <div class="row" data-editor-actions><button>Save item</button></div></form></details>
  <p role="status" data-wish-note></p><div class="stack" data-items></div>
  <details class="panel"><summary>Save while browsing</summary><p>On a supported phone with looku installed, share the product page to looku. You can always copy the link and paste it above.</p><p>On desktop, drag <a data-bookmark>Save to looku</a> to your bookmarks bar. Click that bookmark on a product page to review it here.</p></details>
  <p class="fine">Your wishlist, photos and price targets stay in this browser. Clearing site data removes this list.</p>`;
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
        const data=await fetchProductPreview(url,signal);
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
    f.price.value=item.target?item.target/100:'';editor.open=true;
    form.querySelector('button').textContent='Save changes';
    f.title.focus();
  }
  function reset(){clearPreview();changed.clear();editing=null;form.reset();f.url.readOnly=false;f.currency.disabled=false;form.querySelector('button').textContent='Save item';}
  const cancel=el('button','Cancel');cancel.type='button';cancel.className='secondary';form.querySelector('[data-editor-actions]').append(cancel);
  cancel.onclick=()=>{reset();editor.open=false};
  async function refresh(openFundingUrl){
    const all=await items();list.replaceChildren();
    if(!all.length)list.append(el('p','Your saved pieces will appear here.'));
    for(const item of all){
      const url=productUrl(item.url),card=el('article','');card.className='panel wish-card';
      if(item.photo){const image=document.createElement('img');image.src=item.photo;image.alt=item.title;image.width=100;card.append(image)}
      card.append(el('small',url.hostname.replace(/^www\./,'')),el('h2',item.title));
      if(item.variant)card.append(el('p',item.variant));
      card.append(el('p',item.target?'Target price · '+fmt(item.target,item.currency):'Add a target when you know the price.'));
      if(item.saved>0)card.append(el('small','Previous manual entry: '+fmt(item.saved,item.savedCurrency||item.currency)+'. No deposit was recorded.'));
      const row=el('div','');row.className='actions';
      const shop=el('a','View at store ↗');shop.href=item.url;shop.target='_blank';shop.rel='noopener noreferrer';shop.className='button';
      const edit=el('button','Edit item');edit.className='secondary';edit.onclick=()=>populate(item);
      const remove=el('button','Remove');remove.className='link';remove.onclick=async()=>{if(!confirm('Remove this item from your wishlist?'))return;try{await update(item.url,current=>{if(current?.agentPayment&&!current.agentPayment.closed)throw Error('Verify the pending payment before removing this item.');return null});if(editing===item.url)reset();await refresh();note.textContent='Item removed.'}catch(e){note.textContent=e.message}};
      row.append(shop,edit,remove);card.append(row);
      const funding=fundingPanel(item,refresh,all);funding.open=item.url===openFundingUrl;card.append(funding);list.append(card);
    }
    return all;
  }
  form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('button');btn.disabled=true;
    try{const submittedUrl=f.url.value;await loadPreview();if(!editor.open||submittedUrl!==f.url.value||!form.isConnected)return;const url=productUrl(f.url.value.trim()),title=f.title.value.trim()||guessName(url),variant=f.variant.value.trim(),currency=f.currency.value,target=f.price.value?cents(f.price.value):0;
      const photo=f.photo.files[0]?(await processPhoto(f.photo.files[0],320)).photo:preview.getAttribute('src');
      await update(url.href,old=>{
        if(old && !editing)throw Error('This exact product link is already on your wishlist. Choose Edit item to change it.');
        if(editing&&!old)throw Error('This item was removed.');

        return {...old,...(old?.saved?{savedCurrency:old.savedCurrency||old.currency}:{}),url:url.href,title,variant,currency,target,photo:photo||old?.photo||null,created:old?.created||Date.now()};
      });reset();editor.open=false;history.replaceState(null,'',location.pathname+'#wishlist');await refresh();note.textContent='Saved '+title+'.';
    }catch(err){note.textContent=err.message}finally{btn.disabled=false}};

  try{const all=await refresh();editor.open=!all.length;
    if(seed.has('url')){
      editor.open=true;const url=productUrl(seed.get('url'));const prior=all.find(item=>item.url===url.href);
      if(prior){populate(prior);note.textContent='Already saved. You can edit this item here.';return}
      f.url.value=url.href;f.title.value=(seed.get('title')||'').slice(0,120);
      const cur=seed.get('currency');if(['KES','USD'].includes(cur)){f.currency.value=cur;const price=seed.get('price')||'';if(/^\d{1,8}(\.\d{1,2})?$/.test(price)&&Number(price)>0)f.price.value=price}
      loadPreview();
    }
  }catch(e){note.textContent=e.message}
}

function fundingPanel(item,refresh,all){
  const panel=el('details','');panel.className='wish-funding';
  const summary=el('summary','Fund this item'),body=el('div',''),status=el('p','');body.className='stack';status.setAttribute('role','status');panel.append(summary,body);
  function action(label,fn){
    const button=el('button',label);button.type='button';body.append(button);
    button.onclick=async()=>{
      button.disabled=true;status.textContent='Working…';
      try{await fn()}catch(e){status.textContent=e.code===4001?'Wallet request cancelled.':e.message||'Could not reach the wallet.'}
      finally{button.disabled=false}
    };
  }
  async function walletAccount(){
    if(!window.ethereum?.request)throw Error('Open Lookuwear in your Base-compatible wallet browser or connect a browser wallet.');
    const [address]=await window.ethereum.request({method:'eth_requestAccounts'});
    if(!/^0x[0-9a-f]{40}$/i.test(address)||/^0x0{40}$/i.test(address))throw Error('Select a valid wallet account.');
    return address.toLowerCase();
  }
  const read=(address,block)=>readWalletBalance('base',address,AbortSignal.timeout(12000),block);
  if(!item.goalWallet){
    body.append(el('p','Use one Base wallet for your wishlist. After your top-up arrives, assign USDC to each item on this device.'));
    async function linkWallet(address){
      if(!confirm('Use '+address+' on Base for '+item.title+'?')){status.textContent='Wallet selection cancelled.';return}
      await update(item.url,current=>{
        if(!current||current.goalWallet)throw Error('This item changed. Reopen the wishlist.');
        return {...current,goalWallet:address};
      });
      await refresh(item.url);
    }
    const addresses=[...new Set(all.map(row=>row.goalWallet).filter(Boolean))];
    for(const address of addresses)action('Use wallet '+address.slice(0,6)+'…'+address.slice(-4),()=>linkWallet(address));
    action('Choose receiving wallet',async()=>linkWallet(await walletAccount()));
  }else{
    const address=item.goalWallet;
    const availableForItem=(rows,balance)=>{
      const pending=rows.filter(row=>row.goalWallet===address&&row.agentPayment&&!row.agentPayment.closed).reduce((sum,row)=>sum+BigInt(row.agentPayment.amount),0n);
      const others=rows.filter(row=>row.url!==item.url&&row.goalWallet===address);
      const available=balance-pending-others.reduce((sum,row)=>sum+BigInt(row.allocation||0),0n);
      return available>0n?available:0n;
    };
    const show=units=>formatUSDC(units)+' USDC';
    const destination=el('code',address);
    body.append(el('strong','Receiving wallet · Base mainnet'),destination,el('p','Send native USDC here from another wallet, or choose Buy in MiniSend and use this address for your M-Pesa purchase.'));
    action('Copy receiving address',async()=>{await navigator.clipboard.writeText(address);status.textContent='Receiving address copied.'});
    const mini=el('a','Fund with M-Pesa via MiniSend ↗');mini.className='button secondary';mini.href='https://app.minisend.xyz/';mini.target='_blank';mini.rel='noopener noreferrer';body.append(mini);
    const label=el('label','Transfer amount (USDC)'),input=el('input','');input.inputMode='decimal';input.placeholder='0.00';label.append(input);body.append(label);
    action('Review transfer in wallet',async()=>{
      const value=input.value.trim();
      if(!/^\d{1,8}(\.\d{1,6})?$/.test(value))throw Error('Enter a positive USDC amount with up to six decimals.');
      const units=parseUSDC(value);
      if(!units)throw Error('Enter a positive transfer amount.');
      const sender=await walletAccount();
      if(sender===address)throw Error('Select a different sending account in your wallet, then try again.');
      await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x2105'}]});
      if(await window.ethereum.request({method:'eth_chainId'})!=='0x2105')throw Error('Switch your wallet to Base mainnet.');
      await window.ethereum.request({method:'eth_sendTransaction',params:[{from:sender,to:baseUSDC,chainId:'0x2105',data:'0xa9059cbb'+address.slice(2).padStart(64,'0')+units.toString(16).padStart(64,'0')}]});
      input.value='';status.textContent='Transfer submitted. Check the balance after Base confirms it.';
    });
    const allocationLabel=el('label','Budget for this item (USDC)'),budget=el('input','');
    budget.inputMode='decimal';budget.value=formatUSDC(BigInt(item.allocation||0));allocationLabel.append(budget);
    body.append(allocationLabel,el('p','Assign part of your confirmed balance on this device. Set the budget to zero to release it.'));
    action('Assign wallet funds',async()=>{
      const requested=parseUSDC(budget.value);
      const {units}=await read(address,'finalized');
      await update(item.url,(current,rows)=>{
        if(!current||current.goalWallet!==address)throw Error('This item changed. Reopen the wishlist.');
        if(current.agentPayment&&!current.agentPayment.closed)throw Error('Verify the pending payment before changing its budget.');
        if(requested>availableForItem(rows,units))throw Error('This exceeds the confirmed balance available after your other wishlist budgets.');
        return {...current,allocation:String(requested)};
      },true);
      status.textContent='Assigned '+show(requested)+' to '+item.title+'.';
    });
    async function funded(){
      const {units}=await read(address,'finalized'),rows=await items(),current=rows.find(row=>row.url===item.url);
      if(current?.goalWallet!==address)throw Error('This item changed. Reopen the wishlist.');
      const limit=BigInt(current.allocation||0),available=availableForItem(rows,units);
      return {units,limit:limit<available?limit:available};
    }
    action('Check confirmed funds',async()=>{
      const {units,limit}=await funded();
      status.textContent='Confirmed wallet balance: '+show(units)+' · Available for this item: '+show(limit)+' · checked '+new Date().toLocaleTimeString()+'.';
    });

    const lastPayment=item.agentPayment;
    if(lastPayment){
      const detail=el('p',lastPayment.closed?'Payment authorization used on Base.':lastPayment.tx?'Merchant reported settlement.':'A previous checkout may have been submitted. Check your wallet and merchant before trying again.');
      if(lastPayment.tx){
        const receipt=el('a','View payment transaction ↗');receipt.href='https://basescan.org/tx/'+lastPayment.tx;receipt.target='_blank';receipt.rel='noopener noreferrer';detail.append(' ',receipt);
      }
      body.append(detail);
      if(lastPayment.confirmation){
        const result=el('details','');result.append(el('summary','Merchant confirmation'),el('p',lastPayment.confirmation));body.append(result);
      }
      if(!lastPayment.closed)action('Verify payment on Base',async()=>{
        const state=await authorizationStatus(address,lastPayment);
        if(state==='pending'){status.textContent='Awaiting finalized confirmation. Check again after the authorization expires.';return}
        await update(item.url,current=>{
          if(current?.agentPayment?.attempt!==lastPayment.attempt||current.agentPayment.closed)return current;
          if(state==='used')return {...current,agentPayment:{...current.agentPayment,closed:true}};
          return {...current,agentPayment:null,allocation:String(BigInt(current.allocation||0)+BigInt(lastPayment.amount))};
        });
        await refresh(item.url);
      });
    }
    if(!lastPayment)action('Review x402 merchant payment',async()=>{
      const {limit}=await funded();
      if(!limit)throw Error('Assign confirmed funds to this item before checking out.');
      const quote=await merchantOffer(item.url,limit),cost=BigInt(quote.offer.amount);
      if(!confirm('Pay '+show(cost)+' for '+item.title+' at '+new URL(item.url).hostname+'? Recipient on Base: '+quote.offer.payTo))throw Error('Payment cancelled.');
      if(await walletAccount()!==address)throw Error('Select this item’s receiving wallet to pay the merchant.');
      await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x2105'}]});
      if(await window.ethereum.request({method:'eth_chainId'})!=='0x2105')throw Error('Switch your wallet to Base mainnet.');
      const {units}=await read(address,'finalized');
      const expires=Math.floor(Date.now()/1000)+Math.min(quote.offer.maxTimeoutSeconds,120);
      const attempt=crypto.randomUUID(),nonce=newNonce();
      await update(item.url,(current,rows)=>{
        if(current?.goalWallet!==address||BigInt(current.allocation||0)<cost||availableForItem(rows,units)<cost)throw Error('Available funds changed. Review the budget again.');
        if(current.agentPayment)throw Error('An x402 checkout already exists for this item. Check its payment status.');
        return {...current,agentPayment:{attempt,expires,amount:String(cost),nonce},allocation:String(BigInt(current.allocation)-cost)};
      },true);
      let signature;
      try{signature=await signOffer(window.ethereum,address,quote,expires,nonce)}
      catch(error){
        await update(item.url,current=>current?.agentPayment?.attempt===attempt?{...current,agentPayment:null,allocation:String(BigInt(current.allocation||0)+cost)}:current);
        throw error;
      }
      try{
        const receipt=await submitOffer(item.url,signature);
        await update(item.url,current=>current?.agentPayment?.attempt===attempt?{...current,agentPayment:{...current.agentPayment,...receipt}}:current);
      }finally{await refresh(item.url)}
    });
  }
  body.append(status);return panel;
}

function parseUSDC(value){
  if(!/^\d{1,8}(\.\d{1,6})?$/.test(value.trim()))throw Error('Enter a USDC amount with up to six decimal places.');
  const [whole,fraction='']=value.trim().split('.');
  return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
}
function formatUSDC(units){
  const fraction=String(units%1000000n).padStart(6,'0').replace(/0+$/,'');
  return String(units/1000000n)+(fraction?'.'+fraction:'');
}
