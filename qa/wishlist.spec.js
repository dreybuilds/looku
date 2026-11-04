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
 await page.getByLabel('Request from an agent').fill('0.25');
 await page.getByRole('button',{name:'Create x402 funding link'}).click();
 const link=await page.getByLabel('Agent funding link').inputValue();
 const challenge=await page.request.get(link);
 expect(challenge.status()).toBe(402);
 expect((await challenge.json()).accepts[0]).toMatchObject({payTo:receive,amount:'250000',network:'eip155:8453'});
 await page.getByRole('button',{name:'Check incoming contribution'}).click();
 await expect(page.getByText('Waiting for an agent to fund this item.')).toBeVisible();
 await page.evaluate(payer=>{window.sender=payer},payer);
 await page.getByLabel('Transfer amount (USDC)').fill('2.5');
 await page.getByRole('button',{name:'Review transfer in wallet'}).click();
 await expect(page.getByText(/Transfer submitted/)).toBeVisible();
 expect(await page.evaluate(()=>window.submitted.data)).toBe('0xa9059cbb'+receive.slice(2).padStart(64,'0')+(2500000).toString(16).padStart(64,'0'));
 const check=page.getByRole('button',{name:'Check confirmed funds'});
 await check.click();await expect(page.getByText(/Confirmed wallet balance: 0 USDC/)).toBeVisible();
 balance=2500000n;await check.click();await expect(page.getByText(/Confirmed wallet balance: 2.5 USDC/)).toBeVisible();
 await page.getByLabel('Budget for this item').fill('1.5');await page.getByRole('button',{name:'Assign wallet funds'}).click();
 await expect(page.getByText(/Assigned 1.5 USDC/)).toBeVisible();
 await page.goto('/app?'+new URLSearchParams({share_url:'https://example.com/second',share_title:'Second goal'}));
 await page.getByRole('button',{name:'Save item',exact:true}).click();
 const second=page.getByRole('article').filter({hasText:'Second goal'});await second.getByText('Fund this item').click();
 page.once('dialog',d=>d.accept());await second.getByRole('button',{name:/Use wallet/}).click();
 await second.getByLabel('Budget for this item').fill('2');await second.getByRole('button',{name:'Assign wallet funds'}).click();
 await expect(second).toContainText('exceeds the confirmed balance');
 await second.getByLabel('Budget for this item').fill('1');await second.getByRole('button',{name:'Assign wallet funds'}).click();
 await expect(second).toContainText('Assigned 1 USDC');
 balance=1400000n;await second.getByRole('button',{name:'Check confirmed funds'}).click();
 await expect(second).toContainText('Available for this item: 0 USDC');

});

test('merchant x402 authorization is capped, bound to Base USDC and sent only after approval',async({page,context})=>{
 const url='https://merchant.example/look',address='0x'+'3'.repeat(40),payTo='0x'+'4'.repeat(40);
 const token='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',tx='0x'+'5'.repeat(64);
 let amount='2000001',paid=0,signedPayload;
 await page.route('**/api/product-preview',r=>r.fulfill({json:{}}));
 await page.addInitScript(address=>{
   window.ethereum={request:async({method,params})=>{
     if(method==='eth_requestAccounts')return [address];
     if(method==='wallet_switchEthereumChain')return null;
     if(method==='eth_chainId')return '0x2105';
     if(method==='eth_signTypedData_v4'){window.signed=JSON.parse(params[1]);return '0x'+'ab'.repeat(65)}
     throw Error(method);
   }};
 },address);
 await context.route('https://mainnet.base.org/**',r=>{
   const {method,params}=r.request().postDataJSON();
   const result=method==='eth_getBlockByNumber'?{number:'0xff',timestamp:'0xff'}:
   '0x'+(params[0].data.startsWith('0xe94a0102')?'1':(3000000).toString(16)).padStart(64,'0');
   return r.fulfill({json:{jsonrpc:'2.0',id:1,result}});
 });
 const encoded=data=>Buffer.from(JSON.stringify(data)).toString('base64');
 await context.route(url,r=>{
   const signature=r.request().headers()['payment-signature'];
   if(signature){paid++;signedPayload=JSON.parse(Buffer.from(signature,'base64'));return r.fulfill({headers:{'access-control-expose-headers':'payment-response','payment-response':encoded({success:true,network:'eip155:8453',transaction:tx})},body:'received'})}
   return r.fulfill({status:402,headers:{'access-control-expose-headers':'payment-required','payment-required':encoded({x402Version:2,resource:{url},accepts:[{scheme:'exact',network:'eip155:8453',asset:token,amount,payTo,maxTimeoutSeconds:60,extra:{name:'USD Coin',version:'2'}}]})},body:''});
 });
 await page.goto('/app?'+new URLSearchParams({share_url:url,share_title:'Agent look'}));
 await page.getByRole('button',{name:'Save item',exact:true}).click();await page.getByText('Fund this item',{exact:true}).click();
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Choose receiving wallet'}).click();
 await page.getByLabel('Budget for this item').fill('2');await page.getByRole('button',{name:'Assign wallet funds'}).click();
 const checkout=page.getByRole('button',{name:'Review x402 merchant payment'});
 await checkout.click();await expect(page.getByText(/No exact Base USDC offer fits/)).toBeVisible();expect(paid).toBe(0);
 amount='1500000';await checkout.click();await expect(page.getByRole('link',{name:/View payment transaction/})).toHaveAttribute('href','https://basescan.org/tx/'+tx);
 expect(paid).toBe(1);expect(signedPayload.resource.url).toBe(url);expect(signedPayload.payload.authorization).toMatchObject({from:address,to:payTo,value:amount});
 expect(await page.evaluate(()=>window.signed.domain)).toEqual({name:'USD Coin',version:'2',chainId:8453,verifyingContract:token});
 await page.getByRole('button',{name:'Verify payment on Base'}).click();
 await expect(page.getByText('Payment authorization used on Base.')).toBeVisible();
 await expect(checkout).toHaveCount(0);expect(paid).toBe(1);
});

test('wallet goals accept a wishlist piece or a product link and keep the exact variant',async({page})=>{
 const second='https://shop.example/products/linen-shirt?variant=blue';
 await page.route('**/api/product-preview',route=>route.fulfill({json:route.request().postData()===second
   ? {title:'Linen shirt',price:'55',currency:'USD'} : {title:'Ayla knit top',price:'2500',currency:'KES'}}));
 await page.goto('/app#wishlist');
 await page.getByLabel('Product link').fill(item);
 await expect(page.getByLabel('Target price')).toHaveValue('2500');
 await page.getByRole('button',{name:'Save item',exact:true}).click();
 await expect(page.getByRole('article')).toContainText('Ayla knit top');
 await page.goto('/app#wallet');
 const open=()=>page.locator('summary').filter({hasText:'Save for a piece'}).click();
 await open();
 const source=page.getByLabel('Choose a piece');
 const target=page.getByLabel('Target in');
 await source.selectOption({label:'Ayla knit top'});
 await expect(target).toHaveValue('2500.00');
 await page.getByRole('button',{name:'Save goal'}).click();
 await expect(page.getByRole('link',{name:'View product'})).toHaveAttribute('href',item);
 await source.selectOption('link');
 await page.getByLabel('Product link').fill(second);
 await expect(page.getByLabel('What are you saving for?')).toHaveValue('Linen shirt');
 await expect(target).toHaveValue('');
 await target.fill('6000');
 await page.getByRole('button',{name:'Save goal'}).click();
 await page.reload();
 await open();
 await expect(page.getByRole('link',{name:'View product'})).toHaveAttribute('href',second);
 await expect(target).toHaveValue('6000');
});

test('returning to the wishlist automatically credits finalized M-Pesa and x402 receipts once',async({page,context})=>{
 const address='0x'+'1'.repeat(40),transaction='0x'+'2'.repeat(64);
 let finalized=false,agentPaid=false,order;
 await page.addInitScript(address=>{window.ethereum={request:async()=>[address]}},address);
 await context.route('**/api/product-preview',r=>r.fulfill({json:{}}));
 await context.route('**/api/wishlist-mpesa',r=>r.fulfill({json:{enabled:true}}));
 await context.route('**/api/wishlist-mpesa/*',r=>{
   if(r.request().method()==='POST'){order=r.request().postDataJSON();return r.fulfill({json:{status:'pending'}})}
   return r.fulfill({json:{status:'released',usdc:'1.5',transaction,address}});
 });
 await context.route('**/api/wishlist-funding/**',r=>r.fulfill(agentPaid?{json:{status:'paid',finalized:true,transaction:'0x'+'3'.repeat(64)}}:{status:402,json:{}}));
 await context.route('https://mainnet.base.org/**',r=>{
   const method=r.request().postDataJSON().method;
   const result=method==='eth_getBlockByNumber'?{number:finalized?'0xb':'0x9'}:method==='eth_getTransactionReceipt'?{
     transactionHash:transaction,status:'0x1',blockNumber:'0xa',logs:[{address:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',topics:[
       '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef','0x0','0x'+address.slice(2).padStart(64,'0')],data:'0x16e360'}]
   }:'0x'+(10000000).toString(16).padStart(64,'0');
   return r.fulfill({json:{result}});
 });
 await page.goto('/app?'+new URLSearchParams({share_url:item,share_title:'Auto funded'}));
 await page.getByRole('button',{name:'Save item',exact:true}).click();
 await page.getByText('Fund this item',{exact:true}).click();page.once('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Choose receiving wallet'}).click();
 await page.getByLabel('Pay with M-Pesa (KES)').fill('200');await page.getByLabel('M-Pesa phone number').fill('0700000000');
 await page.getByRole('button',{name:'Request M-Pesa prompt for this item'}).click();
 await expect(page.getByText(/Waiting for M-Pesa confirmation/)).toBeVisible();
 expect(order).toMatchObject({kes:200,address});
 await page.getByLabel('Request from an agent').fill('2');
 await page.getByRole('button',{name:'Create x402 funding link'}).click();
 await expect(page.getByLabel('Agent funding link')).toBeVisible();
 await page.reload();await expect(page.getByText('Item budget · 0 USDC')).toBeVisible();
 finalized=true;agentPaid=true;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByText('Item budget · 3.5 USDC')).toBeVisible({timeout:40000});
 await page.reload();await expect(page.getByText('Item budget · 3.5 USDC')).toBeVisible();
});
