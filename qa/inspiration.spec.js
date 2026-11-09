import {test,expect} from '@playwright/test';
import {boards} from '../dist/inspiration-data.js';
import {matchingBoards} from '../dist/inspiration.js';

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
