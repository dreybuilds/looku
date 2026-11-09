import test from 'node:test';
import assert from 'node:assert/strict';
import {earnings} from '../hosting/earnings.mjs';
import {money, summarizeEntries, summarizeOrders} from '../dist/earnings.js';

function bucket() {
  const rows = new Map();
  return {
    rows,
    async get(key) {
      const record = rows.get(key);
      return record ? {etag: record.etag, json: async () => JSON.parse(record.value)} : null;
    },
    async put(key, value, {onlyIf} = {}) {
      const existing = rows.get(key);
      if (onlyIf?.etagDoesNotMatch === '*' && existing || onlyIf?.etagMatches && onlyIf.etagMatches !== existing?.etag) return null;
      const record = {etag: crypto.randomUUID(), value};rows.set(key, record);return record;
    },
    async list({prefix, limit, cursor}) {
      const keys = [...rows.keys()].filter(key => key.startsWith(prefix)).sort();
      const offset = Number(cursor || 0), next = offset + limit;
      return {objects: keys.slice(offset, next).map(key => ({key})), truncated: next < keys.length, cursor: String(next)};
    }
  };
}
const request = (method = 'GET', query = '') => new Request('https://looku.test/api/admin/earnings' + query, {method});
const entry = (values = {}) => ({action: 'record', id: crypto.randomUUID(), kind: 'income', currency: 'KES', amount: '10.10', date: '2026-11-09', description: 'Affiliate payout', ...values});

test('money entries are exact, idempotent and safely voided with history', async () => {
  const store = bucket(), original = entry();
  const attempts = await Promise.all([earnings(request('POST'), store, original), earnings(request('POST'), store, original)]);
  assert.deepEqual(attempts.map(response => response.status).sort(), [200, 201]);
  assert.equal((await earnings(request('POST'), store, {...original, amount: '99'})).status, 409);
  const page = await (await earnings(request(), store)).json();
  assert.equal(page.items.length, 1);assert.equal(page.items[0].amountMinor, '1010');
  const voidEntry = {action: 'void', id: original.id, revision: page.items[0].revision};
  assert.equal((await earnings(request('POST'), store, {...voidEntry, revision: 'stale'})).status, 409);
  assert.equal((await earnings(request('POST'), store, voidEntry)).status, 200);
  assert.equal((await earnings(request('POST'), store, voidEntry)).status, 200);
  assert.equal((await earnings(request('POST'), store, original)).status, 409);
  const history = await (await earnings(request(), store)).json();
  assert.ok(history.items[0].voidedAt);
  assert.equal(summarizeEntries(history.items).KES.income, 0n);
});

test('invalid amounts, currencies, dates and entry actions are rejected', async () => {
  const store = bucket();
  for (const values of [{amount: '0'}, {amount: '-1'}, {amount: '0.001'}, {amount: '1e3'}, {amount: 1}, {currency: 'XLM'}, {kind: 'balance'}, {date: '2026-02-30'}, {description: ''}, {id: '../orders'}, {action: 'delete'}]) {
    assert.equal((await earnings(request('POST'), store, entry(values))).status, 400, JSON.stringify(values));
  }
  assert.equal((await earnings(request('DELETE'), store, {})).status, 405);
  assert.equal((await earnings(request('GET', '?source=secrets'), store)).status, 400);
  assert.equal(store.rows.size, 0);
});

test('all report pages contribute to per-currency profit with exact decimals', async () => {
  const store = bucket();
  for (let i = 0; i < 31; i++) await earnings(request('POST'), store, entry({amount: '0.10'}));
  await earnings(request('POST'), store, entry({kind: 'expense', amount: '0.07'}));
  await earnings(request('POST'), store, entry({currency: 'USD', kind: 'expense', amount: '2.50'}));
  const all = [];let cursor;
  do {
    const page = await (await earnings(request('GET', cursor ? '?cursor=' + cursor : ''), store)).json();
    all.push(...page.items);cursor = page.next;
  } while (cursor);
  assert.equal(all.length, 33);
  const totals = summarizeEntries([...all, all[0]]);
  assert.equal(money(totals.KES.income - totals.KES.expense), '3.03');
  assert.equal(money(totals.USD.income - totals.USD.expense), '−2.50');
});

test('old orders retain fixed terms, pending payments stay separate and private fields are omitted', async () => {
  const store = bucket();
  const legacy = {id: crypto.randomUUID(), status: 'complete', purchaseTx: 'a'.repeat(64), payoutTx: 'b'.repeat(64), purchaseXdr: 'private signed data', address: 'private address'};
  const pending = {id: crypto.randomUUID(), status: 'payout_pending', purchaseTx: 'c'.repeat(64), payoutTx: null};
  const unsigned = {id: crypto.randomUUID(), status: 'awaiting_signature'};
  for (const row of [legacy, pending, unsigned]) await store.put('orders/' + row.id, JSON.stringify(row));
  const page = await (await earnings(request('GET', '?source=orders'), store)).json();
  assert.equal(JSON.stringify(page).includes('private'), false);
  assert.equal(page.items.find(row => row.id === legacy.id).commission, '0.10');
  const totals = summarizeOrders([...page.items, page.items.find(row => row.id === legacy.id)]);
  assert.equal(totals.paidOrders, 2);
  assert.equal(money(totals.sales, 7), '2.0000000');
  assert.equal(money(totals.earned, 7), '0.1000000');
  assert.equal(money(totals.pending, 7), '0.1000000');
  const changed = {...page.items.find(row => row.id === legacy.id), amount: '5.00', commission: '0.75'};
  assert.equal(summarizeOrders([changed]).earned, 7500000n);
});
