import {test,expect} from '@playwright/test';

test('featured Pinterest looks link to their originals and members can choose a Pin to import',async({page})=>{
 await page.route('**/api/pinterest/connection',route=>route.fulfill({json:{connected:true}}));
 await page.route('**/api/pinterest/pins',route=>route.fulfill({json:{items:[{id:'100',title:'Weekend denim'}]}}));
 const importedId='a'.repeat(64);
 await page.route('**/api/pinterest/import',route=>{
   expect(route.request().postDataJSON()).toEqual({pinId:'100'});return route.fulfill({json:{id:importedId}});
 });
 await page.route('**/api/community/look/'+importedId,route=>route.fulfill({json:{id:importedId,kind:'look',title:'Weekend denim',pinterestId:'100',mine:true,pieces:[],status:'published'}}));
 await page.goto('/app#community/look');
 const original=page.getByRole('link',{name:'View original Pin'});
 await expect(original).toHaveCount(2);
 await expect(original.first()).toHaveAttribute('href',/7388786884333608/);
 await expect(page.getByText('Pinterest account and imports',{exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'Account',exact:true}).click();
 await page.getByText('Pinterest account and imports',{exact:true}).click();
 await page.getByRole('button',{name:'Choose a Pin to import'}).click();
 await page.getByLabel('Your published image Pins').selectOption('100');
 await page.getByRole('button',{name:'Publish selected Pin to Lookuwear'}).click();
 await expect(page.getByRole('heading',{name:'Weekend denim'})).toBeVisible();
 await expect(original).toHaveAttribute('href','https://www.pinterest.com/pin/100/');
 await expect(page.getByRole('button',{name:'Post to Pinterest'})).toHaveCount(0);
});

test('posting a Lookuwear look requires an explicit board choice and submit',async({page})=>{
 const lookId='b'.repeat(64);
 await page.route('**/api/community/look/'+lookId,route=>route.fulfill({json:{id:lookId,kind:'look',title:'Weekend blue',mine:true,status:'published',pieces:[{name:'Top',photo:'/sample1.webp'}]}}));
 await page.route('**/api/pinterest/connection',route=>route.fulfill({json:{connected:true}}));
 await page.route('**/api/pinterest/boards',route=>route.fulfill({json:{items:[{id:'111',title:'Outfits'},{id:'222',title:'Weekend'}]}}));
 let posted=false;
 await page.route('**/api/pinterest/publish',route=>{
   expect(route.request().postDataJSON()).toEqual({boardId:'222',lookId});posted=true;return route.fulfill({json:{id:'5678'}});
 });
 await page.goto('/app#community/look/'+lookId);
 await page.getByRole('button',{name:'Post to Pinterest'}).click();
 await page.getByLabel('Destination board').selectOption('222');
 expect(posted).toBe(false);
 await page.getByRole('button',{name:'Post look to selected board'}).click();
 await expect(page.getByRole('link',{name:'Open Pin on Pinterest'})).toHaveAttribute('href','https://www.pinterest.com/pin/5678/');
});
