import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});

async function checkLayout(page,name,info){
 await expect(page.getByRole('heading',{level:1})).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
 const violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>v.id+': '+v.nodes.map(n=>n.target.join(' ')).join(',')));
 expect(violations).toEqual([]);
 await page.screenshot({path:'/private/tmp/looku-'+name+'-refresh-'+info.project.name+'.png',fullPage:true});
}
test('Account sections replace the wallet tab and preserve legacy wallet destinations',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/app#account');
 await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Wallet',exact:true})).toHaveCount(0);
 await page.getByText('My sizes and delivery details',{exact:true}).click();
 await page.getByLabel('Top size',{exact:true}).fill('M');
 await page.getByRole('button',{name:'Save shopping profile'}).click();
 await expect(page.getByText('Shopping profile saved on this device.')).toBeVisible();
 await checkLayout(page,'account',info);
 await page.getByRole('navigation',{name:'Account sections'}).getByRole('link',{name:'Device & storage'}).click();
 await page.getByText('Install looku & manage storage',{exact:true}).click();
 await expect(page.getByRole('button',{name:'Back up online',exact:true})).toBeVisible();
 await checkLayout(page,'storage',info);
 for(const destination of ['', '/support','/bookings','/merchant','/admin']){
   await page.goto('/app#wallet'+destination);
   await expect(page).toHaveURL(new RegExp('#account/wallet'+destination+'$'));
   await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Account',exact:true})).toHaveAttribute('aria-current','page');
   await expect(page.locator('.wallet-panel[open]')).toHaveCount(destination?1:0);
 }
 await page.goto('/app#account/wallet');
 await expect(page.getByRole('heading',{name:'Purchase receipts',exact:true})).toBeVisible();
 await checkLayout(page,'wallet-guest',info);
 await page.goto('/app#support');
 await expect(page.getByRole('heading',{name:'Contact support',exact:true})).toBeVisible();
 await page.getByText('Where can I find a payment receipt?',{exact:true}).click();
 await checkLayout(page,'support',info);
 expect(errors).toEqual([]);
});

test('funded wishlist and wallet controls fit narrow screens without losing item actions',async({page},info)=>{
 const address='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
 await page.route('**/api/stellar-wallet**',r=>r.fulfill({json:{exists:true,address,kind:'privy',network:'mainnet',currency:'USDC',active:true,trustline:true,balance:'250000000',budgets:{},pending:null}}));
 const photo='data:image/webp;base64,'+(await (await page.request.get('/sample1.webp')).body()).toString('base64');
 await page.route('**/api/product-preview',r=>r.fulfill({json:{title:'A favourite lilac jacket with a longer product name',price:'2500',currency:'KES',photo}}));
 await page.goto('/app#wishlist');
 await page.getByLabel('Product link',{exact:true}).fill('https://shop.example/jacket');
 await expect(page.getByLabel('Item name',{exact:true})).toHaveValue('A favourite lilac jacket with a longer product name');
 await expect(page.getByAltText('Product thumbnail')).toBeVisible();
 await page.getByRole('button',{name:'Save item',exact:true}).click();
 await expect(page.getByRole('article').getByRole('heading',{level:2})).toBeVisible();
 await expect(page.getByLabel('Item budget (USDC)')).toBeVisible();
 await checkLayout(page,'wishlist',info);
 await page.getByRole('link',{name:'Wallet & payments',exact:true}).click();
 await expect(page.locator('.stellar-account')).toContainText(address);
 await page.getByText('Send funds',{exact:true}).click();
 await expect(page.getByLabel('Recipient Stellar address')).toBeVisible();
 await checkLayout(page,'wallet',info);
 if(info.project.name==='phone'){
  await page.setViewportSize({width:320,height:740});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
