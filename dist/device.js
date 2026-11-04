import {restoreWardrobe} from './model.js';
const encode=new TextEncoder(),decode=new TextDecoder();
async function keyFor(secret,salt){
 const key=await crypto.subtle.importKey('raw',encode.encode(secret),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},key,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encryptBackup(data,secret){
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const payload=await crypto.subtle.encrypt({name:'AES-GCM',iv},await keyFor(secret,salt),encode.encode(JSON.stringify(data)));
 return new Blob(['LKU1',salt,iv,payload],{type:'application/octet-stream'});
}
export async function decryptBackup(buffer,secret){
 const b=new Uint8Array(buffer);
 if(decode.decode(b.slice(0,4))!=='LKU1')throw Error('Unknown backup format.');
 let plain;try{plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b.slice(20,32)},await keyFor(secret,b.slice(4,20)),b.slice(32))}catch{throw Error('Could not unlock the backup. Check the passphrase.')}
 const data=JSON.parse(decode.decode(plain));
 if(data.version!==1||!Array.isArray(data.items)||!Array.isArray(data.looks))throw Error('Unsupported wardrobe backup.');
 return data;
}
let installPrompt;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});
const headerInstall = document.querySelector('#install-looku');
const standalone = matchMedia('(display-mode: standalone)');
function updateInstall() { headerInstall.hidden = standalone.matches || navigator.standalone === true; }
updateInstall();
standalone.addEventListener('change', updateInstall);
window.addEventListener('appinstalled', () => { installPrompt=null; headerInstall.hidden=true; });
export async function requestInstall() {
 if (standalone.matches || navigator.standalone) return 'looku is already installed on this device.';
 if (installPrompt) {
   const prompt = installPrompt;
   installPrompt = null;
   try { await prompt.prompt(); await prompt.userChoice; return ''; } catch { /* Show browser guidance. */ }
 }
 if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1)) return 'Open looku in Safari, tap Share, then Add to Home Screen.';
 if (/Macintosh/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium/.test(navigator.userAgent)) return 'In Safari, open File → Add to Dock. If you opened looku inside another app, open it in Safari first.';
 return 'Open looku in Chrome or Edge. Select the install icon in the address bar, or open the browser menu and choose Install looku or Install page as app.';
}
export function devicePanel(){return `<details class="panel"><summary>Install looku &amp; manage storage</summary><div class="stack"><p>Your wardrobe and saved outfits are stored on this device. Publishing sends a public copy of the selected names and images to Community. Withdraw it there to remove it from Looku. Open looku once online to prepare it for offline use. Clearing browser data removes your local wardrobe.</p><button class="secondary" data-install>Install looku on this device</button><p class="fine">Optional online backup saves an encrypted snapshot to your <a href="/signin-with-chatgpt?return_to=%2F%23wardrobe" target="_top">signed-in ChatGPT account</a>. It includes clothing photos, the inspiration reference and saved outfits. Wallet addresses, receipts and savings goals stay outside the backup. Choose Back up again after making changes.</p><label>Backup passphrase · keep this to restore on another device<input type="password" data-pass autocomplete="off" minlength="12" placeholder="At least 12 characters"></label><div class="row"><button data-backup="save">Back up online</button><button class="secondary" data-backup="restore">Restore online backup</button><button class="secondary" data-backup="delete">Delete online backup</button></div><p role="status" data-device-status></p></div></details>`;}
export async function deviceAction(button,snapshot){
 const el=button.closest('details'),status=el.querySelector('[data-device-status]');
 if(button.hasAttribute('data-install')){
  status.textContent = await requestInstall();
  return;
 }
 const op=button.dataset.backup,field=el.querySelector('[data-pass]'),secret=field.value;
 if(op!=='delete'&&secret.length<12){status.textContent='Enter a passphrase of at least 12 characters.';return}
 if(op==='restore'&&!confirm('Replace this device’s wardrobe, saved outfits and reference with your online backup?'))return;
 if(op==='delete'&&!confirm('Permanently delete your online backup? Your wardrobe stays on this device.'))return;
 if(op==='save'&&!confirm('Upload this wardrobe snapshot and replace any previous backup on your account? Keep the passphrase so you can restore it.'))return;
 const controls=[...el.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);
 try{
  status.textContent='Working…';
  const blob=op==='save'?await encryptBackup({version:1,...snapshot()},secret):undefined;
  if(blob&&blob.size>12*1024*1024)throw Error('The online backup limit is 12 MB.');
  const r=await fetch('/api/wardrobe-backup',{method:{save:'PUT',restore:'GET',delete:'DELETE'}[op],headers:{'X-Looku-Action':'wardrobe-backup'},body:blob,cache:'no-store',redirect:'error'});
  if(!r.ok)throw Error(r.status===401?'Sign in to your looku site account to use online backup.':r.status===404?'No online backup was found.':'Online backup unavailable. Your local wardrobe is still on this device.');
  if(op==='restore'){const data=await decryptBackup(await r.arrayBuffer(),secret);await restoreWardrobe(data);location.reload();return}
  status.textContent=op==='save'?'Encrypted wardrobe backed up. Later changes stay on this device until you back up again.':'Online backup deleted.';
  field.value='';
 }catch(e){status.textContent=e.message}finally{controls.forEach(b=>b.disabled=false)}
}
