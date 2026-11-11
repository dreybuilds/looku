import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const photo=fileURLToPath(new URL('../dist/orchid-detail.webp',import.meta.url));
const nav=(page,name)=>page.getByRole('navigation').getByRole('link',{name,exact:true}).click();
const pause=ms=>new Promise(r=>setTimeout(r,ms));

test('demo walkthrough',async({page},info)=>{
 const dir=fileURLToPath(new URL('../demo/screenshots/'+info.project.name+'/',import.meta.url));
 let n=0;
 const shot=async(name,opts={})=>{await pause(700);await page.screenshot({path:dir+String(++n).padStart(2,'0')+'-'+name+'.png',...opts})};

 await page.goto('https://lookuwear.xyz/');
 await expect(page.getByRole('heading',{level:1})).toBeVisible();
 await shot('landing-live');

 await page.goto('/app#studio');
 await expect(page.getByRole('heading',{name:'The Orchid Edit.'})).toBeVisible();
 await shot('wardrobe');

 await page.getByRole('button',{name:'Add a piece',exact:true}).first().click();
 const add=page.getByRole('dialog',{name:'Add a piece'});
 await add.getByLabel('Clothing photo').setInputFiles(photo);
 await add.getByLabel('Piece name').fill('Lilac linen shirt');
 await shot('add-piece');
 await add.getByRole('button',{name:'Add to wardrobe'}).click();
 await expect(add).toBeHidden();

 await nav(page,'Stylist');
 await page.getByLabel('Describe your look').fill('Lilac linen shirt and jeans for brunch, no dress');
 await page.getByRole('button',{name:/Orchid Hour/}).click();
 await shot('stylist-brief');
 await page.getByRole('button',{name:'Build my look'}).click();
 await expect(page.getByRole('heading',{name:'Brunch edit'})).toBeVisible();
 await shot('styled-look',{fullPage:true});
 await page.getByRole('button',{name:'Save outfit'}).click();

 await page.getByRole('button',{name:'Review purchase'}).click();
 const buy=page.getByRole('dialog',{name:'Cropped jacket'});
 await shot('agent-offer');
 await buy.getByLabel('Spending limit').fill('2000');
 await buy.getByRole('button',{name:'Check my limit'}).click();
 await expect(buy.getByRole('status')).toContainText('above your limit');
 await buy.getByRole('status').scrollIntoViewIfNeeded();
 await shot('agent-declines');
 await buy.getByLabel('Spending limit').fill('2600');
 await buy.getByRole('button',{name:'Check my limit'}).click();
 await expect(buy.getByRole('status')).toContainText('fits your limit');
 await buy.getByRole('status').scrollIntoViewIfNeeded();
 await shot('agent-approves');
 await buy.getByRole('button',{name:'Close dialog'}).click();

 await page.getByRole('link',{name:'View saved outfits'}).click().catch(()=>{});
 await shot('saved-outfits');

 await nav(page,'Stores');
 await expect(page.locator('#store-list article').first()).toBeVisible();
 await shot('global-stores');

 await page.evaluate(()=>{location.hash='wallet'});
 await expect(page.getByRole('heading',{name:'Purchase receipts',exact:true})).toBeVisible();
 await shot('wallet-receipts');
 try{
  await page.locator('.wallet-panel > summary').filter({hasText:'Check balance'}).click({timeout:5000});
  await page.getByRole('combobox',{name:'Network',exact:true}).selectOption('base',{timeout:5000});
  await page.locator('.wallet-panel > summary').filter({hasText:'Fund with MiniSend'}).click({timeout:5000});
  await shot('fund-minisend');
 }catch{await shot('wallet-funding')}
 await nav(page,'Wishlist');
 await shot('wishlist');

 await nav(page,'Community');
 await shot('community');

 await page.goto('https://stellar.expert/explorer/testnet/tx/4f6fb6e2771c57828048ee6ebafd57150b0fa24fb47f5efb57719f30b1af8e99').catch(()=>{});
 await page.getByText(/successful|Transaction/i).first().waitFor({timeout:30000}).catch(()=>{});await pause(4000);
 await shot('ledger-purchase');
 await page.goto('https://stellar.expert/explorer/testnet/tx/f758f8ffa69bf2912d9819f46edb06daece16dff4023e5068a2320e3fed160e7').catch(()=>{});
 await page.getByText(/successful|Transaction/i).first().waitFor({timeout:30000}).catch(()=>{});await pause(4000);
 await shot('ledger-commission');
});
