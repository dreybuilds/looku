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

export async function mountDeviceWallet(panel, selectAddress) {
  let wallet = await walletRecord();
  function showWallet() {
    panel.innerHTML = '<h3>Your device wallet</h3><p>Stellar testnet · demo funds</p><p data-public style="overflow-wrap:anywhere"></p><div class="actions"><button data-use>Use this address</button><button data-export class="secondary">Download recovery file</button></div><p class="fine">Keep the encrypted file and your passphrase to restore this wallet on another device.</p>';
    panel.querySelector('[data-public]').textContent = wallet.address;
    panel.querySelector('[data-use]').onclick = () => selectAddress(wallet.address);
    panel.querySelector('[data-export]').onclick = () => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(wallet)], {type:'application/json'}));
      link.download = 'looku-testnet-' + wallet.address.slice(-8) + '.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    };
  }
  if (wallet) { showWallet(); return wallet.address; }
  panel.innerHTML = `<h3>Create a testnet wallet</h3><p>Make a wallet on this device for demo purchases. Your passphrase protects the signing key.</p>
    <form><label>Wallet passphrase<input type="password" name="phrase" required minlength="12" autocomplete="new-password" placeholder="At least 12 characters"></label>
    <label>Confirm passphrase<input type="password" name="repeat" required autocomplete="new-password"></label><button>Create wallet</button></form>
    <details><summary>Restore a wallet</summary><form><label>looku recovery file<input type="file" name="backup" required accept=".json"></label><label>Wallet passphrase<input type="password" name="phrase" required autocomplete="current-password"></label><button>Restore wallet</button></form></details><p role="status"></p>`;
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
        record = JSON.parse(await file.text());
        await unlockWallet(record, pass);
      } else {
        if (pass !== form.elements.repeat.value) throw Error('Enter the same passphrase twice.');
        record = await generateWallet(pass);
      }
      wallet = await walletRecord(record);
      showWallet();
      selectAddress(wallet.address);
    } catch (e) { status.textContent = e.message; }
    finally { controls.forEach(button => button.disabled = false); }
  };
}
