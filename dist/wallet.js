import {mountStellarWallet} from './stellar-wallet.js';
import {enabled} from './features.js';
import {productUrl,guessName,fetchProductPreview,prices,currency,money} from './shopping.js';
import {accountCall,mountDeviceWallet} from './local-wallet.js';
export const baseUSDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const networks = {
  testnet: { label: 'demo wallet', host: 'https://horizon-testnet.stellar.org', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
  stellar: { label: 'Stellar mainnet', host: 'https://horizon.stellar.org', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' },
  base: { label: 'Base mainnet', host: 'https://mainnet.base.org', contract: baseUSDC }
};
const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 7 });
const storageKey = 'looku.wallet.v1';

export async function readWalletBalance(network, address, signal, block='latest') {
  if (!Object.hasOwn(networks, network)) throw Error('Choose a supported network.');
  const plan = networks[network];
  if (network === 'base') {
    if (!/^0x[0-9a-f]{40}$/i.test(address)) throw Error('Enter a public Base address beginning with 0x.');
    const res = await fetch(plan.host, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [
        { to: plan.contract, data: '0x70a08231' + address.slice(2).padStart(64, '0') }, block
      ] })
    });
    if (!res.ok) throw Error('The Base balance service is unavailable. Try again.');
    const { result } = await res.json();
    if (!/^0x[0-9a-f]{64}$/i.test(result)) throw Error('Base returned an incomplete balance. Try again.');
    return { usdc: Number(BigInt(result)) / 1e6, units: BigInt(result) };
  }
  if (!/^G[A-Z2-7]{55}$/.test(address)) throw Error('Enter a 56-character public Stellar address beginning with G.');
  const res = await fetch(plan.host + '/accounts/' + address, { signal, cache: 'no-store' });
  if (res.status === 404) throw Error('This account has not been activated on ' + plan.label + '. Check the address and network.');
  if (res.status === 400) throw Error('Check the Stellar address and paste it again.');
  if (!res.ok) throw Error('The Stellar balance service is unavailable. Try again.');
  const { balances } = await res.json();
  if (!Array.isArray(balances)) throw Error('Stellar returned an incomplete balance. Try again.');
  const line = balances.find(asset => asset.asset_code === 'USDC' && asset.asset_issuer === plan.issuer);
  const native = balances.find(asset => asset.asset_type === 'native');
  return { usdc: Number(line?.balance || 0), xlm: Number(native?.balance || 0), needsTrustline: !line };
}

export async function mountWallet(element) {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(storageKey)) || {}; }
  catch { saved = {}; }
  if (typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const heading = (number, title, description) => `<summary><span class="eyebrow" aria-hidden="true">${number}</span><span>${title}</span></summary><p class="wallet-description">${description}</p>`;
  element.innerHTML = `<div class="wallet-grid"><details name="wallet-tool" class="panel wallet-panel">${heading('01','Device wallet · demo','Use an existing device wallet for the demo, or restore a previous backup. Your primary Stellar account wallet is above.')}<div data-device-wallet class="wallet-body"></div></details>
    <details name="wallet-tool" class="panel wallet-panel" data-funding></details>
    <details name="wallet-tool" class="panel wallet-panel">
      ${heading('03','Check balance','Choose a network and check what’s available for your next look.')}<div class="wallet-body">
      <form data-account>
        <label>Network<select name="network"><option value="testnet">Demo shopping balance</option><option value="stellar">Stellar mainnet · real funds</option><option value="base">Base mainnet · MiniSend funds</option></select></label>
        <label>Public wallet address<input name="address" required autocomplete="off" spellcheck="false" autocapitalize="none" maxlength="56"></label>
        <button class="btn" type="submit">Check balance</button>
      </form><p data-balance role="status"></p></div>
    </details>
    <details name="wallet-tool" class="panel wallet-panel">
      ${heading('04','Save for a piece','Track a wardrobe goal against your balance. Your funds stay available to you.')}<div class="wallet-body">
      <form data-goal>
        <label><span id="wallet-goal-source-label">Choose a piece</span><select name="source" aria-labelledby="wallet-goal-source-label"><option value="manual">Enter a piece by name</option><option value="link">Paste a product link</option><optgroup label="From your Wishlist" data-wishes></optgroup></select></label>
        <label data-link-field hidden>Product link<input name="productLink" type="url" maxlength="4096" placeholder="https://…" disabled></label>
        <p class="fine" data-source-note role="status" hidden></p>
        <label>What are you saving for?<input name="piece" maxlength="120" placeholder="A cropped jacket" required></label>
        <label><span>Target in <span data-unit>USDC</span></span><input name="amount" type="number" min="0.01" max="10000000" step="0.01" placeholder="35.00" required></label>
        <button class="btn" type="submit">Save goal</button>
      </form><a data-goal-link hidden target="_blank" rel="noopener noreferrer">View product ↗</a><p data-progress role="status"></p><progress aria-label="Savings target progress" max="100" hidden></progress></div>
    </details>
    </div>`;
  const primary=document.createElement('section');element.prepend(primary);void mountStellarWallet(primary);
  const account = element.querySelector('[data-account]');
  const goalForm = element.querySelector('[data-goal]');
  const status = element.querySelector('[data-balance]');
  const goalText = element.querySelector('[data-progress]');
  const bar = element.querySelector('progress');
  const network = account.elements.network;
  const address = account.elements.address;
  let balance = null;
  let activeRequest;
  let networkState;
  const {source,productLink,piece,amount} = goalForm.elements;
  const wishes = goalForm.querySelector('[data-wishes]');
  const note = goalForm.querySelector('[data-source-note]');
  const goalLink = element.querySelector('[data-goal-link]');
  let rows = [];
  let previewController;
  let previewTimer;
  function sourceNote(message) {
    note.textContent = message;
    note.hidden = !message;
  }
  function stopPreview() {
    clearTimeout(previewTimer);
    previewController?.abort();
  }
  function showLinkField() {
    productLink.disabled = source.value !== 'link';
    productLink.required = !productLink.disabled;
    goalForm.querySelector('[data-link-field]').hidden = productLink.disabled;
  }
  function fillPrice(price,unit) {
    if (amount.value) return;
    const targetUnit = element.querySelector('[data-unit]').textContent;
    if (unit === targetUnit && Number(price) > 0 && Number(price) <= Number(amount.max)) {
      amount.value = Number(price).toFixed(2);
    }
  }
  source.addEventListener('change', () => {
    stopPreview();
    showLinkField();
    productLink.value = piece.value = amount.value = '';
    productLink.setCustomValidity('');
    sourceNote('');
    if (source.value === 'link') { productLink.focus(); return; }
    const item = rows.find(row => row.url === source.value);
    if (item) {
      piece.value = item.title;
      fillPrice(item.target / 100,item.currency);
      if (!amount.value) sourceNote('Enter your target in the currency shown below.');
    }
  });
  productLink.addEventListener('input', () => {
    stopPreview();
    productLink.setCustomValidity('');
    piece.value = amount.value = '';
    sourceNote('');
    if (!productLink.value) return;
    let url;
    try { url = productUrl(productLink.value.trim()); }
    catch { productLink.setCustomValidity('Enter a full HTTPS product link.'); return; }
    const fallback = guessName(url);
    piece.value = fallback;
    if(!enabled('preview'))return;
    const controller = new AbortController();
    previewController = controller;
    sourceNote('Loading product details…');
    previewTimer = setTimeout(async () => {
      try {
        const data = await fetchProductPreview(url.href,controller.signal);
        if (controller.signal.aborted) return;
        if (piece.value === fallback && data.title) piece.value = data.title.slice(0,120);
        fillPrice(data.price,data.currency);
        sourceNote(amount.value ? 'Review the name and target before saving.' : 'Check the name and enter your target below.');
      } catch {
        if (!controller.signal.aborted) sourceNote('Enter the name and target to save this link.');
      }
    },450);
  });
  goalForm.closest('details').addEventListener('toggle',async event => {
    if (!event.target.open) return;
    try {
      const {items} = await import('./wishlist.js');
      const latest = await items();
      const selected = source.value;
      rows = latest;
      wishes.replaceChildren(...rows.map(row => new Option(row.title,row.url)));
      if (rows.some(row => row.url === selected)) source.value = selected;
      else if (selected !== 'manual' && selected !== 'link') {
        source.value = 'link';
        productLink.value = selected;
        showLinkField();
      }
      if (!rows.length) wishes.append(Object.assign(new Option('No saved pieces yet'),{disabled:true}));
    } catch {
      wishes.replaceChildren(Object.assign(new Option('Wishlist unavailable'),{disabled:true}));
    }
  });
  function persist() {
    saved[network.value] = networkState;
    try { localStorage.setItem(storageKey, JSON.stringify(saved)); }
    catch { goalText.textContent += ' Device storage is unavailable. Changes last for this visit.'; }
  }
  function showProgress() {
    bar.hidden = true;
    if (!networkState.goal) { goalText.textContent = ''; return; }
    const { piece, amount } = networkState.goal;
    if (!Number.isFinite(amount) || amount <= 0) return;
    const display = value => network.value==='testnet'?money(value):format.format(value)+' USDC';
    const caption = piece + ' · ' + display(amount);
    if (balance === null) { goalText.textContent = caption + '. Check your balance to see progress.'; return; }
    const held = network.value === 'testnet' ? balance.xlm : balance.usdc;
    const remaining = Math.max(0, amount - held);
    bar.value = Math.min(100, 100 * held / amount);
    bar.hidden = false;
    goalText.textContent = caption + (remaining > 0 ? ' · ' + display(remaining) + ' to go.' : ' · Goal reached.');
  }
  function clearBalance() {
    activeRequest?.abort();
    balance = null;
    status.textContent = '';
    showProgress();
  }
  function setNetwork() {
    networkState = saved[network.value] || {};
    element.querySelector('[data-unit]').textContent = network.value === 'testnet' ? currency() : 'USDC';
    address.value = networkState.address || '';
    address.placeholder = network.value === 'base' ? '0x…' : 'G…';
    address.maxLength = network.value === 'base' ? 42 : 56;
    stopPreview();
    sourceNote('');
    let savedUrl = '';
    try { savedUrl = productUrl(networkState.goal?.url).href; } catch {}
    source.value = savedUrl ? 'link' : 'manual';
    productLink.value = savedUrl;
    productLink.setCustomValidity('');
    showLinkField();
    goalLink.hidden = !savedUrl;
    if (savedUrl) goalLink.href = savedUrl;
    else goalLink.removeAttribute('href');
    goalForm.elements.piece.value = networkState.goal?.piece || '';
    goalForm.elements.amount.value = networkState.goal ? Number((networkState.goal.amount*(network.value==='testnet'?prices[currency()]:1)).toFixed(2)) : '';
    clearBalance();
    const funding = element.querySelector('[data-funding]');
    if (network.value === 'testnet') {
      funding.innerHTML = heading('02','Add demo funds','Request demo funds from Stellar to try a demo purchase.') + '<div class="wallet-body"><label>Demo wallet address<input data-faucet-address placeholder="G…" maxlength="56" autocomplete="off" spellcheck="false"></label><button type="button" data-friendbot>Add demo funds</button><p data-faucet-status role="status"></p></div>';
      funding.querySelector('input').value = address.value;
    } else if (network.value === 'base') {
      if(!enabled('mpesa')){funding.innerHTML=heading('02','Receive Base USDC','Use your Base wallet address to receive USDC.');return}
      funding.innerHTML = heading('02','Fund with MiniSend','Base mainnet · real funds') + '<div class="wallet-body"><p>Choose Buy in MiniSend, select USDC, and use your Base wallet address. Review the rate and fees there.</p><a href="https://app.minisend.xyz/" target="_blank" rel="noopener noreferrer">Open MiniSend ↗</a></div>';
    } else {
      funding.innerHTML = heading('02','Receive Stellar USDC','Stellar mainnet · real funds') + '<p>Use your Stellar wallet’s receive screen to fund it on mainnet.</p>';
    }
  }
  element.querySelector('[data-funding]').addEventListener('click', async event => {
    const button = event.target.closest('[data-friendbot]');
    if (!button || network.value !== 'testnet') return;
    const faucetAddress = element.querySelector('[data-faucet-address]');
    const destination = faucetAddress.value.trim();
    const note = element.querySelector('[data-faucet-status]');
    if (!/^G[A-Z2-7]{55}$/.test(destination)) {
      note.textContent = 'Create a device wallet or enter a public Stellar testnet address first.';
      faucetAddress.focus();
      return;
    }
    button.disabled = true;
    note.textContent = 'Requesting demo funds…';
    try {
      const response = await fetch('https://friendbot.stellar.org/?addr=' + destination, { signal: AbortSignal.timeout(30000) });
      if (response.ok) {
        note.textContent = 'Demo funds added to ' + destination.slice(0,6) + '…' + destination.slice(-4) + '. ';
        if(sessionStorage.getItem('looku.return-to-order')){
          const checkout=document.createElement('button');
          checkout.type='button';checkout.dataset.buy='';checkout.textContent='Continue to jacket checkout';
          note.append(checkout);
        } else note.append('Choose Check balance to see your funds.');
      }
      else note.textContent = 'Could not add demo funds to this wallet. Check your balance first. Accounts that already hold test funds may be ineligible.';
    } catch { note.textContent = 'The demo funding service is unavailable. Check your balance before trying again.'; }
    finally { button.disabled = false; }
  });
  element.addEventListener('input', event => {
    const faucet = element.querySelector('[data-faucet-address]');
    if (event.target === address && faucet) faucet.value = address.value;
    if (event.target === faucet) address.value = faucet.value;
    if (event.target === address || event.target === faucet) clearBalance();
  });
  network.addEventListener('change', setNetwork);
  account.addEventListener('submit', async event => {
    event.preventDefault();
    clearBalance();
    const controller = new AbortController();
    activeRequest = controller;
    status.textContent = 'Reading your ' + networks[network.value].label + ' balance…';
    try {
      const result = await readWalletBalance(network.value, address.value.trim(), AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]));
      if (controller.signal.aborted) return;
      balance = result;
      networkState.address = address.value.trim();
      const lines = network.value==='testnet'?[money(result.xlm)+' in practice funds']:[format.format(result.usdc) + ' USDC'];
      if (network.value!=='testnet' && result.xlm !== undefined) lines.push(format.format(result.xlm) + ' XLM');
      status.textContent = lines.join(' · ') + ' on ' + networks[network.value].label + '.'
        + (network.value === 'stellar' && result.needsTrustline ? ' Add the Circle USDC trustline in your Stellar wallet to receive USDC.' : '');
      showProgress();
      persist();
    } catch (e) {
      if (!controller.signal.aborted) status.textContent = e instanceof TypeError || e.name === 'TimeoutError' ? 'Could not reach the network. Try again.' : e.message;
    }
  });
  goalForm.addEventListener('submit', event => {
    event.preventDefault();
    const piece = goalForm.elements.piece.value.trim();
    const amount = goalForm.elements.amount.valueAsNumber;
    if (!piece || !(amount > 0)) { goalText.textContent = 'Enter a piece and a positive target.'; return; }
    stopPreview();
    sourceNote('');
    const url = source.value === 'manual' ? '' : productUrl(source.value === 'link' ? productLink.value.trim() : source.value).href;
    goalLink.hidden = !url;
    if (url) goalLink.href = url;
    else goalLink.removeAttribute('href');
    networkState.goal = { piece, url, amount:network.value==='testnet'?amount/prices[currency()]:amount };
    showProgress();
    persist();
  });
  setNetwork();
  const panel = element.querySelector('[data-device-wallet]');
  function selectDeviceAddress(value) {
    network.value = 'testnet';
    setNetwork();
    address.value = value;
    element.querySelector('[data-faucet-address]').value = value;
    networkState.address = value;
    persist();
    status.textContent = 'Device wallet selected. Choose Add demo funds to fund it, or Check balance.';
  }
  try {
    const existing = await mountDeviceWallet(panel, selectDeviceAddress);
    if (existing && network.value === 'testnet' && !address.value) selectDeviceAddress(existing);
    const session=await accountCall('/api/account').catch(()=>null);
    if(session?.address && session.address!==existing){
      const box=document.createElement('section');
      box.className='panel';
      box.innerHTML='<h3>Signed in with Stellar</h3><p></p><button class="secondary">Sign out of wallet</button>';
      box.querySelector('p').textContent=session.address.slice(0,6)+'…'+session.address.slice(-6);
      box.querySelector('button').onclick=async()=>{
        try{await accountCall('/api/account/logout',{});location.assign('/app')}
        catch(error){box.querySelector('p').textContent=error.message}
      };
      element.prepend(box);
    }
  } catch (e) { panel.textContent = e.message; }
}
