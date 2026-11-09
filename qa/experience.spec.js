import {test,expect} from '@playwright/test';

const modeButton=(page,name)=>page.getByRole('group',{name:'Looku experience',exact:true}).getByRole('button',{name,exact:true});
async function fits(page){
 await page.evaluate(()=>document.fonts.ready);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
}
test('landing explains both audiences and carries Business through email sign-in',async({page,request},info)=>{
 const token=await (await request.get('/qa-privy-token')).text();
 await page.route('**/privy.js',route=>route.fulfill({contentType:'text/javascript',body:'export async function sendCode(){};export async function verifyCode(){};export async function accessToken(){return '+JSON.stringify(token)+'}'}));
 await page.goto('/');
 await expect(modeButton(page,'Personal')).toHaveAttribute('aria-pressed','true');
 for(const heading of ['Build your wardrobe','Find a fresh combination','Plan your next purchase','Share, sell or donate','Bring in a professional','Make it your everyday companion'])await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
 await fits(page);await page.screenshot({path:'/private/tmp/looku-personal-landing-'+info.project.name+'.png',fullPage:true});
 await modeButton(page,'Business').click();
 await expect(page.getByRole('heading',{level:1})).toContainText('Your own storefront');
 await expect(page.getByRole('heading',{name:'Build your wardrobe'})).toBeHidden();
 await expect(page.getByRole('heading',{name:'Build your brand identity'})).toBeVisible();
 await expect(page.getByText('Once approved, publish products', {exact:false})).toBeVisible();
 await fits(page);await page.screenshot({path:'/private/tmp/looku-business-landing-'+info.project.name+'.png',fullPage:true});
 await page.reload();await expect(modeButton(page,'Business')).toHaveAttribute('aria-pressed','true');
 await page.getByRole('link',{name:'Open business'}).first().click();
 await expect(page.getByRole('heading',{name:'Enter your business workspace.'})).toBeVisible();
 await page.getByText('Continue with email',{exact:true}).click();
 await page.getByLabel('Email address').fill('business@example.test');await page.getByRole('button',{name:'Send code'}).click();
 await page.getByLabel('Six-digit code').fill('123456');await page.getByRole('button',{name:'Verify code and continue'}).click();
 await expect(page).toHaveURL(/#business$/);
 await expect(page.getByRole('heading',{name:'Your business workspace'})).toBeVisible();
 await page.goto('/app');await expect(page).toHaveURL(/#business$/);
});

test('app switching preserves wardrobe, supports keyboard and follows deep links',async({page},info)=>{
 await page.goto('/app#wardrobe');
 await expect(page.locator('.card h3')).toHaveCount(4);
 const names=await page.locator('.card h3').allTextContents();
 await modeButton(page,'Business').focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'Your business workspace'})).toBeVisible();
 const nav=page.getByRole('navigation',{name:'Main navigation'});
 await expect(nav.getByRole('link',{name:'My stores',exact:true})).toBeVisible();
 await expect(nav.getByRole('link',{name:'Wardrobe',exact:true})).toBeHidden();
 await nav.getByRole('link',{name:'Account',exact:true}).click();await expect(modeButton(page,'Business')).toHaveAttribute('aria-pressed','true');
 await nav.getByRole('link',{name:'Overview',exact:true}).click();await fits(page);
 await page.screenshot({path:'/private/tmp/looku-business-app-'+info.project.name+'.png',fullPage:true});
 await nav.getByRole('link',{name:'My stores',exact:true}).click();
 await expect(page.getByRole('button',{name:'Sign in with email to manage a store'})).toBeVisible();
 await page.reload();await expect(modeButton(page,'Business')).toHaveAttribute('aria-pressed','true');
 await modeButton(page,'Business').focus();await page.keyboard.press('ArrowLeft');
 await expect(page).toHaveURL(/#studio$/);await expect(modeButton(page,'Personal')).toHaveAttribute('aria-pressed','true');
 await nav.getByRole('link',{name:'Wardrobe',exact:true}).click();await expect(page.locator('.card h3')).toHaveText(names);
 await page.goto('/app?mode=personal#merchant');await expect(modeButton(page,'Business')).toHaveAttribute('aria-pressed','true');
 await page.goto('/app?mode=business#stylist');await expect(modeButton(page,'Personal')).toHaveAttribute('aria-pressed','true');
 await page.goBack();await expect(modeButton(page,'Business')).toHaveAttribute('aria-pressed','true');
});

test('mode choice works with unavailable storage and offline navigation',async({page,context})=>{
 await page.addInitScript(()=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(key){if(key==='looku.experience.v1')throw new Error('Storage unavailable');return get.call(this,key)};Storage.prototype.setItem=function(key,value){if(key==='looku.experience.v1')throw new Error('Storage unavailable');return set.call(this,key,value)}});
 await page.goto('/?mode=business');await expect(modeButton(page,'Business')).toHaveAttribute('aria-pressed','true');
 await modeButton(page,'Personal').click();await expect(modeButton(page,'Personal')).toHaveAttribute('aria-pressed','true');
 await page.goto('/app?mode=business');await page.getByRole('link',{name:'Explore business tools as a guest'}).click();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}))});
 await context.setOffline(true);await page.reload();
 await expect(page.getByRole('heading',{name:'Your business workspace'})).toBeVisible();
 await modeButton(page,'Personal').click();await expect(page.getByRole('heading',{name:'Your studio',exact:true})).toBeVisible();
});
