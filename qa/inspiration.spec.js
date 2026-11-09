import {test,expect} from '@playwright/test';
import {boards} from '../dist/inspiration-data.js';
import {matchingBoards,pinIdFromUrl} from '../dist/inspiration.js';

test('thirty board catalog supports clothing, colour, style and audience together',async()=>{
 expect(boards).toHaveLength(30);expect(new Set(boards.map(b=>b.url)).size).toBe(30);
 const result=matchingBoards('black girl',{styles:'Office',clothes:'Dresses',colors:'White',audience:''});
 expect(result.length).toBeGreaterThan(0);
 expect(result.every(b=>b.styles.includes('Office')&&b.clothes.includes('Dresses')&&b.colors.includes('White'))).toBe(true);
 expect(matchingBoards('black man',{audience:'Black men'}).length).toBeGreaterThan(0);
 expect(matchingBoards('nonexistentxyz',{})).toHaveLength(0);
});

test('filter, browse, go back and close Pinterest without leaving the stylist',async({page})=>{
 await page.route('https://assets.pinterest.com/**',route=>route.abort());
 await page.goto('/app#stylist');
 await page.getByText('Find inspiration on Pinterest',{exact:true}).click();
 const launch=page.getByRole('button',{name:'Browse inspiration boards'});await launch.click();
 const dialog=page.getByRole('dialog',{name:'Find your next look'});
 await expect(dialog.getByRole('status')).toHaveText('30 of 30 boards');
 await dialog.getByLabel('Search boards').fill('black girl');
 await dialog.getByRole('combobox',{name:'Style',exact:true}).selectOption('Office');
 await dialog.getByRole('combobox',{name:'Clothing type',exact:true}).selectOption('Dresses');
 await dialog.getByRole('combobox',{name:'Colour',exact:true}).selectOption('White');
 await expect(dialog.getByRole('button',{name:'Browse board'}).first()).toBeVisible();
 await dialog.getByRole('button',{name:'Browse board'}).first().click();
 const frame=page.frameLocator('.inspiration-frame');
 await expect(frame.getByRole('status')).toContainText('Pinterest images could not load');
 await expect(dialog.getByRole('link',{name:'Open this board on Pinterest'})).toHaveAttribute('target','_blank');
 expect(page.url()).toContain('/app#stylist');
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await dialog.getByRole('button',{name:'Back to boards'}).click();
 await expect(dialog.getByLabel('Search boards')).toHaveValue('black girl');
 await dialog.getByRole('button',{name:'Clear filters'}).click();
 await dialog.getByRole('button',{name:'Show more boards'}).click();
 await expect(dialog.locator('.inspiration-card')).toHaveCount(12);
 await dialog.getByLabel('Search boards').fill('nonexistentxyz');
 await expect(dialog.getByText(/No boards match/)).toBeVisible();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(launch).toBeFocused();
});

test('public inspiration search opens matching boards without the owner-only API',async({page})=>{
 const searches=[];page.on('request',request=>{if(request.url().includes('/api/pinterest/search'))searches.push(request.url())});
 await page.goto('/app#stylist');await page.getByText('Find inspiration on Pinterest',{exact:true}).click();
 await page.locator('#pin-search input').fill('olive');await page.locator('#pin-search button').click();
 const dialog=page.getByRole('dialog',{name:'Find your next look'});
 await expect(dialog).toBeVisible();await expect(dialog.getByLabel('Search boards')).toHaveValue('olive');
 await expect(dialog.getByRole('button',{name:'Browse board',exact:true}).first()).toBeVisible();
 expect(searches).toEqual([]);
});

test('choose a Pin, save locally and match real closet pieces without leaving Looku',async({page,context},info)=>{
 await page.route('https://assets.pinterest.com/**',route=>route.fulfill({contentType:'application/javascript',body:`
 const widget=document.querySelector('#widget');
 widget.innerHTML='<span data-pin-href="https://www.pinterest.com/pin/812970170209529652/" style="display:block;width:200px;height:240px;background:#808358">Olive outfit Pin</span>';
 document.addEventListener('click',()=>window.open('https://www.pinterest.com/pin/812970170209529652/','_blank'));
 `}));
 await page.goto('/app#stylist');await page.evaluate(async()=>{const {write}=await import('/model.js');await write('items',[
 {id:'my-red-shirt',name:'Red office shirt',type:'shirt',color:'#ee0000',occasion:'Office'},
 {id:'my-olive-shirt',name:'Olive linen shirt',type:'shirt',color:'#808358',occasion:'Office'},
 {id:'my-trousers',name:'Cream trousers',type:'trousers',color:'#e6dfc6',occasion:'Office'},
 {id:'my-shoes',name:'Brown loafers',type:'loafer',color:'#87634a',occasion:'Office'}]);});await page.reload();
 await page.getByText('Find inspiration on Pinterest',{exact:true}).click();await page.getByRole('button',{name:'Browse inspiration boards'}).click();
 const dialog=page.getByRole('dialog',{name:'Find your next look'});
 await dialog.getByRole('button',{name:'Browse board',exact:true}).first().click();
 await page.evaluate(()=>window.postMessage({type:'looku:choose-pin',url:'https://www.pinterest.com/pin/999999/'},location.origin));
 await expect(dialog.getByRole('heading',{name:'Match this inspiration'})).toHaveCount(0);
 await page.frameLocator('.inspiration-frame').locator('[data-pin-href*="/pin/"]').click();
 await expect(dialog.getByRole('heading',{name:'Match this inspiration'})).toBeVisible();
 await dialog.getByLabel('Reference name').fill('Olive office inspiration');
 await dialog.getByLabel('Colour to match').fill('#808358');
 await dialog.getByLabel('Clothing details').fill('shirt and trousers');
 await dialog.getByRole('combobox',{name:'Occasion',exact:true}).selectOption('Office');
 await page.screenshot({path:'/private/tmp/looku-pin-match-'+info.project.name+'.png',fullPage:true});
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await dialog.getByRole('button',{name:'Save inspiration and build look'}).click();
 await expect(dialog).toHaveCount(0);await expect(page.locator('main article.card').filter({hasText:'Olive linen shirt'})).toBeVisible();
 await expect(page.locator('main article.card').filter({hasText:'Red office shirt'})).toHaveCount(0);
 const reference=await page.evaluate(async()=> (await import('/model.js')).read('inspo',null));
 expect(reference).toMatchObject({pinId:'812970170209529652',title:'Olive office inspiration',color:'#808358',notes:'shirt and trousers',occasion:'Office'});
 expect(reference.photo).toBeUndefined();expect(context.pages()).toHaveLength(1);expect(page.url()).toContain('/app#stylist');
 await page.reload();await expect(page.getByRole('button',{name:'View saved Pinterest inspiration'})).toBeVisible();
 await expect(page.locator('main article.card').filter({hasText:'Olive linen shirt'})).toBeVisible();
 await page.getByRole('button',{name:'View saved Pinterest inspiration'}).click();
 await expect(dialog.getByLabel('Reference name')).toHaveValue('Olive office inspiration');
 await expect(dialog.locator('iframe')).toHaveAttribute('src','/pinterest-board.html?pin=812970170209529652');
});


test('Pin reference links accept Pinterest Pin IDs and reject other destinations',()=>{
 expect(pinIdFromUrl('https://www.pinterest.com/pin/812970170209529652/?share=1')).toBe('812970170209529652');
 for(const url of ['https://evil.test/pin/123456/','javascript:alert(1)','https://pinterest.com.evil.test/pin/123456/','https://www.pinterest.com/some/board/'])expect(pinIdFromUrl(url)).toBeNull();
});

test('a pasted Pin link works when the board widget cannot load',async({page})=>{
 await page.route('https://assets.pinterest.com/**',route=>route.abort());await page.goto('/app#stylist');
 await page.getByText('Find inspiration on Pinterest',{exact:true}).click();await page.getByRole('button',{name:'Browse inspiration boards'}).click();
 const dialog=page.getByRole('dialog',{name:'Find your next look'});await dialog.getByText('Use a Pin link',{exact:true}).click();
 await dialog.getByLabel('Pinterest Pin URL').fill('https://evil.test/pin/123456/');await dialog.getByRole('button',{name:'Preview Pin',exact:true}).click();
 await expect(dialog.getByText('Use a full pinterest.com/pin/ link with a numeric Pin ID.')).toBeVisible();
 await dialog.getByLabel('Pinterest Pin URL').fill('https://www.pinterest.com/pin/812970170209529652/');await dialog.getByRole('button',{name:'Preview Pin',exact:true}).click();
 await expect(dialog.getByRole('heading',{name:'Match this inspiration'})).toBeVisible();
 await expect(page.frameLocator('.inspiration-frame').getByRole('status')).toContainText('Pinterest images could not load');
 await dialog.getByRole('button',{name:'Save inspiration and build look'}).click();
 await expect(page.getByRole('button',{name:'View saved Pinterest inspiration'})).toBeVisible();
});
