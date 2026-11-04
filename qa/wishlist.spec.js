import {test,expect} from '@playwright/test';
const item='https://www.ikojn.com/products/ayla-knit-top-in-plum-lilac?variant=49069166723307';
test('save a shared product, track its own target offline and reopen the exact retailer variant',async({page,context})=>{
 await page.goto('/?'+new URLSearchParams({share_text:'See this top '+item,share_title:'Ayla Knit Top'}));
 await expect(page.getByLabel('Product link')).toHaveValue(item);
 await expect(page.getByLabel('Item name')).toHaveValue('Ayla Knit Top');
 await page.getByLabel('Target price').fill('2500');await page.getByLabel('Size or colour note').fill('Plum');
 await page.getByRole('button',{name:'Save item',exact:true}).click();
 const card=page.getByRole('article').filter({hasText:'Ayla Knit Top'});
 await expect(card.getByRole('link',{name:'View at store'})).toHaveAttribute('href',item);
 await card.getByLabel('Amount set aside').fill('500');await card.getByRole('button',{name:'Log savings'}).click();
 await expect(card).toContainText(/2,000 to go/);
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}))});
 await context.setOffline(true);await page.reload();await expect(card).toContainText(/2,000 to go/);
 await card.getByRole('button',{name:'Edit item'}).click();await expect(page.getByLabel('Wishlist currency',{exact:true})).toBeDisabled();
 await page.getByLabel('Target price').fill('2600');await page.getByRole('button',{name:'Save changes'}).click();
 await expect(card).toContainText(/2,100 to go/);
 await page.goto('/?'+new URLSearchParams({share_url:item}));await expect(page.getByText(/Already saved/)).toBeVisible();
 await expect(page.getByRole('article')).toHaveCount(1);
});
test('review from a desktop bookmark uses product metadata and cannot auto-save',async({page,context,baseURL})=>{
 await page.goto('/#wishlist');await page.getByText('Save while browsing',{exact:true}).click();
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
 await page.goto('/#wardrobe');await page.getByRole('link',{name:'Wishlist',exact:true}).click();
 await page.getByLabel('Product link').fill('javascript:alert(1)');await page.getByRole('button',{name:'Save item',exact:true}).click();await expect(page.getByRole('article')).toHaveCount(0);
 await page.getByLabel('Product link').fill(item);await page.getByRole('button',{name:'Save item',exact:true}).click();
 await expect(page.getByRole('article')).toContainText('Add a target');await expect(page.getByRole('link',{name:'View at store'})).toHaveAttribute('href',item);
});
