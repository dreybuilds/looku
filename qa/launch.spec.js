import {test,expect} from '@playwright/test';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {StrKey} from '../payments/node_modules/@stellar/stellar-sdk/lib/esm/index.js';

test.use({serviceWorkers:'block'});

test('landing opens email entry, verifies the code and remembers the session',async({page,request})=>{
 const token=await (await request.get('/qa-privy-token')).text();
 await page.route('**/privy.js',route=>route.fulfill({contentType:'text/javascript',body:
   'export async function sendCode(){};export async function verifyCode(){};export async function accessToken(){return '+JSON.stringify(token)+'}'}));
 await page.goto('/');
 await expect(page.getByRole('heading',{level:1})).toContainText('already own');
 await page.getByRole('link',{name:'Launch app'}).first().click();
 await expect(page).toHaveURL(/\/app$/);
 await page.getByText('Continue with email',{exact:true}).click();
 await page.getByLabel('Email address').fill('member@example.test');
 await page.getByRole('button',{name:'Send code'}).click();
 await page.getByLabel('Six-digit code').fill('123456');
 await page.getByRole('button',{name:'Verify code and continue'}).click();
 await expect(page).toHaveURL(/#studio$/);
 await page.goto('/app');
 await expect(page).toHaveURL(/#studio$/);
 await page.goto('/#community');
 await expect(page).toHaveURL(/\/app#community$/);
});

test('Varial entry establishes a verified Stellar session and signs out',async({page})=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const address=StrKey.encodeEd25519PublicKey(publicKey.export({format:'der',type:'spki'}).subarray(-32));
 await page.exposeFunction('walletSign',message=>sign(null,createHash('sha256').update('Stellar Signed Message:\n'+message).digest(),privateKey).toString('base64'));
 await page.route('**/api/payments/client.js',route=>route.fulfill({contentType:'text/javascript',body:
   'export async function freighterAddress(){return '+JSON.stringify(address)+'};export const signFreighterLogin=(address,message)=>window.walletSign(message)'}));
 await page.goto('/app');
 await page.getByText('Use a Stellar wallet',{exact:true}).click();
 await page.getByRole('button',{name:'Continue with Varial'}).click();
 await expect(page).toHaveURL(/#studio$/);
 await page.goto('/app');
 await expect(page).toHaveURL(/#studio$/);
 await page.getByRole('navigation').getByRole('link',{name:'Wallet',exact:true}).click();
 await page.getByRole('button',{name:'Sign out of wallet'}).click();
 await expect(page.getByRole('heading',{name:'Enter your studio.'})).toBeVisible();
});
