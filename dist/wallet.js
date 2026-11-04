import {mountDeviceWallet} from './local-wallet.js';
const networks = {
  testnet: { label: 'Stellar testnet', host: 'https://horizon-testnet.stellar.org', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
  stellar: { label: 'Stellar mainnet', host: 'https://horizon.stellar.org', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' },
  base: { label: 'Base mainnet', host: 'https://mainnet.base.org', contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }
};
const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 7 });
const storageKey = 'looku.wallet.v1';

export async function readWalletBalance(network, address, signal) {
  if (!Object.hasOwn(networks, network)) throw Error('Choose a supported network.');
  const plan = networks[network];
  if (network === 'base') {
    if (!/^0x[0-9a-f]{40}$/i.test(address)) throw Error('Enter a public Base address beginning with 0x.');
    const res = await fetch(plan.host, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [
        { to: plan.contract, data: '0x70a08231' + address.slice(2).padStart(64, '0') }, 'latest'
      ] })
    });
    if (!res.ok) throw Error('The Base balance service is unavailable. Try again.');
    const { result } = await res.json();
    if (!/^0x[0-9a-f]{64}$/i.test(result)) throw Error('Base returned an incomplete balance. Try again.');
    return { usdc: Number(BigInt(result)) / 1e6 };
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
  element.innerHTML = `<div class="wallet-grid"><details name="wallet-tool" class="panel wallet-panel">${heading('01','See or create wallet','Your public Stellar address lives here. Create a wallet or restore one you already use.')}<div data-device-wallet class="wallet-body"></div></details>
    <details name="wallet-tool" class="panel wallet-panel" data-funding></details>
    <details name="wallet-tool" class="panel wallet-panel">
      ${heading('03','Check balance','Choose a network and check what’s available for your next look.')}<div class="wallet-body">
      <form data-account>
        <label>Network<select name="network"><option value="testnet">Stellar testnet · demo funds</option><option value="stellar">Stellar mainnet · real funds</option><option value="base">Base mainnet · MiniSend funds</option></select></label>
        <label>Public wallet address<input name="address" required autocomplete="off" spellcheck="false" autocapitalize="none" maxlength="56"></label>
        <button class="btn" type="submit">Check balance</button>
      </form><p data-balance role="status"></p></div>
    </details>
    <details name="wallet-tool" class="panel wallet-panel">
      ${heading('04','Save for a piece','Track a wardrobe goal against your balance. Your funds stay available to you.')}<div class="wallet-body">
      <form data-goal>
        <label>What are you saving for?<input name="piece" maxlength="70" placeholder="A cropped jacket" required></label>
        <label>Target in <span data-unit>USDC</span><input name="amount" type="number" min="0.01" max="10000000" step="0.01" placeholder="35.00" required></label>
        <button class="btn" type="submit">Save goal</button>
      </form><p data-progress role="status"></p><progress aria-label="Savings target progress" max="100" hidden></progress></div>
    </details>
    </div>`;
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
    const unit = network.value === 'testnet' ? 'XLM' : 'USDC';
    const caption = piece + ' · ' + format.format(amount) + ' ' + unit;
    if (balance === null) { goalText.textContent = caption + '. Check your balance to see progress.'; return; }
    const held = network.value === 'testnet' ? balance.xlm : balance.usdc;
    const remaining = Math.max(0, amount - held);
    bar.value = Math.min(100, 100 * held / amount);
    bar.hidden = false;
    goalText.textContent = caption + (remaining > 0 ? ' · ' + format.format(remaining) + ' ' + unit + ' to go.' : ' · Goal reached.');
  }
  function clearBalance() {
    activeRequest?.abort();
    balance = null;
    status.textContent = '';
    showProgress();
  }
  function setNetwork() {
    networkState = saved[network.value] || {};
    element.querySelector('[data-unit]').textContent = network.value === 'testnet' ? 'XLM' : 'USDC';
    address.value = networkState.address || '';
    address.placeholder = network.value === 'base' ? '0x…' : 'G…';
    address.maxLength = network.value === 'base' ? 42 : 56;
    goalForm.elements.piece.value = networkState.goal?.piece || '';
    goalForm.elements.amount.value = networkState.goal?.amount || '';
    clearBalance();
    const funding = element.querySelector('[data-funding]');
    if (network.value === 'testnet') {
      funding.innerHTML = heading('02','Get demo funds','Request free test XLM from Stellar to try a demo purchase.') + '<div class="wallet-body"><label>Demo wallet address<input data-faucet-address placeholder="G…" maxlength="56" autocomplete="off" spellcheck="false"></label><button type="button" data-friendbot>Get test XLM</button><p data-faucet-status role="status"></p></div>';
      funding.querySelector('input').value = address.value;
    } else if (network.value === 'base') {
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
    note.textContent = 'Requesting free test XLM…';
    try {
      const response = await fetch('https://friendbot.stellar.org/?addr=' + destination, { signal: AbortSignal.timeout(30000) });
      if (response.ok) {
        note.textContent = 'Test XLM sent to ' + destination.slice(0,6) + '…' + destination.slice(-4) + '. ';
        if(sessionStorage.getItem('looku.return-to-order')){
          const checkout=document.createElement('button');
          checkout.type='button';checkout.dataset.buy='';checkout.textContent='Continue to jacket checkout';
          note.append(checkout);
        } else note.append('Choose Check balance to see your funds.');
      }
      else note.textContent = 'Friendbot could not fund this address. Check your balance first. Accounts that already hold test funds may be ineligible.';
    } catch { note.textContent = 'Could not reach Friendbot. Check your balance before trying again.'; }
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
      const lines = [format.format(result.usdc) + ' USDC'];
      if (result.xlm !== undefined) lines.push(format.format(result.xlm) + ' XLM');
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
    networkState.goal = { piece, amount };
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
    status.textContent = 'Device wallet selected. Choose Get test XLM to fund it, or Check balance.';
  }
  try {
    const existing = await mountDeviceWallet(panel, selectDeviceAddress);
    if (existing && network.value === 'testnet' && !address.value) selectDeviceAddress(existing);
  } catch (e) { panel.textContent = e.message; }
}
