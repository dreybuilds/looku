import {test,expect} from '@playwright/test';
const item='https://www.ikojn.com/products/ayla-knit-top-in-plum-lilac?variant=49069166723307';
test('save a shared product, track its own target offline and reopen the exact retailer variant',async({page,context})=>{
 await page.goto('/app?'+new URLSearchParams({share_text:'See this top '+item,share_title:'Ayla Knit Top'}));
 await expect(page.getByLabel('Product link')).toHaveValue(item);
 await expect(page.getByLabel('Item name')).toHaveValue('Ayla Knit Top');
 await page.getByLabel('Target price').fill('2500');await page.getByLabel('Size or colour note').fill('Plum');
 await page.getByRole('button',{name:'Save item',exact:true}).click();
 const card=page.getByRole('article').filter({hasText:'Ayla Knit Top'});
 await expect(card.getByRole('link',{name:'View at store'})).toHaveAttribute('href',item);
 await expect(card.getByRole('button',{name:'Log savings'})).toHaveCount(0);
 await expect(card).toContainText(/Target price.*2,500/);
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}))});
 await context.setOffline(true);await page.reload();await expect(card).toContainText(/Target price.*2,500/);
 await card.getByRole('button',{name:'Edit item'}).click();
 await page.getByLabel('Target price').fill('2600');await page.getByRole('button',{name:'Save changes'}).click();
 await expect(card).toContainText(/Target price.*2,600/);
 await page.goto('/app?'+new URLSearchParams({share_url:item}));await expect(page.getByText(/Already saved/)).toBeVisible();
 await expect(page.getByRole('article')).toHaveCount(1);
});
test('review from a desktop bookmark uses product metadata and cannot auto-save',async({page,context,baseURL})=>{
 await page.goto('/app#wishlist');await page.getByText('Save while browsing',{exact:true}).click();
 const bookmark=await page.getByRole('link',{name:'Save to looku'}).getAttribute('href');
 await context.route('https://shop.example/**',r=>r.fulfill({contentType:'text/html',body:'<title>Top</title><meta property="og:title" content="Purple top"><meta property="product:price:amount" content="35.50"><meta property="product:price:currency" content="USD">'}));
 await page.goto('https://shop.example/product?variant=123');
 const opened=context.waitForEvent('page');
 await page.evaluate(code=>{const a=document.createElement('a');a.href=code;document.body.append(a);a.click()},bookmark);
 const draft=await opened;await expect(draft.getByLabel('Item name')).toHaveValue('Purple top');
 await expect(draft.getByLabel('Target price')).toHaveValue('35.50');
 await expect(draft.getByLabel('Wishlist currency',{exact:true})).toHaveValue('USD');
 await expect(draft.getByRole('article')).toHaveCount(0);
});
test('paste-only save works without a price and unsafe schemes cannot be opened',async({page})=>{
 await page.route('**/api/product-preview',r=>r.fulfill({json:{}}));
 await page.goto('/app#wardrobe');await page.getByRole('link',{name:'Wishlist',exact:true}).click();
 await page.getByLabel('Product link').fill('javascript:alert(1)');await page.getByRole('button',{name:'Save item',exact:true}).click();await expect(page.getByRole('article')).toHaveCount(0);
 await page.getByLabel('Product link').fill(item);await page.getByRole('button',{name:'Save item',exact:true}).click();
 await expect(page.getByRole('article')).toContainText('Add a target');await expect(page.getByRole('link',{name:'View at store'})).toHaveAttribute('href',item);
});

test('pasted links fill product details and retain a small local thumbnail after reload',async({page})=>{
 const sample=await page.request.get('/sample1.webp');
 const photo='data:image/webp;base64,'+(await sample.body()).toString('base64');
 await page.route('**/api/product-preview',r=>r.fulfill({json:{title:'Cropped jacket',variant:'M · Plum',price:'3500',currency:'KES',photo}}));
 await page.goto('/app#wishlist');
 await page.getByLabel('Product link').fill(item);
 await expect(page.getByLabel('Item name')).toHaveValue('Cropped jacket');
 await expect(page.getByLabel('Target price')).toHaveValue('3500');
 await expect(page.getByAltText('Product thumbnail')).toBeVisible();
 await page.getByLabel('Item name').fill('My plum jacket');
 await page.getByRole('button',{name:'Save item',exact:true}).click();
 await expect(page.getByRole('heading',{name:'My plum jacket'})).toBeVisible();
 await page.reload();
 const thumbnail=page.getByRole('article').getByRole('img',{name:'My plum jacket'});
 await expect(thumbnail).toHaveAttribute('src',/^data:image\/webp;base64,/);
 expect(await thumbnail.evaluate(async img=>{await img.decode();return Math.max(img.naturalWidth,img.naturalHeight)})).toBeLessThanOrEqual(320);
});

test('wallet and MiniSend funding count only finalized Base holdings',async({page,context})=>{
 const receive='0x1111111111111111111111111111111111111111',payer='0x2222222222222222222222222222222222222222';
 await page.addInitScript(({receive,payer})=>{
   window.sender=receive;window.ethereum={request:async({method,params})=>{
     if(method==='eth_requestAccounts')return [window.sender];
     if(method==='eth_chainId')return '0x2105';
     if(method==='wallet_switchEthereumChain')return null;
     if(method==='eth_sendTransaction'){window.submitted=params[0];return '0x'+'a'.repeat(64)}
     throw Error(method);
   }};
 },{receive,payer});
 let balance=0n;
 await context.route('https://mainnet.base.org/**',r=>{
   const data=r.request().postDataJSON();expect(data.method).toBe('eth_call');expect(data.params[0].data.endsWith(receive.slice(2))).toBe(true);
   return r.fulfill({json:{jsonrpc:'2.0',id:1,result:'0x'+balance.toString(16).padStart(64,'0')}});
 });
 await page.goto('/app?'+new URLSearchParams({share_url:item,share_title:'Funding test'}));
 await page.getByRole('button',{name:'Save item',exact:true}).click();
 await page.getByText('Fund this item',{exact:true}).click();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Choose receiving wallet'}).click();
 await expect(page.getByRole('link',{name:/M-Pesa via MiniSend/})).toHaveAttribute('href','https://app.minisend.xyz/');
 await page.evaluate(payer=>{window.sender=payer},payer);
 await page.getByLabel('Transfer amount (USDC)').fill('2.5');
 await page.getByRole('button',{name:'Review transfer in wallet'}).click();
 await expect(page.getByText(/Transfer submitted/)).toBeVisible();
 expect(await page.evaluate(()=>window.submitted.data)).toBe('0xa9059cbb'+receive.slice(2).padStart(64,'0')+(2500000).toString(16).padStart(64,'0'));
 const check=page.getByRole('button',{name:'Check confirmed funds'});
 await check.click();await expect(page.getByText(/Confirmed wallet balance: 0 USDC/)).toBeVisible();
 balance=2500000n;await check.click();await expect(page.getByText(/Confirmed wallet balance: 2.5 USDC/)).toBeVisible();
});
