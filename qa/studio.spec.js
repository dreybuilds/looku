import {test,expect,chromium} from '@playwright/test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const photo=fileURLToPath(new URL('../dist/orchid-detail.webp',import.meta.url));
async function toggleWallet(page,title){await page.locator('.wallet-panel > summary').filter({hasText:title}).click()}
async function nav(page,name){await page.getByRole('navigation').getByRole('link',{name,exact:true}).click()}
test('upload, prompt, save, reload, filter and remove',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Add a piece',exact:true}).first().click();
 const dialog=page.getByRole('dialog',{name:'Add a piece'});
 await dialog.getByLabel('Clothing photo').setInputFiles(photo);
 await dialog.getByLabel('Piece name').fill('Lilac linen shirt');
 await dialog.getByRole('button',{name:'Add to wardrobe'}).click();
 await expect(dialog).toBeHidden();
 await nav(page,'Stylist');
 const prompt='Lilac linen shirt and jeans for brunch, no dress';
 await page.getByLabel('Describe your look').fill(prompt);
 await page.getByRole('button',{name:/Orchid Hour/}).click();
 await expect(page.getByLabel('Describe your look')).toHaveValue(prompt);
 await page.getByRole('button',{name:'Build my look'}).click();
 await expect(page.getByRole('heading',{name:'Weekend edit'})).toBeFocused();
 await expect(page.getByRole('article').filter({hasText:'Lilac linen shirt'})).toBeVisible();
 await expect(page.getByRole('article').filter({hasText:'Slip dress'})).toHaveCount(0);
 await page.getByRole('button',{name:'Save outfit'}).click();
 await page.getByRole('link',{name:'View saved outfits'}).click();
 await expect(page.getByRole('heading',{name:prompt})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('heading',{name:prompt})).toBeVisible();
 await page.getByText('View outfit pieces',{exact:true}).click();
 await expect(page.locator('details[open] img[alt="Lilac linen shirt"]')).toBeVisible();
 await page.getByText('View outfit pieces',{exact:true}).click();
 await page.getByLabel('Category').selectOption('jacket');
 await expect(page.getByText('No pieces in this category yet.')).toBeVisible();
 await page.getByLabel('Category').selectOption('shirt');
 page.once('dialog',d=>d.accept());
 await page.getByRole('article').filter({hasText:'Lilac linen shirt'}).locator('..').getByRole('button',{name:'Remove',exact:true}).click();
 await expect(page.getByRole('article').filter({hasText:'Lilac linen shirt'})).toHaveCount(0);
});
test('checkout detour, wallet recovery, savings and wrong signing passphrase',async({page,browser})=>{
 await page.goto('/#stylist');
 await page.getByRole('button',{name:'Review purchase'}).click();
 await page.getByLabel('Spending limit').fill('0.75');
 await page.getByRole('link',{name:'Create a demo wallet'}).click();
 const form=page.locator('[data-device-wallet] form').first();
 const phrase=crypto.randomUUID();
 await form.getByLabel('Wallet passphrase').fill(phrase);
 await form.getByLabel('Confirm passphrase').fill('mismatch');
 await form.getByRole('button').click();
 await expect(page.getByText('Enter the same passphrase twice.')).toBeVisible();
 await form.getByLabel('Confirm passphrase').fill(phrase);
 await form.getByRole('button').click();
 const account=page.locator('[data-wallet-account]');
 await account.getByLabel('Sign-in passphrase').fill(phrase);
 await account.getByRole('button',{name:'Sign in with this wallet'}).click();
 await expect(account.getByRole('status')).toContainText('Signed in');
 await account.getByRole('button',{name:'Sign out'}).click();
 await expect(account.getByLabel('Sign-in passphrase')).toBeVisible();
 const address=page.getByLabel('Public wallet address');
 await expect(address).toHaveValue(/^G[A-Z2-7]{55}$/);
 const publicKey=await address.inputValue();
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download recovery file'}).click();
 const file=await (await download).path();
 await toggleWallet(page,'Save for a piece');
 await page.getByLabel('What are you saving for?').fill('Cropped jacket');
 await page.getByLabel('Target in').fill('12');
 await page.getByRole('button',{name:'Save goal'}).click();
 await page.reload();
 await toggleWallet(page,'Save for a piece');
 await expect(page.getByText(/Cropped jacket · 12 XLM/)).toBeVisible();
 await page.getByRole('button',{name:'Return to checkout'}).click();
 const dialog=page.getByRole('dialog',{name:'Cropped jacket'});
 await expect(dialog.getByLabel('Spending limit')).toHaveValue('0.75');
 await dialog.getByLabel('Spending limit').fill('1');
 await dialog.getByLabel('Wallet passphrase').fill('incorrect phrase');
 await dialog.getByRole('button',{name:'Pay 1 test XLM with device wallet'}).click();
 await expect(dialog.getByRole('status')).toContainText('Could not unlock');
 await dialog.getByRole('button',{name:'Close dialog'}).click();
 const fresh=await browser.newContext();
 try{
   const restored=await fresh.newPage();await restored.goto('http://127.0.0.1:4315/#wallet');
 await toggleWallet(restored,'See or create wallet');
   await restored.getByText('Restore a wallet',{exact:true}).click();
   const restore=restored.locator('[data-device-wallet] details form');
   await restore.getByLabel('looku recovery file').setInputFiles(file);
   await restore.getByLabel('Wallet passphrase').fill(phrase);
   await restore.getByRole('button',{name:'Restore wallet'}).click();
   await expect(restored.getByLabel('Public wallet address')).toHaveValue(publicKey);
 }finally{await fresh.close()}
});
test('offline reload, navigation, store search, styling and 3D rotation',async({page,context})=>{
 await page.goto('/');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}))});
 await context.setOffline(true);await page.reload();
 await expect(page.getByRole('heading',{name:'The Orchid Edit.'})).toBeVisible();
 await page.getByRole('slider').press('ArrowRight');
 await expect(page.getByRole('slider')).toHaveAttribute('aria-valuetext','15 degrees');
 await page.getByRole('button',{name:'Style this palette'}).click();
 await expect(page.getByText('Colour #a77bb6')).toBeVisible();
 await nav(page,'Stores');await page.getByLabel('Find a program').fill('nonexistentzzz');
 await expect(page.getByText('No programs match your search.')).toBeVisible();
 await page.getByLabel('Find a program').fill('');
 expect(await page.locator('#store-list article').count()).toBeGreaterThan(20);
});
test('native PWA metadata and install affordance',async({},testInfo)=>{
 const context=await chromium.launchPersistentContext(testInfo.outputPath('disposable-profile'),{channel:'chrome',viewport:testInfo.project.use.viewport});
 try {
 const page=await context.newPage();
 await page.goto('http://127.0.0.1:4315/');
 const cdp=await context.newCDPSession(page);
 await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
 expect((await cdp.send('Page.getAppManifest')).errors).toEqual([]);
 expect((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
 await page.evaluate(()=>{
   const event=new Event('beforeinstallprompt',{cancelable:true});
   event.prompt=async()=>{document.body.dataset.installOpened='yes'};event.userChoice=Promise.resolve({outcome:'dismissed'});
   window.dispatchEvent(event);
 });
 await page.getByRole('button',{name:'Install looku',exact:true}).click();
 await expect(page.locator('body')).toHaveAttribute('data-install-opened','yes');
 await page.getByRole('button',{name:'Install looku',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Install looku'})).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeHidden();
 }finally{await context.close()}
});
test('accessible pages, dialog names and viewport fit',async({page})=>{
 const failures=[];
 page.on('pageerror',e=>failures.push(e.message));
 for(const route of ['studio','wardrobe','stylist','community','wallet','shops']){
   await page.goto('/#'+route);
   const heading=page.getByRole('heading',{level:1});await expect(heading).toBeVisible();
   if(route==='wallet'){
     const rows=page.locator('.wallet-panel > summary');
     await expect(rows).toHaveCount(4);
     await expect(page.locator('.wallet-panel[open]')).toHaveCount(0);
     await rows.first().focus();await page.keyboard.press('Enter');
     await expect(page.getByRole('button',{name:'Create wallet',exact:true})).toBeVisible();
     await rows.nth(1).click();await expect(page.locator('.wallet-panel[open]')).toHaveCount(1);
     await rows.nth(1).click();await expect(page.locator('.wallet-panel[open]')).toHaveCount(0);
   }
   await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
   const problems=await page.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>v.id+' '+v.nodes.map(n=>n.target.join(' ')).slice(0,5).join(',')));
   failures.push(...problems.map(p=>route+' '+p));
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 expect(failures).toEqual([]);
});
test('custom palette persistence, sample portraits and local retailer applications',async({page})=>{
 await page.goto('/');
 const images=page.locator('.sample-photo');await expect(images).toHaveCount(4);
 await images.evaluateAll(imgs=>Promise.all(imgs.map(image=>image.decode())));
 await nav(page,'Stylist');
 await page.getByText('Custom style palette',{exact:true}).click();
 await page.getByLabel('Palette name').fill('Orchid weekend');
 await page.getByLabel('Colour 2',{exact:true}).fill('#301533');
 await page.getByRole('button',{name:'Save and style'}).click();
 await expect(page.getByText(/Colour match: Orchid weekend/)).toBeVisible();
 await page.reload();await expect(page.getByText(/Colour match: Orchid weekend/)).toBeVisible();
 await nav(page,'Stores');
 await page.getByText('Kenya applications and next steps').click();
 await expect(page.locator('#kenya-applications li')).toHaveCount(7);
 await expect(page.getByRole('link',{name:'Shop VaaBay'})).toHaveAttribute('href','https://www.vaabay.co.ke/');
});
test('encrypted backup round trip, wrong passphrase and Pinterest unavailable',async({page},info)=>{
 // Run once: the temporary test site has one synthetic signed-in backup owner.
 test.skip(info.project.name==='phone');
 await page.goto('/#wardrobe');
 await page.getByText('Install looku & manage storage').click();
 const pass=page.locator('[data-pass]');const phrase=crypto.randomUUID();
 await pass.fill(phrase);page.once('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Back up online'}).click();
 await expect(page.locator('[data-device-status]')).toContainText('Encrypted wardrobe backed up');
 await pass.fill('definitely-wrong-qa');page.once('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Restore online backup'}).click();
 await expect(page.locator('[data-device-status]')).toContainText('Could not unlock');
 await pass.fill(phrase);page.once('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Restore online backup'}).click();
 await expect(pass).toBeHidden();
 await page.getByText('Install looku & manage storage').click();
 page.once('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Delete online backup'}).click();
 await expect(page.locator('[data-device-status]')).toContainText('deleted');
 await nav(page,'Stylist');await page.getByText('Find inspiration on Pinterest').click();
 await page.getByLabel('Search Pins').fill('lilac streetwear');
 await page.getByRole('button',{name:'Search Pinterest'}).click();
 await expect(page.locator('#pin-status')).toContainText('waiting for an authorized');
});
test('invalid wallet proofs never grant a session and a valid challenge is single use',async({request,baseURL})=>{
 const {Keypair}=await import('../payments/node_modules/@stellar/stellar-sdk/lib/esm/index.js');
 const wallet=Keypair.random(),address=wallet.publicKey();
 const headers={Origin:baseURL,'X-Looku-Action':'wallet-account'};
 const challenge=await (await request.post('/api/account/challenge',{headers,data:{address}})).json();
 const verify=signature=>request.post('/api/account/verify',{headers,data:{address,nonce:challenge.nonce,signature}});
 expect((await verify('invalid')).status()).toBe(401);
 const signature=Buffer.from(wallet.sign(Buffer.from(challenge.message))).toString('base64');
 expect((await verify(signature)).status()).toBe(200);
 expect((await verify(signature)).status()).toBe(401);
 expect((await (await request.get('/api/account')).json()).address).toBe(address);
 await request.post('/api/account/logout',{headers,data:{}});
 expect((await (await request.get('/api/account')).json()).address).toBeNull();
});
test('preset survives refresh and funding uses the displayed testnet destination',async({page})=>{
 await page.goto('/#stylist');
 const sea=page.getByRole('button',{name:'Sea Glass',exact:true});
 await sea.click();await expect(sea).toHaveAttribute('aria-pressed','true');await page.reload();
 await expect(sea).toHaveAttribute('aria-pressed','true');
 await expect(page.getByText(/Colour match: Sea Glass/)).toBeVisible();
 await page.goto('/#wallet');
 await toggleWallet(page,'Get demo funds');
 const funding=page.getByLabel('Testnet funding address');
 const destination='G'+'A'.repeat(55);
 await funding.fill(destination);
 await expect(page.getByLabel('Public wallet address')).toHaveValue(destination);
 await page.route('https://friendbot.stellar.org/**',route=>route.fulfill({status:200,body:'{}'}));
 const request=page.waitForRequest(req=>req.url().startsWith('https://friendbot.stellar.org/'));
 await page.getByRole('button',{name:'Get test XLM'}).click();
 expect(new URL((await request).url()).searchParams.get('addr')).toBe(destination);
 await expect(page.locator('[data-faucet-status]')).toContainText('Test XLM sent');
 await toggleWallet(page,'Check balance');
 await page.getByRole('combobox',{name:'Network',exact:true}).selectOption('base');
 await expect(funding).toHaveCount(0);
 await toggleWallet(page,'Fund with MiniSend');
 await expect(page.getByRole('link',{name:/Open MiniSend/})).toBeVisible();
});
test('shopping agent explains its decision before wallet access',async({page})=>{
 await page.goto('/#stylist');
 await page.getByRole('button',{name:'Review purchase'}).click();
 const dialog=page.getByRole('dialog',{name:'Cropped jacket'});
 await dialog.getByLabel('Spending limit').fill('0.75');
 await dialog.getByRole('button',{name:'Check my limit'}).click();
 await expect(dialog.getByRole('status')).toContainText('above your limit');
 await dialog.getByLabel('Spending limit').fill('1');
 await dialog.getByRole('button',{name:'Check my limit'}).click();
 await expect(dialog.getByRole('status')).toContainText('fits your limit');
 const response=await page.request.get('/api/account/receipts');
 expect(response.status()).toBe(401);
});

test('add and style opens a look with the new piece and receipts are directly visible',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Add a piece',exact:true}).first().click();
 const dialog=page.getByRole('dialog',{name:'Add a piece'});
 await dialog.getByLabel('Clothing photo').setInputFiles(photo);
 await dialog.getByLabel('Piece name').fill('Lilac linen camp shirt');
 await dialog.getByRole('button',{name:'Add and style'}).click();
 await expect(page.getByRole('heading',{name:'Style an outfit'})).toBeVisible();
 await expect(page.getByLabel('Describe your look')).toHaveValue(/Lilac linen camp shirt/);
 await expect(page.getByRole('article').filter({hasText:'Lilac linen camp shirt'})).toBeVisible();
 await nav(page,'Wallet');
 await expect(page.getByRole('heading',{name:'Purchase receipts'})).toBeVisible();
});

test('returning from checkout focuses the receipt without hiding wallet tools',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>sessionStorage.setItem('looku.show-receipt','1'));
 await nav(page,'Wallet');
 await expect(page.locator('#receipts')).toBeFocused();
 await expect(page.getByText('See or create wallet',{exact:true})).toBeVisible();
});

test('community publishes selective snapshots for visitors and enforces ownership',async({page,browser,baseURL})=>{
 const {Keypair}=await import('../payments/node_modules/@stellar/stellar-sdk/lib/esm/index.js');
 async function signIn(request,key=Keypair.random()){
   const address=key.publicKey(),headers={Origin:baseURL,'X-Looku-Action':'wallet-account'};
   const challenge=await (await request.post('/api/account/challenge',{headers,data:{address}})).json();
   const signature=Buffer.from(key.sign(Buffer.from(challenge.message))).toString('base64');
   expect((await request.post('/api/account/verify',{headers,data:{address,signature,nonce:challenge.nonce}})).status()).toBe(200);
   return address;
 }
 const seller=await signIn(page.request);
 const guest=await browser.newContext({baseURL});
 const admin=await browser.newContext({baseURL,extraHTTPHeaders:{'oai-authenticated-user-email':'nzauaudrey@gmail.com'}});
 const adminHeaders={Origin:baseURL,'X-Looku-Action':'admin'};
 try{
   expect((await admin.request.get('/api/admin/accounts')).status()).toBe(403);
   const owner=await signIn(admin.request,Keypair.fromRawEd25519Seed(Buffer.alloc(32,7)));
   if((await (await admin.request.get('/api/admin/access')).json()).state==='enroll')await admin.request.post('/api/admin/enroll',{headers:adminHeaders,data:{address:owner}});
   expect((await admin.request.get('/api/admin/accounts')).status()).toBe(200);
   expect((await page.request.get('/api/admin/accounts',{headers:{'oai-authenticated-user-email':'nzauaudrey@gmail.com'}})).status()).toBe(403);
   const ownerPage=await admin.newPage();await ownerPage.goto('/#admin');
   await expect(ownerPage.getByRole('button',{name:'Affiliates',exact:true})).toBeVisible();
   await ownerPage.getByRole('button',{name:'Affiliates',exact:true}).click();
   const partner='QA partner '+crypto.randomUUID().slice(0,8);
   await ownerPage.getByLabel('Partner name').fill(partner);
   await ownerPage.getByLabel('Referral link').fill('https://example.org/ref');
   await ownerPage.getByRole('button',{name:'Add partner'}).click();
   await expect(ownerPage.getByRole('heading',{name:partner})).toBeVisible();
   const shops=await guest.newPage();await shops.goto('/#shops');
   await expect(shops.locator('.store').filter({hasText:partner}).getByRole('link')).toHaveAttribute('href','https://example.org/ref');
   await shops.close();
   const viewer=await guest.newPage(),headers={Origin:baseURL,'X-Looku-Action':'community'};
   expect((await guest.request.post('/api/community/look',{headers,data:{}})).status()).toBe(401);
   await page.goto('/#wardrobe');
   await page.getByRole('button',{name:/Add a piece/}).click();
   let dialog=page.getByRole('dialog');
   await dialog.getByLabel('Clothing photo').setInputFiles(photo);
   await dialog.getByLabel('Piece name').fill('Community linen shirt');
   await dialog.getByRole('button',{name:'Add to wardrobe'}).click();
   await expect(dialog).toBeHidden();
   await nav(page,'Stylist');await page.getByRole('button',{name:'Save outfit'}).click();
   for(const [kind,action,submit] of [['look','Publish look','Publish look'],['sale','Sell','List for sale'],['donate','Donate','Offer for donation']]){
     await nav(page,'Wardrobe');await page.getByRole('button',{name:action,exact:true}).click();
     const title='Shared '+kind+' '+crypto.randomUUID().slice(0,8);
     await dialog.getByLabel('Public title').fill(title);
     if(kind!=='look')await dialog.getByLabel('Contact email').fill('closet@example.com');
     if(kind==='sale')await dialog.getByLabel('Asking price').fill('500');
     await dialog.getByRole('button',{name:submit,exact:true}).click();
     await expect(page.locator('.community-post h2')).toHaveText(title);
     const url=page.url(),path='/api/'+url.split('#')[1];
     if(kind!=='look'){
       await expect(page.getByText('Awaiting admin review')).toBeVisible();
       expect((await guest.request.get(path)).status()).toBe(404);
       const endpoint='/api/admin/review/'+kind;
       const queue=await (await admin.request.get(endpoint)).json();
       const item=queue.items.find(x=>x.title===title);
       const decision={headers:adminHeaders,data:{revision:item.revision,status:'approved'}};
       expect((await page.request.post(endpoint+'/'+item.id,decision)).status()).toBe(403);
       expect((await admin.request.post(endpoint+'/'+item.id,decision)).status()).toBe(200);
       expect((await admin.request.post(endpoint+'/'+item.id,decision)).status()).toBe(409);
       await guest.clearCookies();
       expect(await (await guest.request.get(path)).json()).not.toHaveProperty('email');
       await signIn(guest.request);
     }
     await viewer.goto(url);await expect(viewer.locator('.community-post h2')).toHaveText(title);
     await expect(viewer.getByRole('button',{name:'Withdraw post'})).toHaveCount(0);
     if(kind==='sale')await expect(viewer.getByRole('link',{name:'Contact seller'})).toHaveAttribute('href','mailto:closet@example.com');
     if(kind==='donate')await expect(viewer.getByText('Free donation',{exact:true})).toBeVisible();
     await viewer.goto('/#community/'+kind);await expect(viewer.getByRole('heading',{name:title})).toBeVisible();
     await signIn(guest.request);
     expect((await guest.request.delete(path,{headers})).status()).toBe(404);
     page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Withdraw post'}).click();
     await expect(page.getByText('Post withdrawn.')).toBeVisible();
     expect((await guest.request.get(path)).status()).toBe(404);
   }
   const accounts=await (await admin.request.get('/api/admin/accounts')).json();
   const record=accounts.items.find(x=>x.address===seller);
   expect((await admin.request.post('/api/admin/accounts',{headers:adminHeaders,data:{...record,suspended:true}})).status()).toBe(200);
   expect((await page.request.get('/api/account/receipts')).status()).toBe(401);
   expect((await page.request.get('/api/admin/receipts?address='+seller)).status()).toBe(403);
   expect((await admin.request.get('/api/admin/receipts?address='+seller)).status()).toBe(200);
 }finally{await guest.close();await admin.close()}
});
