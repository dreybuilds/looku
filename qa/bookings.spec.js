import {test,expect} from '@playwright/test';

test('owner switches control listings and booking requests while customers retain private booking history',async({page,browser,baseURL})=>{
  const token=await (await page.request.get('/qa-privy-token')).text();
  await page.route('**/privy.js',route=>route.fulfill({contentType:'text/javascript',body:'export async function accessToken(){return '+JSON.stringify(token)+'}'}));
  await page.goto('/app#studio');
  await page.evaluate(()=>localStorage.setItem('looku.privy-session','1'));
  await page.getByRole('navigation').getByRole('link',{name:'Book a stylist'}).click();
  await page.getByLabel('Service',{exact:true}).selectOption('Makeup artist');
  const date=new Date(Date.now()+7*86400000).toISOString().slice(0,16);
  await page.getByLabel('Preferred date and time').fill(date);
  await page.getByLabel('Contact email').fill('booking@example.org');
  await page.getByRole('button',{name:'Request booking'}).click();
  await expect(page.getByRole('heading',{name:'Makeup artist · Requested'})).toBeVisible();
  const other=await (await page.request.get('/qa-privy-token')).text();
  expect((await (await page.request.get('/api/bookings',{headers:{Authorization:'Bearer '+other}})).json()).items).toEqual([]);
  expect((await page.request.get('/api/admin/bookings')).status()).toBe(403);
  expect((await page.request.post('/api/admin/features',{data:{id:'donate',enabled:false}})).status()).toBe(403);
  const owner=await browser.newContext({baseURL,extraHTTPHeaders:{'oai-authenticated-user-email':'nzauaudrey@gmail.com'}});
  expect((await (await owner.request.get('/api/account')).json()).address).toBeNull();
  try{
    const admin=await owner.newPage();await admin.goto('/owner.html');
    expect((await page.request.get('/api/admin/partner-programs')).status()).toBe(403);
    await admin.getByRole('button',{name:'Partner programs',exact:true}).click();
    await admin.getByLabel('Find a partner program').fill('VaaBay');
    await expect(admin.getByRole('link',{name:'Open program'})).toHaveAttribute('href','https://www.vaabay.co.ke/affiliate');
    await admin.getByRole('button',{name:'Bookings',exact:true}).click();
    await admin.getByRole('article').filter({has:admin.getByRole('heading',{name:'Makeup artist · Requested'})}).first().getByRole('button',{name:'Confirm booking'}).click();
    await page.reload();await expect(page.getByRole('heading',{name:'Makeup artist · Confirmed'})).toBeVisible();
    await admin.getByRole('button',{name:'App features',exact:true}).click();
    for(const name of ['Closet donations','Stylist and beauty booking requests']){
      const control=admin.getByRole('switch',{name});await control.click();await expect(control).not.toBeChecked();
    }
    await page.reload();await expect(page.getByText(/New booking requests are paused/)).toBeVisible();
    await expect(page.getByRole('heading',{name:'Makeup artist · Confirmed'})).toBeVisible();
    expect((await page.request.post('/api/bookings',{data:{}})).status()).toBe(403);
    expect((await page.request.get('/api/community/donate')).status()).toBe(403);
    expect((await page.request.get('/api/community/sale')).status()).toBe(200);
    await page.goto('/app#community/donate');await expect(page.getByRole('heading',{name:'Feature paused'})).toBeVisible();
    for(const name of ['Closet donations','Stylist and beauty booking requests']){
      const control=admin.getByRole('switch',{name});await control.click();await expect(control).toBeChecked();
    }
    await page.reload();await expect(page.getByRole('link',{name:'Donations',exact:true})).toBeVisible();
  }finally{await owner.close()}
});
