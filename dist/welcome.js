import {pageHeader} from './ui.js';
import {emailAccount, emailHeaders, bindAccountDialog} from './email-auth.js';
import {accountCall, mountAccount, walletRecord} from './local-wallet.js';

export async function mountWelcome(root) {
  const enter = () => { if (root.isConnected) location.replace('#studio'); };
  root.innerHTML = `<section class="entry-card"><div class="entry-photo" aria-hidden="true"></div>
    <div class="entry-copy"><a href="/" class="eyebrow">← Looku home</a>${pageHeader({title:'Enter your studio.',description:'Sign in to save your account details and take part in the Community closet.'}).outerHTML}
    <div data-email></div><div data-wallet-entry><button type="button" class="secondary account-trigger" data-open-account aria-haspopup="dialog">Use a Stellar wallet</button><dialog aria-label="Use a Stellar wallet"><button type="button" class="close" aria-label="Close wallet sign-in">×</button><h2>Wallet sign-in</h2>
    <p>Approve a sign-in message in Varial. Signing in has no fee and moves no funds.</p>
    <button data-connect>Continue with Varial</button><p data-status role="status"></p>
    <div data-device></div></dialog></div><a href="#studio">Explore the studio as a guest →</a></div></section>`;
  const panel = root.querySelector('[data-email]');
  bindAccountDialog(root.querySelector('[data-wallet-entry]'));
  const renderEmail = () => emailAccount(panel, enter, 'Continue with email');
  renderEmail();
  const button = root.querySelector('[data-connect]');
  button.onclick = async () => {
    const note = root.querySelector('[data-status]');
    button.disabled = true;
    note.textContent = 'Open Varial to approve your sign-in.';
    try {
      const {freighterAddress, signFreighterLogin} = await import('/api/payments/client.js');
      const address = await freighterAddress();
      const challenge = await accountCall('/api/account/challenge', {address, method:'freighter'});
      const signature = await signFreighterLogin(address, challenge.message);
      await accountCall('/api/account/verify', {address, nonce:challenge.nonce, signature});
      enter();
    } catch (error) { note.textContent = error.message; }
    finally { button.disabled = false; }
  };
  walletRecord().then(wallet => {
    if (wallet && root.isConnected) mountAccount(root.querySelector('[data-device]'), wallet, enter);
  }).catch(() => {});
  try {
    const headers = await emailHeaders().catch(() => ({}));
    const response = await fetch('/api/community/session', {headers, cache:'no-store'});
    if (response.ok && (await response.json()).signedIn) return enter();
    if (response.status === 401) localStorage.removeItem('looku.privy-session');
    if (root.isConnected && !panel.querySelector('form') && !localStorage.getItem('looku.privy-session')) renderEmail();
  } catch { /* The local studio remains available offline. */ }
}
