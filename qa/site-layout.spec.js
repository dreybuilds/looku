import {test,expect} from '@playwright/test';

const appRoutes=['welcome','studio','wardrobe','stylist','bookings','community','community/sale','community/donate','wallet','wishlist','shops','support','account','merchant','boutique/looku/cropped-jacket'];
async function layout(page){
 await expect(page.locator('h1')).toHaveCount(1);
 await expect(page.locator('h1')).toBeVisible();
 const sizes=await page.evaluate(()=>({
  overflow:document.documentElement.scrollWidth>innerWidth,
  fonts:[document.body,...document.querySelectorAll('h1,h2,button,input,textarea')].map(n=>getComputedStyle(n).fontFamily),
  title:parseFloat(getComputedStyle(document.querySelector('h1')).fontSize),
  headings:[...document.querySelectorAll('main h2')].map(n=>parseFloat(getComputedStyle(n).fontSize)),
  fields:[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(n=>n.getBoundingClientRect().height&& !n.closest('dialog:not([open])')).map(n=>({width:n.getBoundingClientRect().width,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right}))
 }));
 for(const font of sizes.fonts)expect(font).toContain('monospace');
 expect(sizes.overflow).toBe(false);expect(sizes.title).toBeLessThanOrEqual(48);
 for(const size of sizes.headings)expect(size).toBeLessThanOrEqual(42);
 for(const field of sizes.fields){expect(field.left).toBeGreaterThanOrEqual(0);expect(field.right).toBeLessThanOrEqual(page.viewportSize().width+1)}
}

test('every app page follows shared layout and remains usable on narrow screens',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const route of appRoutes){
  await page.goto('/app#'+route);
  await expect(page.locator('main')).toHaveAttribute('data-page',route.split('/')[0]);
  if(route==='bookings')await expect(page.getByRole('button',{name:'Sign in with email to book',exact:true})).toBeVisible();
  if(route==='merchant')await expect(page.getByRole('button',{name:'Sign in with email to manage a store',exact:true})).toBeVisible();
  if(route==='support')await expect(page.getByRole('heading',{name:'Contact support',exact:true})).toBeVisible();
  await layout(page);
  await page.screenshot({path:'/private/tmp/looku-layout/'+info.project.name+'/'+route.replaceAll('/','-')+'.png',fullPage:true});
 }
 expect(errors).toEqual([]);
});

test('all admin sections have navigation, bounded content and consistent spacing',async({browser,baseURL},info)=>{
 const context=await browser.newContext({baseURL,viewport:info.project.use.viewport,extraHTTPHeaders:{'oai-authenticated-user-email':'nzauaudrey@gmail.com'}});
 const page=await context.newPage();
 try{
  await page.goto('/owner.html');
  const nav=page.getByRole('navigation',{name:'Workspace sections'});
  await expect(nav).toBeVisible();
  const sections=['Dashboard','Earnings & profit','App features','Bookings','Reports','Support requests','Closet sales','Donations','Merchant stores','Affiliates','Partner programs','Accounts'];
  for(const name of sections){
   await nav.getByRole('button',{name,exact:true}).click();
   await expect(page.locator('.ui-workspace-view').getByRole('heading',{name,exact:true,level:2})).toBeVisible();
   await expect(nav.getByRole('button',{name,exact:true})).toBeEnabled();
   await expect(nav.getByRole('button',{name,exact:true})).toHaveAttribute('aria-current','page');
   await layout(page);
   expect(await page.locator('.ui-workspace-view').evaluate(node=>parseFloat(getComputedStyle(node).gap))).toBeGreaterThanOrEqual(20);
   await page.screenshot({path:'/private/tmp/looku-layout/'+info.project.name+'/admin-'+name.toLowerCase().replaceAll(' ','-')+'.png',fullPage:true});
  }
 }finally{await context.close()}
});

test('public pages use shared spacing without losing their own identity',async({page},info)=>{
 for(const [path,name,bodyClass] of [['/','landing','looku-editorial'],['/privacy-policy','privacy','ui-document'],['/store/qa-unavailable','storefront','storefront'],['/design-system.html','components','looku-ui'],['/pinterest-board.html','pinterest-embed','looku-embed']]){
  await page.goto(path);
  await expect(page.locator('body')).toHaveClass(new RegExp(bodyClass));
  await expect(page.locator('link[href="/ui.css"]')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  if(name!=='pinterest-embed')await expect(page.locator('h1')).toHaveCount(1);
  await page.screenshot({path:'/private/tmp/looku-layout/'+info.project.name+'/'+name+'.png',fullPage:true});
 }
});
