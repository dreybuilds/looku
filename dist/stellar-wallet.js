import {emailHeaders} from './email-auth.js';

export function stellarAmount(units){
  const value=BigInt(units||0),fraction=String(value%10000000n).padStart(7,'0').replace(/0+$/,'');
  return String(value/10000000n)+(fraction?'.'+fraction:'');
}
export function stellarNetwork(){return localStorage.getItem('looku.stellar-network')==='testnet'?'testnet':'mainnet'}
export async function stellarCall(path='',data,network=stellarNetwork()){
  const headers=await emailHeaders();
  const response=await fetch('/api/stellar-wallet'+path+'?network='+network,{
    cache:'no-store',signal:AbortSignal.timeout(25000),headers:{...headers,...(data?{'Content-Type':'application/json','X-Looku-Action':'stellar-wallet'}:{})},
    ...(data?{method:'POST',body:JSON.stringify(data)}:{})
  });
  const result=await response.json();
  if(!response.ok)throw Object.assign(Error(result.error||'Wallet unavailable.'),{status:response.status});
  return result;
}
export async function ensureStellarWallet(){
  const existing=await stellarCall();
  return existing.exists?existing:stellarCall('',{});
}
export async function stellarItemKey(url){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(url));
  return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function releaseStellarBudget(url){
  const item=await stellarItemKey(url);
  for(const network of ['mainnet','testnet']){
    let account;
    try{account=await stellarCall('',undefined,network)}catch(error){if(error.status===401)return;throw error}
    if(account.exists&&BigInt(account.budgets[item]||0)>0n)await stellarCall('/budget',{item,amount:'0'},network);
  }
}
function el(tag,text){const element=document.createElement(tag);element.textContent=text;return element}
export function watchStellar(root,refresh){
  const events=new AbortController();let timer,busy=false;
  async function sync(){
    clearTimeout(timer);
    if(!root.isConnected){events.abort();return}
    if(busy)return;busy=true;
    try{if(!document.hidden&&navigator.onLine)await refresh()}catch{}finally{busy=false;timer=setTimeout(sync,20000)}
  }
  for(const event of ['focus','online'])window.addEventListener(event,sync,{signal:events.signal});
  document.addEventListener('visibilitychange',sync,{signal:events.signal});
  timer=setTimeout(sync,20000);
}
export async function mountStellarWallet(root,compact=false){
  root.className='panel stellar-account';root.innerHTML='<div class="eyebrow">Primary account wallet</div><h2>Stellar wallet</h2><p role="status">Loading your account wallet…</p>';
  const status=root.querySelector('[role=status]');
  try{
    let account=await ensureStellarWallet();if(!root.isConnected)return;
    status.textContent='';
    const destination=el('code',account.address);destination.style.overflowWrap='anywhere';
    root.append(el('p','One wallet for your account and every wishlist item.'),destination);
    const balance=el('p','');balance.setAttribute('aria-live','polite');root.append(balance);
    const networkLabel=el('label','Stellar network'),network=el('select','');
    network.innerHTML='<option value="mainnet">Mainnet · real USDC</option><option value="testnet">Testnet · demo XLM</option>';
    network.setAttribute('aria-label','Stellar network');network.value=account.network;networkLabel.append(network);root.append(networkLabel);
    network.onchange=()=>{localStorage.setItem('looku.stellar-network',network.value);window.dispatchEvent(new Event('looku-stellar-network'));void mountStellarWallet(root,compact)};
    const controls=el('div','');controls.className='actions';root.append(controls);
    function button(label,action){const b=el('button',label);b.type='button';b.className='secondary';controls.append(b);b.onclick=async()=>{b.disabled=true;try{await action()}catch(e){status.textContent=e.message}finally{b.disabled=false}};return b}
    button('Copy Stellar address',async()=>{await navigator.clipboard.writeText(account.address);status.textContent='Stellar address copied.'});
    const note=el('p','');root.append(note);
    let reviewPending;
    function draw(){
      if(reviewPending)reviewPending.hidden=!account.pending;
      const assigned=Object.values(account.budgets).reduce((sum,value)=>sum+BigInt(value),0n);
      balance.textContent=stellarAmount(account.balance)+' '+account.currency+' confirmed in this wallet · '+stellarAmount(assigned)+' assigned to wishlist items';
      note.textContent=!account.active?'Receive XLM at this address to activate it. On mainnet, keep XLM for the account reserve and fees.':!account.trustline?'Enable USDC to receive it. Stellar requires an additional XLM reserve for the trustline.':'Your wishlist budgets share this confirmed balance.';
    }
    async function refresh(){
      if(account.pending){
        const receipt=await stellarCall('/receipt/'+account.pending.id,undefined,account.pending.network);
        if(['complete','failed','expired'].includes(receipt.status))status.textContent='Wallet request '+receipt.status+'.';
      }
      const next=await stellarCall('',undefined,account.network);
      if(next.address!==account.address){await mountStellarWallet(root,compact);return}
      account=next;draw();
    }
    async function approve(payment){
      if(!confirm(payment.type==='trustline'?'Enable USDC on Stellar mainnet? This needs XLM for the trustline reserve and transaction fee.':'Send '+stellarAmount(payment.amount)+' '+(payment.network==='mainnet'?'USDC':'test XLM')+' on Stellar '+payment.network+' to '+payment.destination+'?')){status.textContent='Request left unsigned. It will expire shortly.';return}
      let signedXdr;
      if(account.kind==='varial'){
        const {signVarialTransaction}=await import('/api/payments/client.js');
        signedXdr=await signVarialTransaction(payment.xdr,account.address,payment.network);
      }
      const result=await stellarCall('/submit',{id:payment.id,signedXdr},payment.network);
      status.textContent=result.status==='complete'?'Payment confirmed on Stellar.':'Awaiting Stellar confirmation. This view updates automatically.';
      await refresh();
    }
    async function review(data){
      const payment=await stellarCall('/prepare',{id:crypto.randomUUID(),...data},account.network);
      account.pending={id:payment.id,network:payment.network};draw();await approve(payment);
    }
    button('Refresh Stellar balance',refresh);
    if(!compact){
      if(account.network==='mainnet'&&!account.trustline)button('Enable USDC',()=>review({type:'trustline'}));
      if(account.network==='testnet'&&!account.active)button('Get test XLM',async()=>{
        const response=await fetch('https://friendbot.stellar.org/?addr='+encodeURIComponent(account.address),{signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw Error('Test funding is unavailable. Check this account’s balance before trying again.');await refresh();
      });
      const send=el('details','');send.append(el('summary','Send funds'));
      const form=el('form','');form.className='stack';
      form.innerHTML='<label>Recipient Stellar address<input name="destination" placeholder="G…" required minlength="56" maxlength="56"></label><label>Send amount<input name="amount" inputmode="decimal" required></label><button>Review Stellar payment</button>';
      form.onsubmit=async event=>{event.preventDefault();const b=form.querySelector('button');b.disabled=true;try{await review({type:'payment',destination:form.elements.destination.value.trim(),amount:form.elements.amount.value.trim()})}catch(e){status.textContent=e.message}finally{b.disabled=false}};
      send.append(form);root.append(send);
      reviewPending=button('Review pending wallet request',async()=>{const payment=await stellarCall('/receipt/'+account.pending.id,undefined,account.pending.network);await approve(payment)});
    }else{const link=el('a','Manage Stellar wallet →');link.href='#wallet';root.append(link)}
    draw();watchStellar(networkLabel,refresh);
  }catch(e){status.textContent=e.status===401?'Sign in with email to create your Stellar account wallet.':e.message;const link=el('a',e.status===401?'Sign in with email →':'Open account →');link.href='#account';root.append(link)}
}
export async function stellarBudgetPanel(item){
  const root=el('section','');root.className='wish-funding stellar-budget';
  root.append(el('h3','Stellar · account wallet'));
  const status=el('p','Loading shared wallet…');status.setAttribute('role','status');root.append(status);
  const key=await stellarItemKey(item.url);
  async function load(){
    try{
      const account=await ensureStellarWallet();if(!root.isConnected)return;
      root.replaceChildren(el('h3','Stellar · account wallet'));
      root.append(el('p','Assigned to this item · '+stellarAmount(account.budgets[key])+' '+account.currency));
      const address=el('code',account.address);address.style.overflowWrap='anywhere';root.append(address);
      const form=el('form','');form.className='row';
      const label=el('label','Item budget ('+account.currency+')'),input=el('input','');input.inputMode='decimal';input.value=stellarAmount(account.budgets[key]);label.append(input);
      const save=el('button','Assign Stellar funds');form.append(label,save);
      const message=el('p','Budgets are saved to your account and share one wallet.');message.setAttribute('role','status');root.append(form,message);
      form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{await stellarCall('/budget',{item:key,amount:input.value.trim()},account.network);await load()}catch(e){message.textContent=e.message}finally{save.disabled=false}};
      const manage=el('a','Fund or manage Stellar wallet →');manage.href='#wallet';root.append(manage);
    }catch(e){status.textContent=e.status===401?'Sign in with email to use one Stellar wallet for all your wishlist items.':e.message;root.replaceChildren(el('h3','Stellar · account wallet'),status)}
  }
  const events=new AbortController();window.addEventListener('looku-stellar-network',()=>{if(root.isConnected)void load();else events.abort()},{signal:events.signal});
  setTimeout(load,0);return root;
}
