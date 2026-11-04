import {test,expect} from '@playwright/test';
import {Keypair} from '../payments/node_modules/@stellar/stellar-sdk/lib/esm/index.js';

test('private support conversation goes through the owner dashboard',async({page,browser,baseURL})=>{
 await page.goto('/#support');
 await page.getByText('Where will I see a support reply?').click();
 await expect(page.getByRole('heading',{name:'Contact support'})).toBeVisible();
 expect((await page.request.get('/api/support')).status()).toBe(401);
 expect((await page.request.get('/api/admin/dashboard')).status()).toBe(403);
 const token=await (await page.request.get('/qa-privy-token')).text();
 await page.route('**/privy.js',route=>route.fulfill({contentType:'text/javascript',body:'export async function accessToken(){return '+JSON.stringify(token)+'}'}));
 await page.evaluate(()=>localStorage.setItem('looku.privy-session','1'));
 await page.reload();
 const subject='Missing receipt '+crypto.randomUUID().slice(0,8);
 await page.getByLabel('Subject').fill(subject);await page.getByLabel('How can we help?').fill('Where can I view my purchase?');
 await page.getByRole('button',{name:'Submit request'}).click();
 await expect(page.getByText(subject+' · Open',{exact:true})).toBeVisible();
 const other=await (await page.request.get('/qa-privy-token')).text();
 expect((await (await page.request.get('/api/support',{headers:{Authorization:'Bearer '+other}})).json()).items).toEqual([]);
 const ticket=(await (await page.request.get('/api/support',{headers:{Authorization:'Bearer '+token}})).json()).items[0];
 expect((await page.request.post('/api/support',{headers:{Authorization:'Bearer '+other,Origin:baseURL,'X-Looku-Action':'support'},data:{id:ticket.id,revision:ticket.revision,message:'Test'}})).status()).toBe(404);
 const owner=await browser.newContext({baseURL,extraHTTPHeaders:{'oai-authenticated-user-email':'nzauaudrey@gmail.com'}});
 try{
   const key=Keypair.fromRawEd25519Seed(Buffer.alloc(32,7)),address=key.publicKey(),headers={Origin:baseURL,'X-Looku-Action':'wallet-account'};
   const challenge=await (await owner.request.post('/api/account/challenge',{headers,data:{address}})).json();
   const signature=Buffer.from(key.sign(Buffer.from(challenge.message))).toString('base64');
   expect((await owner.request.post('/api/account/verify',{headers,data:{address,signature,nonce:challenge.nonce}})).status()).toBe(200);
   if((await (await owner.request.get('/api/admin/access')).json()).state==='enroll')await owner.request.post('/api/admin/enroll',{headers:{Origin:baseURL,'X-Looku-Action':'admin'},data:{address}});
   const admin=await owner.newPage();await admin.goto('/#admin');
   await admin.getByRole('button',{name:'View support requests'}).click();
   const card=admin.locator('details').filter({hasText:subject});await card.locator('summary').click();
   await card.getByLabel('Reply').fill('Open Wallet and choose Purchase receipts.');
   await card.getByLabel('Request status').selectOption('Resolved');await card.getByRole('button',{name:'Save update'}).click();
   await expect(admin.getByText(subject+' · Resolved')).toBeVisible();
   await page.getByRole('button',{name:'Refresh requests'}).click();await page.getByText(subject+' · Resolved').click();
   await expect(page.getByText('Open Wallet and choose Purchase receipts.',{exact:true})).toBeVisible();
 }finally{await owner.close()}
});
