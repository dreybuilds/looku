import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const photo=fileURLToPath(new URL('../dist/orchid-detail.webp',import.meta.url));

test('searchable choices preserve the upload draft and save a new clothing type',async({page})=>{
  await page.goto('/app#wardrobe');
  await page.getByRole('button',{name:/Add a piece/}).click();
  const form=page.getByRole('dialog',{name:'Add a piece',exact:true});
  await form.getByLabel('Piece name').fill('Pleated lilac skirt');
  await form.getByLabel('Clothing photo').setInputFiles(photo);
  await form.getByRole('button',{name:'Clothing type: Top / shirt',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Choose a clothing type',exact:true});
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('button',{name:'Top / shirt',exact:true})).toBeFocused();
  await picker.getByLabel('Find a choice').fill('nonexistent');
  await expect(picker.getByRole('status')).toContainText('No matches');
  await picker.getByLabel('Find a choice').fill('skirt');
  await picker.getByRole('button',{name:'Skirt',exact:true}).click();
  await expect(form.getByLabel('Piece name')).toHaveValue('Pleated lilac skirt');
  await expect(form.getByLabel('Clothing photo')).not.toHaveValue('');
  await form.getByRole('button',{name:'Occasion: Everyday',exact:true}).click();
  const occasions=page.getByRole('dialog',{name:'Choose an occasion',exact:true});
  await occasions.getByRole('button',{name:'Wedding',exact:true}).click();
  await form.getByRole('button',{name:'Add to wardrobe',exact:true}).click();
  await expect(form).toBeHidden();
  await page.reload();
  await page.getByRole('button',{name:'Clothing type: All pieces',exact:true}).click();
  await page.getByRole('button',{name:'Skirt',exact:true}).click();
  const card=page.getByRole('article').filter({hasText:'Pleated lilac skirt'});
  await expect(card).toBeVisible();
  await expect(card).toContainText('Wedding');
  await expect(page.getByRole('button',{name:'Clothing type: Skirt',exact:true})).toBeFocused();
});

test('occasion picker fits the viewport, cancels with Escape and updates the look',async({page})=>{
  await page.goto('/app#stylist');
  const trigger=page.getByRole('button',{name:'Occasion: Everyday',exact:true});
  await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Choose an occasion',exact:true});
  const bounds=await dialog.boundingBox();
  expect(bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('button',{name:'Travel',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Travel edit',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Occasion: Travel',exact:true})).toBeFocused();
});

test('new categories fill outfit slots and prompts recognise specific occasions',async({page})=>{
  await page.goto('/app#studio');
  const result=await page.evaluate(async()=>{
    const {styleLook}=await import('/model.js');
    const {interpretLook}=await import('/look-prompt.js');
    const rows=['blouse','skirt','boots','cardigan','jumpsuit'].map(type=>({id:type,name:type,type,occasion:'Wedding',color:'#aabbcc'}));
    const separates=styleLook(rows.filter(row=>row.type!=='jumpsuit'),'Wedding',[]);
    const onepiece=styleLook(rows,'Wedding',[],0,interpretLook('jumpsuit for a wedding',rows));
    const excluded=styleLook(rows,'Wedding',[],0,interpretLook('blouse and skirt without boots',rows));
    return {separates:separates.pieces.map(row=>row.type),missing:separates.missing,onepiece:onepiece.pieces.map(row=>row.type),excluded:excluded.pieces.map(row=>row.type),occasion:interpretLook('jeans for a concert',rows).occasion};
  });
  expect(result.separates).toEqual(['blouse','skirt','boots','cardigan']);
  expect(result.missing).toEqual([]);
  expect(result.onepiece).toEqual(['jumpsuit','boots','cardigan']);
  expect(result.excluded).not.toContain('boots');
  expect(result.occasion).toBe('Concert');
});
