import {test,expect} from '@playwright/test';

test('merchants own stores, approved stores publish immediately, and suspension hides products',async({page,browser,baseURL},info)=>{
  const token=await (await page.request.get('/qa-privy-token')).text();
  await page.route('**/privy.js',route=>route.fulfill({contentType:'text/javascript',body:'export async function accessToken(){return '+JSON.stringify(token)+'}'}));
  await page.goto('/app#merchant');
  await page.evaluate(()=>localStorage.setItem('looku.privy-session','1'));await page.reload();
  const slug='samaiahs-'+crypto.randomUUID().slice(0,8),name='Samaiah’s Closet '+slug;
  await page.getByLabel('Store name',{exact:true}).fill(name);
  await page.getByLabel('Store address',{exact:true}).fill(slug);
  await page.getByLabel('About your store').fill('Thoughtful finds and gently worn favourites.');
  await page.getByLabel('Public contact email').fill('merchant@example.org');
  await page.getByLabel('Store logo',{exact:true}).setInputFiles('../dist/icon-192.png');
  await expect(page.getByRole('img',{name:name+' logo'})).toBeVisible();
  await page.getByLabel('Store banner',{exact:true}).setInputFiles('../dist/orchid-detail.webp');
  await expect(page.getByRole('img',{name:name+' banner'})).toBeVisible();
  const cropPanel=page.locator('.banner-crop-editor');
  const setCrop=async(label,value)=>page.getByRole('slider',{name:label,exact:true}).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}))},value);
  await expect(cropPanel).toBeVisible();
  await expect(page.getByRole('slider',{name:'Zoom',exact:true})).toHaveValue('100');
  await setCrop('Zoom',150);
  await page.getByRole('slider',{name:'Horizontal position'}).focus();
  await page.getByRole('slider',{name:'Horizontal position'}).press('Home');
  await page.getByRole('slider',{name:'Horizontal position'}).press('ArrowRight');
  await expect(page.getByRole('slider',{name:'Horizontal position'})).toHaveValue('1');
  await setCrop('Horizontal position',25);await setCrop('Vertical position',30);
  await page.getByRole('button',{name:'Mobile crop',exact:true}).click();
  await expect(page.getByRole('slider',{name:'Zoom',exact:true})).toHaveValue('100');
  await setCrop('Zoom',200);
  const stage=page.locator('.banner-crop-stage');await stage.scrollIntoViewIfNeeded();
  const box=await stage.boundingBox();
  const start={x:box.x+box.width/2,y:box.y+box.height/2};
  if(info.project.name==='phone'){
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x-20,y:start.y-15}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  }else{
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x-20,start.y-15,{steps:5});await page.mouse.up();
  }
  expect(Number(await page.getByRole('slider',{name:'Horizontal position'}).inputValue())).toBeGreaterThan(50);
  expect(Number(await page.getByRole('slider',{name:'Vertical position'}).inputValue())).toBeGreaterThan(50);
  await page.getByRole('button',{name:'Reset this crop'}).click();
  await expect(page.getByRole('slider',{name:'Zoom',exact:true})).toHaveValue('100');
  await setCrop('Zoom',200);await setCrop('Horizontal position',75);await setCrop('Vertical position',65);
  await page.getByRole('button',{name:'Desktop crop',exact:true}).click();
  await expect(page.getByRole('slider',{name:'Zoom',exact:true})).toHaveValue('150');
  await expect(page.getByRole('slider',{name:'Horizontal position'})).toHaveValue('25');
  const crops={desktop:{x:25,y:30,zoom:1.5},mobile:{x:75,y:65,zoom:2}};
  for(const [device,ratio] of [['Desktop',3],['Mobile',16/9]]){
    await page.getByRole('button',{name:device+' crop',exact:true}).click();
    const preview=await stage.evaluate(n=>({ratio:n.clientWidth/n.clientHeight,position:getComputedStyle(n.querySelector('img')).objectPosition}));
    expect(preview.ratio).toBeCloseTo(ratio,1);expect(preview.position).toBe(device==='Desktop'?'25% 30%':'75% 65%');
  }
  await cropPanel.screenshot({path:'/private/tmp/looku-banner-crop-'+info.project.name+'.png'});
  await page.getByLabel('Store background',{exact:true}).setInputFiles('../dist/sample1.webp');
  await expect(page.getByText('Background ready. Save your store to apply it.')).toBeVisible();
  await expect(page.getByLabel('Store branding preview')).toHaveClass(/has-store-background/);
  const colours={primary:'#00334f',background:'#fcf8f2',surface:'#e6eef2'};
  for(const [label,value] of [['Brand colour',colours.primary],['Page background',colours.background],['Feature background',colours.surface]])await page.getByLabel(label,{exact:true}).evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))},value);
  await page.screenshot({path:'/private/tmp/looku-store-editor-'+info.project.name+'.png',fullPage:true});
  await page.getByRole('button',{name:'Submit store for approval'}).click();
  await expect(page).toHaveURL(new RegExp('#merchant/'+slug+'$'));
  await expect(page.getByText('Store status · pending',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Publish product'})).toHaveCount(0);
  const guest=await browser.newContext({baseURL}),other=await browser.newContext({baseURL});
  const admin=await browser.newContext({baseURL,extraHTTPHeaders:{'oai-authenticated-user-email':'nzauaudrey@gmail.com'}});
  const ownHeaders={Authorization:'Bearer '+token,Origin:baseURL,'X-Looku-Action':'merchant-store'};
  try{
    expect((await guest.request.get('/api/merchant-stores/'+slug)).status()).toBe(404);
    const original=await (await page.request.get('/api/merchant-stores/'+slug,{headers:ownHeaders})).json();
    expect(original.bannerCrop).toEqual(crops);
    expect(original.banner).toMatch(/^data:image\/webp;base64,/);expect(original.background).toMatch(/^data:image\/webp;base64,/);
    expect(original.theme).toEqual(colours);expect(original.logo).toMatch(/^data:image\/webp;base64,/);
    for(const invalid of [{bannerCrop:null},{bannerCrop:{desktop:crops.desktop}},{bannerCrop:{...crops,mobile:{x:101,y:50,zoom:1}}},{bannerCrop:{...crops,mobile:{x:50,y:50,zoom:0.5}}},{bannerCrop:{...crops,mobile:{x:'50',y:50,zoom:1}}},{banner:'https://example.org/image.png'},{background:'data:image/svg+xml,<svg/>'},{banner:'data:image/webp;base64,'+'a'.repeat(160001)},{theme:{...colours,primary:'red;display:none'}},{logo:'data:image/svg+xml,<svg onload="alert(1)"/>'},{logo:'data:image/webp;base64,'+'a'.repeat(80001)}]){
      expect((await page.request.post('/api/merchant-stores/'+slug,{headers:ownHeaders,data:{...original,...invalid}})).status()).toBe(400);
    }
    expect((await page.request.post('/api/merchant-stores/'+slug,{headers:ownHeaders,data:{name:original.name,description:original.description,contact:original.contact,revision:original.revision}})).status()).toBe(200);
    const kept=await (await page.request.get('/api/merchant-stores/'+slug,{headers:ownHeaders})).json();expect(kept.bannerCrop).toEqual(crops);expect(kept.banner).toBe(original.banner);expect(kept.background).toBe(original.background);expect(kept.logo).toBe(original.logo);expect(kept.theme).toEqual(colours);
    expect((await page.request.post('/api/merchant-stores/'+slug,{headers:ownHeaders,data:original})).status()).toBe(409);
    const otherToken=await (await other.request.get('/qa-privy-token')).text();
    const otherHeaders={...ownHeaders,Authorization:'Bearer '+otherToken};
    const draft={slug,name:'Copy',description:'',contact:'other@example.org'};
    expect((await other.request.post('/api/merchant-stores',{headers:otherHeaders,data:draft})).status()).toBe(409);
    expect((await other.request.post('/api/merchant-stores/'+slug,{headers:otherHeaders,data:draft})).status()).toBe(404);
    expect((await (await other.request.get('/api/merchant-stores/mine',{headers:otherHeaders})).json()).items).toEqual([]);
    expect((await page.request.post('/api/merchant-stores',{headers:ownHeaders,data:{...draft,slug:'admin'}})).status()).toBe(400);
    expect((await page.request.get('/api/admin/merchant-stores',{headers:ownHeaders})).status()).toBe(403);
    const adminHeaders={Origin:baseURL,'X-Looku-Action':'admin'};
    expect((await (await admin.request.get('/api/admin/access')).json()).state).toBe('admin');
    const ownerPage=await admin.newPage();await ownerPage.goto('/owner.html');
    await ownerPage.getByRole('button',{name:'Manage merchant stores'}).click();
    let card=ownerPage.getByRole('article').filter({has:ownerPage.getByRole('heading',{name,exact:true})});
    await card.getByRole('button',{name:'Approve store'}).click();
    await expect(card).toContainText('approved');
    async function setFeature(id,enabled){
      const flags=await (await admin.request.get('/api/admin/features')).json();
      expect((await admin.request.post('/api/admin/features',{headers:adminHeaders,data:{id,enabled,revision:flags.revision}})).status()).toBe(200);
    }
    try{
      await setFeature('shops',false);
      const directory=await guest.newPage();await directory.goto('/app#shops');
      await expect(directory.getByRole('link',{name:'Stores',exact:true})).toBeVisible();
      await expect(directory.getByRole('link',{name:'Visit '+name,exact:true})).toBeVisible();
      await expect(directory.getByRole('heading',{name:'Shop retailer websites'})).toHaveCount(0);
      await setFeature('storefronts',false);
      expect((await guest.request.get('/api/merchant-stores/'+slug)).status()).toBe(404);
      expect((await page.request.post('/api/merchant-stores/'+slug+'/products',{headers:ownHeaders,data:{}})).status()).toBe(403);
      await directory.reload();await expect(directory.getByRole('heading',{name:'Feature paused'})).toBeVisible();
      await directory.close();
    }finally{await setFeature('shops',true);await setFeature('storefronts',true)}
    await page.reload();
    await expect(page.getByRole('heading',{name:'Store details',exact:true})).toBeVisible();
    await expect(page.getByRole('slider',{name:'Zoom',exact:true})).toHaveValue('150');
    await page.getByRole('button',{name:'Mobile crop',exact:true}).click();
    await expect(page.getByRole('slider',{name:'Zoom',exact:true})).toHaveValue('200');
    const editorLayout=await page.locator('.merchant-details').evaluate(node=>({
      width:node.getBoundingClientRect().width,
      headingSize:parseFloat(getComputedStyle(node.querySelector('h2')).fontSize),
      formGap:node.querySelector('form').getBoundingClientRect().top-node.querySelector('small').getBoundingClientRect().bottom
    }));
    expect(editorLayout.width).toBeLessThanOrEqual(768);
    expect(editorLayout.headingSize).toBeLessThanOrEqual(28);
    expect(editorLayout.formGap).toBeGreaterThanOrEqual(12);
    await page.screenshot({path:'/private/tmp/looku-layout/'+info.project.name+'/merchant-editor.png',fullPage:true});
    await page.getByText('Add a product',{exact:true}).click();
    await page.getByLabel('Product name').fill('Lilac occasion jacket');
    await page.getByLabel(/Add photos/).setInputFiles(['../dist/orchid-detail.webp','../dist/orchid-portrait.webp','../dist/sample1.webp']);
    await expect(page.getByRole('img',{name:/photo 3$/})).toBeVisible();
    await page.getByRole('button',{name:'Remove photo 3'}).click();await expect(page.getByRole('img',{name:/photo 3$/})).toHaveCount(0);
    await page.locator('.product-photos').screenshot({path:'/private/tmp/looku-layout/'+info.project.name+'/product-photos.png'});
    await page.getByLabel('Price in KSh').fill('2500');
    await page.getByLabel('Sizes available').fill('S, M, L, M');
    await page.getByLabel('Colours available').fill('Lilac, Black');
    await page.getByLabel('Description',{exact:true}).fill('Gently worn. Nairobi collection.');
    await page.getByRole('button',{name:'Publish product',exact:true}).click();
    await expect(page.getByText(/Lilac occasion jacket · available · (KES|Ksh)\s*2,500/)).toBeVisible();
    const customer=await guest.newPage();await customer.goto('/store/'+slug);
    await expect(customer.getByRole('heading',{name,exact:true})).toBeVisible();
    await expect(customer.getByRole('heading',{name:'Lilac occasion jacket'})).toBeVisible();
    await expect(customer.getByRole('button',{name:/^Show photo \d of 2$/})).toHaveCount(2);
    await customer.getByRole('button',{name:'Show photo 2 of 2'}).click();
    await expect(customer.getByRole('button',{name:'Show photo 2 of 2'})).toHaveAttribute('aria-pressed','true');
    await expect(customer.getByLabel('Size')).toHaveText(/S\s*M\s*L/);
    await customer.getByLabel('Size').selectOption('L');await customer.getByLabel('Colour').selectOption('Black');
    await expect(customer.getByRole('link',{name:'Ask about this piece'})).toHaveAttribute('href',/Size%3A%20L.*Colour%3A%20Black/);
    await customer.locator('.merchant-product').first().screenshot({path:'/private/tmp/looku-layout/'+info.project.name+'/product-card.png'});
    await expect(customer.getByRole('img',{name:name+' logo'})).toBeVisible();
    await expect(customer.getByRole('img',{name:name+' banner'})).toBeVisible();
    await expect(customer.locator('body')).toHaveClass(/has-store-background/);
    for(const [width,device,ratio] of [[1280,'desktop',3],[360,'mobile',16/9]]){
      await customer.setViewportSize({width,height:800});
      const rendered=await customer.locator('.merchant-banner-frame').evaluate(n=>({ratio:n.clientWidth/n.clientHeight,position:getComputedStyle(n.querySelector('img')).objectPosition,transform:getComputedStyle(n.querySelector('img')).transform}));
      expect(rendered.ratio).toBeCloseTo(ratio,1);
      expect(rendered.position).toBe(crops[device].x+'% '+crops[device].y+'%');
      expect(rendered.transform).toBe('matrix('+crops[device].zoom+', 0, 0, '+crops[device].zoom+', 0, 0)');
    }
    await customer.setViewportSize(info.project.use.viewport);
    expect(await customer.locator('body').evaluate(n=>getComputedStyle(n).backgroundImage)).toContain('data:image/webp');
    expect(await customer.locator('h1').evaluate(n=>getComputedStyle(n).fontFamily)).toContain('monospace');
    await expect(customer.locator('body')).toHaveCSS('background-color','rgb(252, 248, 242)');
    await expect(customer.getByRole('link',{name:'Ask about this piece'})).toHaveCSS('background-color','rgb(0, 51, 79)');
    await expect(customer.locator('header .merchant-brand')).toHaveText(name);
    await expect(customer.locator('header').getByRole('link',{name:'Create your store'})).toHaveCount(0);
    await expect(customer.locator('header').getByRole('link',{name:'Shop the collection'})).toHaveAttribute('href','#collection');
    await expect(customer.getByRole('link',{name:'Email '+name,exact:true})).toHaveAttribute('href','mailto:merchant@example.org');
    await expect(customer.getByRole('link',{name:'Ask about this piece'})).toHaveAttribute('href',/mailto:merchant@example.org/);
    expect(await customer.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await customer.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
    const accessibility=await customer.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
    expect(accessibility.violations.map(item=>item.id)).toEqual([]);
    await customer.screenshot({path:'/private/tmp/looku-merchant-store-'+info.project.name+'.png',fullPage:true});
    await page.getByLabel('Store banner',{exact:true}).setInputFiles('../dist/sample2.webp');
    await expect(page.getByText('Banner ready. Save your store to apply it.')).toBeVisible();
    await expect(page.getByRole('slider',{name:'Zoom',exact:true})).toHaveValue('100');
    await page.getByLabel('Store background',{exact:true}).setInputFiles('../dist/sample3.webp');
    await expect(page.getByText('Background ready. Save your store to apply it.')).toBeVisible();
    await page.getByLabel('Store logo',{exact:true}).setInputFiles('../dist/sample1.webp');
    await expect(page.getByText('Logo ready. Save your store to apply it.')).toBeVisible();
    await page.getByRole('button',{name:'Save store details'}).click();
    await expect(page.getByLabel('Store logo',{exact:true})).toHaveValue('');
    const replacement=await (await page.request.get('/api/merchant-stores/'+slug,{headers:ownHeaders})).json();expect(replacement.logo).not.toBe(original.logo);expect(replacement.banner).not.toBe(original.banner);expect(replacement.bannerCrop).toEqual({desktop:{x:50,y:50,zoom:1},mobile:{x:50,y:50,zoom:1}});expect(replacement.background).not.toBe(original.background);
    await customer.reload();await expect(customer.getByRole('img',{name:name+' banner'})).toHaveAttribute('src',replacement.banner);
    await page.getByRole('button',{name:'Remove banner',exact:true}).click();
    await expect(page.locator('.banner-crop-editor')).toBeHidden();
    await page.getByRole('button',{name:'Remove background',exact:true}).click();
    await page.getByRole('button',{name:'Remove logo',exact:true}).click();
    await page.getByRole('button',{name:'Reset colours',exact:true}).click();
    const saved=page.waitForResponse(r=>r.url().endsWith('/api/merchant-stores/'+slug)&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Save store details'}).click();expect((await saved).status()).toBe(200);
    await expect(page.getByRole('button',{name:'Remove logo',exact:true})).toBeHidden();
    await customer.reload();await expect(customer.getByRole('img',{name:name+' logo'})).toHaveCount(0);
    await expect(customer.getByRole('img',{name:name+' banner'})).toHaveCount(0);
    await expect(customer.locator('body')).not.toHaveClass(/has-store-background/);
    await expect(customer.locator('body')).toHaveCSS('background-color','rgb(255, 254, 251)');
    const publicStore=await (await guest.request.get('/api/merchant-stores/'+slug)).json();
    expect(publicStore).not.toHaveProperty('owner');expect(publicStore).not.toHaveProperty('revision');
    const products=(await (await page.request.get('/api/merchant-stores/'+slug+'/products',{headers:ownHeaders})).json()).items;
    const product=products[0];
    expect(product.photos).toHaveLength(2);expect(product.sizes).toEqual(['S','M','L']);expect(product.colours).toEqual(['Lilac','Black']);
    for(const bad of [{photos:Array(6).fill(product.photo)},{photos:[]},{sizes:['x'.repeat(25)]},{colours:'Lilac'}])
      expect((await page.request.post('/api/merchant-stores/'+slug+'/products',{headers:ownHeaders,data:{...product,...bad}})).status()).toBe(400);
    expect((await other.request.post('/api/merchant-stores/'+slug+'/products',{headers:otherHeaders,data:product})).status()).toBe(404);
    expect((await page.request.post('/api/merchant-stores/'+slug+'/products',{headers:{...ownHeaders,Origin:'https://wrong.example'},data:product})).status()).toBe(403);
    const detail=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Lilac occasion jacket'})});
    await detail.locator('summary').click();
    await detail.getByLabel('Availability').selectOption('sold-out');
    await detail.getByRole('button',{name:'Save product'}).click();
    await expect(page.getByText(/Lilac occasion jacket · sold-out/)).toBeVisible();
    expect((await page.request.post('/api/merchant-stores/'+slug+'/products',{headers:ownHeaders,data:product})).status()).toBe(409);
    await customer.reload();await expect(customer.getByRole('heading',{name:'Lilac occasion jacket'})).toHaveCount(0);
    const updated=(await (await page.request.get('/api/merchant-stores/'+slug+'/products',{headers:ownHeaders})).json()).items[0];
    expect((await page.request.post('/api/merchant-stores/'+slug+'/products',{headers:ownHeaders,data:{...updated,status:'available'}})).status()).toBe(200);
    await ownerPage.reload();await ownerPage.getByRole('button',{name:'Manage merchant stores'}).click();
    await card.getByRole('button',{name:'Suspend store'}).click();await expect(card).toContainText('suspended');
    expect((await guest.request.get('/api/merchant-stores/'+slug+'/products')).status()).toBe(404);
    const latest=(await (await page.request.get('/api/merchant-stores/'+slug+'/products',{headers:ownHeaders})).json()).items[0];
    expect((await page.request.post('/api/merchant-stores/'+slug+'/products',{headers:ownHeaders,data:latest})).status()).toBe(403);
    await customer.reload();await expect(customer.getByRole('heading',{name:'Store unavailable'})).toBeVisible();
  }finally{await guest.close();await other.close();await admin.close()}
});
