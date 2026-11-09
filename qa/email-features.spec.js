import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});

test('online styling directs guests to email and accepts a verified email session without a wallet cookie',async({page,request,baseURL,context})=>{
 const token=await (await request.get('/qa-privy-token')).text();
 const headers={Origin:baseURL,'X-Looku-Action':'wallet-account'};
 const guest=await request.post('/api/stylist/gpt',{headers,data:{prompt:'Lilac for brunch'}});
 expect(guest.status()).toBe(401);expect((await guest.json()).error).toContain('Sign in with email');
 expect((await request.post('/api/stylist/gpt',{headers:{...headers,Authorization:'Bearer '+token+'bad'},data:{prompt:'Lilac for brunch'}})).status()).toBe(401);
 await page.route('**/privy.js',r=>r.fulfill({contentType:'text/javascript',body:'export async function accessToken(){return '+JSON.stringify(token)+'}'}));
 await page.goto('/app#stylist');await page.getByText('Online styling advice',{exact:true}).click();
 await expect(page.getByRole('link',{name:'sign in with email',exact:true})).toHaveAttribute('href','#account');
 await page.evaluate(()=>localStorage.setItem('looku.privy-session','1'));
 await page.getByLabel('Describe your look').fill('A lilac top and denim for brunch');
 const sent=page.waitForRequest(r=>r.url().endsWith('/api/stylist/gpt'));
 await page.getByRole('button',{name:'Get styling advice'}).click();
 expect((await sent).headers().authorization).toBe('Bearer '+token);
 await expect(page.getByText('Pair lilac with relaxed denim.')).toBeVisible();
 expect((await context.cookies()).some(c=>c.name==='__Host-looku-session')).toBe(false);
});

test('email backups remain private to the same verified account',async({request,baseURL})=>{
 const token=await (await request.get('/qa-privy-token')).text(),other=await (await request.get('/qa-privy-token')).text();
 const headers={Origin:baseURL,'X-Looku-Action':'wardrobe-backup',Authorization:'Bearer '+token};
 const data=Buffer.concat([Buffer.from('LKU1'),Buffer.alloc(64,9)]);
 expect((await request.put('/api/wardrobe-backup',{headers,data})).status()).toBe(204);
 expect(await (await request.get('/api/wardrobe-backup',{headers})).body()).toEqual(data);
 expect((await request.get('/api/wardrobe-backup',{headers:{...headers,Authorization:'Bearer '+other}})).status()).toBe(404);
 expect((await request.get('/api/wardrobe-backup',{headers:{...headers,Authorization:'Bearer '+token+'bad'}})).status()).toBe(401);
 expect((await request.delete('/api/wardrobe-backup',{headers})).status()).toBe(204);
});
