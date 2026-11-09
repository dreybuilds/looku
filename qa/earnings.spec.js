import {test, expect} from '@playwright/test';

test('admin records earnings and expenses, sees exact profit and can void mistakes', async ({page, request, baseURL}, info) => {
  expect((await request.get('/api/admin/earnings')).status()).toBe(403);
  expect((await request.post('/api/admin/earnings', {data: {action: 'record'}})).status()).toBe(403);
  const ownerHeaders = {'oai-authenticated-user-email': 'nzauaudrey@gmail.com'};
  await page.setExtraHTTPHeaders(ownerHeaders);
  expect((await page.request.post('/api/admin/earnings', {headers: ownerHeaders, data: {action: 'record'}})).status()).toBe(403);
  expect((await (await page.request.get('/api/account')).json()).address).toBeNull();
  await page.goto('/owner.html');
  await page.getByRole('button', {name: 'View earnings and profit', exact: true}).click();
  await expect(page.getByText(/All pages loaded/)).toBeVisible();
  const prefix = 'QA earnings ' + crypto.randomUUID().slice(0, 8);
  const save = async (kind, amount, description) => {
    await page.getByRole('combobox', {name: 'Entry type', exact: true}).selectOption(kind);
    await page.getByRole('combobox', {name: 'Currency', exact: true}).selectOption('KES');
    await page.getByLabel('Amount', {exact: true}).fill(amount);
    await page.getByLabel('Description', {exact: true}).fill(description);
    await page.getByRole('button', {name: 'Save entry', exact: true}).click();
    await expect(page.getByText('Entry saved. Earnings and profit updated.')).toBeVisible();
  };
  await save('income', '100.10', prefix + ' commission');
  await save('expense', '20.05', prefix + ' hosting');
  const profit = page.locator('article').filter({hasText: 'KES · Recorded profit'});
  await expect(profit.getByRole('heading')).toHaveText('KES 80.05');
  await expect(page.getByRole('heading', {name: 'Testnet referral payouts', exact: true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.addScriptTag({path: 'node_modules/axe-core/axe.min.js'});
  const violations = await page.evaluate(async () => (await axe.run(document.querySelector('main'), {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa']}})).violations.map(row => row.id));
  expect(violations).toEqual([]);
  await page.screenshot({path: '/private/tmp/looku-earnings-' + info.project.name + '.png', fullPage: true});
  page.once('dialog', dialog => dialog.accept());
  await page.locator('article').filter({has: page.getByRole('heading', {name: prefix + ' hosting', exact: true})}).getByRole('button', {name: 'Void entry'}).click();
  await expect(profit.getByRole('heading')).toHaveText('KES 100.10');
  await expect(page.locator('article').filter({has: page.getByRole('heading', {name: prefix + ' hosting', exact: true})})).toContainText('Voided');
  await page.reload();
  await page.getByRole('button', {name: 'Earnings & profit', exact: true}).click();
  await expect(profit.getByRole('heading')).toHaveText('KES 100.10');
  // Keep the shared QA store empty for the next viewport.
  const entries = await (await page.request.get('/api/admin/earnings', {headers: ownerHeaders})).json();
  const income = entries.items.find(entry => entry.description === prefix + ' commission');
  expect((await page.request.post('/api/admin/earnings', {headers: {...ownerHeaders, Origin: baseURL, 'X-Looku-Action': 'admin'}, data: {action: 'void', id: income.id, revision: income.revision}})).status()).toBe(200);
  expect((await page.request.get('/api/admin/earnings', {headers: {'oai-authenticated-user-email': 'visitor@example.org'}})).status()).toBe(403);
});
