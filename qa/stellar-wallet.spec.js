import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});
test.setTimeout(30000);

test('one primary wallet survives page changes and releases deleted item budgets',async({page})=>{
  const address='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  let exists=false,created=0;const budgets={mainnet:{},testnet:{}};
  await page.route('**/api/stellar-wallet**',async route=>{
    const request=route.request(),url=new URL(request.url()),network=url.searchParams.get('network')||'mainnet';
    if(request.method()==='POST'){
      const data=request.postDataJSON();
      if(url.pathname.endsWith('/budget')){
        const units=String(Math.round(Number(data.amount)*1e7));
        if(units==='0')delete budgets[network][data.item];else budgets[network][data.item]=units;
      }else{if(!exists)created++;exists=true}
    }
    await route.fulfill({json:exists?{exists,address,kind:'privy',network,currency:network==='mainnet'?'USDC':'test XLM',active:true,trustline:true,balance:'100000000',budgets:budgets[network],pending:null}:{exists:false}});
  });
  await page.route('**/api/product-preview',r=>r.fulfill({json:{}}));
  await page.goto('/app#wishlist');
  await expect(page.locator('.stellar-account')).toContainText(address);
  for(const [name,url] of [['First piece','https://shop.example/one'],['Second piece','https://shop.example/two']]){
    if(name==='Second piece')await page.getByText('Save a product link',{exact:true}).click();
    await page.getByLabel('Product link').fill(url);await page.getByLabel('Item name',{exact:true}).fill(name);
    await page.getByRole('button',{name:'Save item',exact:true}).click();
    await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  }
  const first=page.getByRole('article').filter({hasText:'First piece'}),second=page.getByRole('article').filter({hasText:'Second piece'});
  for(const card of [first,second])await expect(card.locator('.stellar-budget')).toContainText(address);
  await first.getByLabel('Item budget (USDC)').fill('3');await first.getByRole('button',{name:'Assign Stellar funds'}).click();
  await expect(first).toContainText('Assigned to this item · 3 USDC');
  await expect(second).toContainText('Assigned to this item · 0 USDC');
  await page.reload();await expect(first).toContainText('Assigned to this item · 3 USDC');
  await page.goto('/app#wallet');await expect(page.locator('.stellar-account')).toContainText(address);
  await page.screenshot({path:'/private/tmp/looku-stellar-'+test.info().project.name+'.png',fullPage:true});
  await page.getByRole('combobox',{name:'Stellar network',exact:true}).selectOption('testnet');
  await expect(page.locator('.stellar-account')).toContainText('test XLM');
  await page.goto('/app#wishlist');await expect(first).toContainText('Assigned to this item · 0 test XLM');
  await page.getByRole('combobox',{name:'Stellar network',exact:true}).selectOption('mainnet');await expect(first).toContainText('Assigned to this item · 3 USDC');
  page.once('dialog',d=>d.accept());await first.getByRole('button',{name:'Remove',exact:true}).click();
  await expect(first).toHaveCount(0);expect(budgets.mainnet).toEqual({});expect(created).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
