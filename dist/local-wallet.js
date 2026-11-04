// A unique record and add() prevent simultaneous tabs from replacing an existing key.
export async function walletRecord(newWallet) {
  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open('looku.testnet-wallet', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('wallet');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(Error('Wallet storage is unavailable on this device.'));
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('wallet', newWallet ? 'readwrite' : 'readonly');
      const store = tx.objectStore('wallet');
      const request = newWallet ? store.add(newWallet, 'local') : store.get('local');
      tx.oncomplete = () => resolve(newWallet || request.result);
      tx.onabort = () => reject(Error(tx.error?.name === 'ConstraintError'
        ? 'A wallet already exists on this device. Reopen Wallet to use it.' : 'Could not save or read the wallet on this device.'));
    });
  } finally { db.close(); }
}

export async function accountCall(path, data) {
 const response=await fetch(path,data?{method:'POST',headers:{'Content-Type':'application/json','X-Looku-Action':'wallet-account'},body:JSON.stringify(data)}:{cache:'no-store'});
 let info;
 try {info=await response.json()} catch {throw Error('Check your connection and try signing in again.')}
 if(!response.ok)throw Error(info.error||'Account service unavailable.');
 return info;
}
export async function mountAccount(panel,wallet,onSignIn, owner=false) {
 panel.innerHTML='<h3>looku account</h3><p>Sign in with your demo wallet to get styling advice or manage your Community posts. Your first sign-in creates an account and lasts up to 12 hours. Community also offers email sign-in.</p><form><label>Sign-in passphrase<input type="password" required autocomplete="current-password" name="pass"></label><button>Sign in with this wallet</button></form><p role="status"></p>';
 const form=panel.querySelector('form'),note=panel.querySelector('[role=status]');
 if(owner)panel.querySelector('p').textContent='Unlock your linked wallet to verify owner access.';
 function signedIn(){
   if(onSignIn){onSignIn();return}
   form.hidden=true;
   note.textContent='Signed in with this device wallet.';
   const button=document.createElement('button');
   button.textContent='Sign out';button.className='secondary';
   button.onclick=async()=>{try{await accountCall('/api/account/logout',{});await mountAccount(panel,wallet)}catch(e){note.textContent=e.message}};
   const history=document.createElement('button');
   history.type='button';history.textContent='View wallet purchases';history.className='secondary';
   const list=document.createElement('ul');
   let cursor=null;
   history.onclick=async()=>{
     history.disabled=true;
     try{
       const page=await accountCall('/api/account/receipts'+(cursor?'?cursor='+encodeURIComponent(cursor):''));
       for(const receipt of page.receipts){
         const entry=document.createElement('li');
         entry.textContent='Cropped jacket · '+receipt.status+' ';
         for(const [label,hash] of [['Purchase',receipt.purchaseTx],['Commission',receipt.payoutTx]]){
           if(!/^[0-9a-f]{64}$/i.test(hash||''))continue;
           const link=document.createElement('a');link.textContent=label+' ↗ ';
           link.href='https://stellar.expert/explorer/testnet/tx/'+hash;
           link.target='_blank';link.rel='noopener noreferrer';entry.append(link);
         }
         list.append(entry);
       }
       if(!list.children.length)note.textContent='No confirmed purchases indexed for this wallet yet.';
       cursor=page.next;history.hidden=!cursor;history.textContent='Load more purchases';
     }catch(e){note.textContent=e.message}finally{history.disabled=false}
   };
   panel.append(button,history,list);
 }
 form.onsubmit=async event=>{
   event.preventDefault();
   const button=form.querySelector('button');button.disabled=true;
   try{
     const {signLookuLogin}=await import('/api/payments/client.js');
     const challenge=await accountCall('/api/account/challenge',{address:wallet.address});
     const signature=await signLookuLogin(wallet,form.elements.pass.value,challenge);
     await accountCall('/api/account/verify',{address:wallet.address,nonce:challenge.nonce,signature});
     signedIn();
     if(panel.isConnected&&location.hash==='#wallet/admin')location.hash='admin';
     if(panel.isConnected&&location.hash==='#wallet/support')location.hash='support';
   }catch(e){note.textContent=e.message}finally{form.reset();button.disabled=false}
 };
 try{const state=await accountCall('/api/account');if(state.address===wallet.address&&!form.hidden)signedIn()}catch{/* Local wallet remains usable offline. */}
}
export async function mountDeviceWallet(panel, selectAddress, onOwnerSignIn) {
  let wallet = await walletRecord();
  function showWallet() {
    panel.innerHTML = '<h3>Your device wallet</h3><p>Demo shopping balance</p><p data-public style="overflow-wrap:anywhere"></p><div class="actions"><button data-use>Use this address</button><button data-export class="secondary">Download recovery file</button></div><p class="fine">Keep the encrypted file and your passphrase to restore this wallet on another device.</p><section data-wallet-account class="stack"></section>';
    panel.querySelector('[data-public]').textContent = wallet.address;
    mountAccount(panel.querySelector('[data-wallet-account]'),wallet,onOwnerSignIn,Boolean(onOwnerSignIn));
    panel.querySelector('[data-use]').onclick = () => selectAddress(wallet.address);
    if(onOwnerSignIn){
      panel.querySelector('h3').textContent='Owner wallet';
      panel.querySelector('p').remove();panel.querySelector('[data-use]').remove();
    }
    panel.querySelector('[data-export]').onclick = () => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(wallet)], {type:'application/json'}));
      link.download = 'looku-testnet-' + wallet.address.slice(-8) + '.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    };
  }
  if (wallet) { showWallet(); return wallet.address; }
  panel.innerHTML = `<h3>Create a demo wallet</h3><p>Make a wallet on this device for demo purchases. Your passphrase unlocks the wallet when you sign in or approve a payment.</p>
    <form><label>Wallet passphrase<input type="password" name="phrase" required minlength="12" autocomplete="new-password" placeholder="At least 12 characters"></label>
    <label>Confirm passphrase<input type="password" name="repeat" required autocomplete="new-password"></label><button>Create wallet</button></form>
    <details><summary>Restore a wallet</summary><form><label>looku recovery file<input type="file" name="backup" required accept=".json"></label><label>Wallet passphrase<input type="password" name="phrase" required autocomplete="current-password"></label><button>Restore wallet</button></form></details><p role="status"></p>`;
  if(onOwnerSignIn){
    panel.querySelector('h3').textContent='Set up your owner wallet';
    panel.querySelector('p').textContent='Restore your linked wallet using its recovery file, or create a wallet for first-time enrollment.';
  }
  for (const form of panel.querySelectorAll('form')) form.onsubmit = async event => {
    event.preventDefault();
    const status = panel.querySelector('[role=status]');
    const controls = [...panel.querySelectorAll('button')];
    if (controls.some(button => button.disabled)) return;
    controls.forEach(button => button.disabled = true);
    try {
      const {generateWallet, unlockWallet} = await import('/api/payments/client.js');
      const pass = form.elements.phrase.value;
      let record;
      if (form.elements.backup) {
        const file = form.elements.backup.files[0];
        if (!file || file.size > 4096) throw Error('Choose a looku wallet recovery file.');
        try { record = JSON.parse(await file.text()); } catch { throw Error('Choose the JSON recovery file you downloaded from looku.'); }
        await unlockWallet(record, pass);
      } else {
        if (pass !== form.elements.repeat.value) throw Error('Enter the same passphrase twice.');
        record = await generateWallet(pass);
      }
      wallet = await walletRecord(record);
      showWallet();
      selectAddress?.(wallet.address);
    } catch (e) { status.textContent = e.message; }
    finally { controls.forEach(button => button.disabled = false); }
  };
}
