import {test,expect} from '@playwright/test';

test('email sign-up preserves a draft and authorizes closet posts without a wallet',async({page,request,baseURL})=>{
 const token=await (await request.get('/qa-privy-token')).text();
 const otherToken=await (await request.get('/qa-privy-token')).text();
 const profileHeaders={Origin:baseURL,'X-Looku-Action':'community',Authorization:'Bearer '+token};
 const handles={Instagram:'wardrobe.test',TikTok:'private.test'};
 expect((await request.post('/api/community/profile',{headers:profileHeaders,data:{handles}})).status()).toBe(200);
 expect((await request.get('/api/community/profile')).status()).toBe(401);
 expect((await (await request.get('/api/community/profile',{headers:{Authorization:'Bearer '+otherToken}})).json()).handles).toEqual({});
 await page.route('**/privy.js',r=>r.fulfill({contentType:'text/javascript',body:
   'export async function sendCode(){};export async function verifyCode(){};export async function logout(){};export async function accessToken(){return '+JSON.stringify(token)+'}'}));
 await page.goto('/#stylist');
 await page.getByRole('button',{name:'Save outfit'}).click();
 await page.getByRole('link',{name:'View saved outfits'}).click();
 await page.getByRole('button',{name:'Publish look'}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Public title').fill('Email account look');
 await dialog.getByText('Sign up or log in with email').click();
 await dialog.getByLabel('Email address').fill('closet@example.test');
 await dialog.getByRole('button',{name:'Send code'}).click();
 await dialog.getByLabel('Six-digit code').fill('123456');
 await dialog.getByRole('button',{name:'Verify code and continue'}).click();
 await expect(dialog.getByText('Signed in with email.',{exact:false})).toBeVisible();
 await dialog.getByLabel('Instagram @wardrobe.test').check();
 await dialog.getByRole('button',{name:'Publish look'}).click();
 await expect(page.locator('.community-post h2')).toHaveText('Email account look');
 const path='/api/'+page.url().split('#')[1],headers={Origin:baseURL,'X-Looku-Action':'community',Authorization:'Bearer '+token};
 await expect(page.getByRole('link',{name:'Instagram @wardrobe.test'})).toHaveAttribute('href','https://www.instagram.com/wardrobe.test');
 expect((await (await request.get(path)).json()).tags).toEqual({Instagram:'wardrobe.test'});
 await page.getByRole('link',{name:'Account',exact:true}).click();
 await page.getByText('Account details · social accounts').click();
 await page.getByLabel('Instagram username').fill('@new.handle');
 await page.getByRole('button',{name:'Save social accounts'}).click();
 await expect(page.getByText('Social accounts saved.')).toBeVisible();
 expect((await (await request.get('/api/community/profile',{headers:profileHeaders})).json()).handles.Instagram).toBe('new.handle');
 expect((await request.delete(path,{headers:{...headers,Authorization:'Bearer '+otherToken}})).status()).toBe(404);
 expect((await request.get('/api/community/session',{headers:{Authorization:'Bearer '+token+'bad'}})).status()).toBe(401);
 for(const kind of ['sale','donate']){
   const data={sourceId:crypto.randomUUID(),title:'Email closet piece',email:'closet@example.test',price:300,pieces:[{name:'Linen shirt'}]};
   const posted=await request.post('/api/community/'+kind,{headers,data});expect(posted.status()).toBe(201);
   const url='/api/community/'+kind+'/'+(await posted.json()).id;
   expect((await (await request.get(url,{headers})).json()).status).toBe('pending');
   expect((await request.get(url)).status()).toBe(404);
   expect((await request.delete(url,{headers})).status()).toBe(200);
 }
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.getByRole('button',{name:'Withdraw post'})).toHaveCount(0);
 expect((await request.delete(path,{headers})).status()).toBe(200);
});

test('private sale and donation links work for guests and expire on withdrawal',async({page,request,baseURL})=>{
 const token=await (await request.get('/qa-privy-token')).text();
 const headers={Authorization:'Bearer '+token,Origin:baseURL,'X-Looku-Action':'community'};
 for(const kind of ['sale','donate']){
   const path='/api/community/'+kind;
   const data={visibility:'private',sourceId:crypto.randomUUID(),title:'Family listing '+crypto.randomUUID(),pieces:[{name:'Linen shirt'}],email:'family@example.test',price:300};
   const posted=await request.post(path,{headers,data});
   expect(posted.status()).toBe(201);
   const {id,shareKey}=await posted.json();
   const item=path+'/'+id, shared={headers:{'X-Looku-Share':shareKey}};
   expect((await request.get(item)).status()).toBe(404);
   const feed=await (await request.get(path)).json();
   expect(JSON.stringify(feed)).not.toContain(data.title);
   await page.goto('/app#community/'+kind+'/'+id+'/'+shareKey);
   await expect(page.getByRole('heading',{name:data.title})).toBeVisible();
   await expect(page.getByRole('link',{name:/Contact (seller|donor)/})).toHaveAttribute('href','mailto:family@example.test');
   expect((await request.delete(item,{headers})).status()).toBe(200);
   expect((await request.get(item,shared)).status()).toBe(404);
   const again=await request.post(path,{headers,data});
   expect((await again.json()).shareKey).not.toBe(shareKey);
   expect((await request.get(item,shared)).status()).toBe(404);
   await request.delete(item,{headers});
 }
});
