import {test,expect} from '@playwright/test';

test('Looku fonts load from the app and remain available offline',async({page,context})=>{
 await page.goto('/app#shops');
 const faces=[['400 16px "DM Sans"','dm-sans-400-normal.ttf'],['600 16px "DM Sans"','dm-sans-600-normal.ttf'],['400 36px "DM Serif Display"','dm-serif-display-400-normal.ttf'],['italic 400 36px "DM Serif Display"','dm-serif-display-400-italic.ttf']];
 for(const [font,file] of faces){
  const response=await page.request.get('/fonts/'+file);
  expect(response.headers()['content-type']).toContain('font/ttf');
  expect((await response.body()).readUInt32BE(0)).toBe(0x00010000);
  expect(await page.evaluate(async font=>(await document.fonts.load(font)).length,font)).toBeGreaterThan(0);
 }
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}))});
 await context.setOffline(true);await page.reload();
 for(const [font] of faces)expect(await page.evaluate(async font=>(await document.fonts.load(font)).length,font)).toBeGreaterThan(0);
});

test('Stores prioritises browsing with shared hierarchy and usable actions',async({page},info)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/app#shops');
 await expect(page.getByRole('link',{name:'Shop VaaBay',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{level:1})).toHaveCount(1);
 await expect(page.getByRole('link',{name:'Create or manage your store'})).toBeVisible();
 const layout=await page.evaluate(()=>({
   overflow:document.documentElement.scrollWidth>innerWidth,
   title:parseFloat(getComputedStyle(document.querySelector('h1')).fontSize),
   sections:[...document.querySelectorAll('main h2')].map(node=>parseFloat(getComputedStyle(node).fontSize)),
   firstCard:document.querySelector('#store-list article').getBoundingClientRect().top,
   actions:[...document.querySelectorAll('.ui-page-header a')].map(node=>node.getBoundingClientRect().height)
 }));
 expect(layout.overflow).toBe(false);expect(layout.title).toBeLessThanOrEqual(42);
 for(const size of layout.sections){expect(size).toBeLessThan(layout.title);expect(size).toBeLessThanOrEqual(28)}
 expect(layout.firstCard).toBeLessThan(info.project.name==='phone'?1150:900);
 for(const height of layout.actions)expect(height).toBeGreaterThanOrEqual(44);
 await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
 const violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(item=>item.id));
 expect(violations).toEqual([]);
 await page.screenshot({path:'/private/tmp/looku-stores-design-'+info.project.name+'.png',fullPage:true});
 await page.getByLabel('Find a store').fill('jewellery');
 await expect(page.locator('#store-list article')).toHaveCount(1);
 await expect(page.getByRole('link',{name:'Shop SOKO'})).toHaveAttribute('href','https://shopsoko.com/');
 await page.getByLabel('Find a store').fill('no matching store');
 await expect(page.getByText('No stores match your search. Try another name or category.')).toBeVisible();
 await page.getByRole('link',{name:'Create or manage your store'}).click();
 await expect(page.getByRole('heading',{name:'Your stores',exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});

test('component gallery and admin share the same readable scale',async({page},info)=>{
 await page.goto('/design-system.html');
 await expect(page.getByRole('heading',{name:'A little more room to browse'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 const safety=await page.evaluate(async()=>{
   const {contentCard,actionLink}=await import('/ui.js');
   const card=contentCard({title:'<img src=x onerror=alert(1)>',description:'Text, not markup.'});
   let rejected=false;try{actionLink({label:'Unsafe',href:'javascript:alert(1)'})}catch{rejected=true}
   return {images:card.querySelectorAll('img').length,text:card.querySelector('h3').textContent,rejected};
 });
 expect(safety).toEqual({images:0,text:'<img src=x onerror=alert(1)>',rejected:true});
 await page.screenshot({path:'/private/tmp/looku-component-gallery-'+info.project.name+'.png',fullPage:true});
 await page.setExtraHTTPHeaders({'oai-authenticated-user-email':'nzauaudrey@gmail.com'});
 await page.goto('/owner.html');
 await expect(page.getByRole('button',{name:'Manage merchant stores'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Admin workspace'})).toBeVisible();
 expect(await page.locator('h1').evaluate(node=>parseFloat(getComputedStyle(node).fontSize))).toBeLessThanOrEqual(42);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await page.screenshot({path:'/private/tmp/looku-admin-design-'+info.project.name+'.png',fullPage:true});
});
